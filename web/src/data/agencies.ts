/** `index/agencies.json` is the one index every page that names an agency has to load, so it is
 *  stored small: names sorted, each keeping only what it does not share with the name above it.
 *  Decoding it here means the routes keep receiving the `AgencyIndexItem[]` they always had. */
import type { AgencyIndexFile, AgencyIndexItem } from './types'

/** Stored shape → `AgencyIndexItem[]`, most documents first, which is the order callers built on.
 *  An array is passed through untouched: that is what builds before this encoding wrote, and a
 *  reader may still have one cached when a new build lands. */
export function decodeAgencies(blob: AgencyIndexFile | AgencyIndexItem[]): AgencyIndexItem[] {
  if (Array.isArray(blob)) return blob
  const { id, name, n, min_page: minPage } = blob
  const out: AgencyIndexItem[] = []
  let prev = ''
  for (let i = 0; i < name.length; i++) {
    const packed = name[i]
    const bar = packed.indexOf('|')
    // the length marker is always written, so a name that itself contains "|" decodes correctly
    const full = prev.slice(0, Number(packed.slice(0, bar))) + packed.slice(bar + 1)
    prev = full
    const count = n[i]
    out.push(
      count >= minPage
        ? { id: id[i], name: full, n: count, page: true }
        : { id: id[i], name: full, n: count },
    )
  }
  out.sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return out
}
