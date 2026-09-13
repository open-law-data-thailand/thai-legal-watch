/** Split a title into plain/marked segments for a whitespace-insensitive query. */
export type Segment = { text: string; hit: boolean }

export function highlight(title: string, query: string | undefined): Segment[] {
  const q = (query ?? '').replace(/\s+/g, '')
  if (!q) return [{ text: title, hit: false }]
  // map every non-space character of the title back to its original index
  const idx: number[] = []
  let stripped = ''
  for (let i = 0; i < title.length; i++) {
    if (!/\s/.test(title[i] ?? '')) {
      idx.push(i)
      stripped += title[i]
    }
  }
  const out: Segment[] = []
  let cursor = 0
  let from = 0
  for (;;) {
    const at = stripped.indexOf(q, from)
    if (at < 0) break
    const start = idx[at] ?? 0
    const end = (idx[at + q.length - 1] ?? start) + 1
    if (start > cursor) out.push({ text: title.slice(cursor, start), hit: false })
    out.push({ text: title.slice(start, end), hit: true })
    cursor = end
    from = at + q.length
  }
  if (cursor < title.length) out.push({ text: title.slice(cursor), hit: false })
  return out
}
