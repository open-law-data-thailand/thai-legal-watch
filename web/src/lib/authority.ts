/** Who is responsible for a subject, and how far that responsibility is spread.
 *
 *  The archive answers a question people actually arrive with — "this concerns my business, whose
 *  rules am I under?" — and the answer is not always one body. Public health carries two and a
 *  half thousand issuing authorities across six thousand documents, because every municipality
 *  writes its own ordinance; foreign affairs carries one. A reader deserves to be told which of
 *  those two situations they are in before they start reading.
 *
 *  Everything here is a pure function over counts the facet pages already carry, so the page
 *  costs no extra request to answer it.
 */

export interface Counted {
  id?: string
  name: string
  n: number
}

export interface Share extends Counted {
  /** of the whole, 0–1 */
  share: number
}

/** Largest first, with each one's share of `total`. Entries with no documents are dropped. */
export function shares(rows: readonly Counted[], total: number): Share[] {
  if (total <= 0) return []
  return rows
    .filter((r) => r.n > 0)
    .map((r) => ({ ...r, share: r.n / total }))
    .sort((a, b) => b.n - a.n)
}

export interface Spread {
  /** the largest single share, 0–1 */
  top: number
  /** how many entries it takes to pass `upto` — null when the list given does not get there */
  needed: number | null
  /** what fraction of the whole the given list accounts for at all */
  covered: number
  /** entries in the list that have any documents */
  listed: number
}

/** How concentrated a subject is: one authority, a handful, or a very long tail.
 *
 *  `needed` is null rather than a guess when the rows run out first. The facet pages carry the
 *  fifty largest agencies, so a subject spread across thousands genuinely cannot be summarised
 *  from them — and saying "50" there would be a lie shaped like a fact. */
export function spread(rows: readonly Counted[], total: number, upto = 0.8): Spread {
  const s = shares(rows, total)
  const covered = s.reduce((a, r) => a + r.share, 0)
  let run = 0
  let needed: number | null = null
  for (let i = 0; i < s.length; i++) {
    run += s[i]?.share ?? 0
    if (run >= upto) {
      needed = i + 1
      break
    }
  }
  return { top: s[0]?.share ?? 0, needed, covered, listed: s.length }
}

/** A one-line reading of a Spread, for a reader who wants the answer rather than the numbers.
 *  `authorities` is the true distinct count when it is known — the lists are trimmed, the count
 *  is not — and the phrasing leans on it rather than on the length of the list. */
export function verdict(sp: Spread, authorities?: number): string {
  if (sp.listed === 0) return 'ยังไม่มีหน่วยงานที่ระบุได้สำหรับเรื่องนี้'
  if (authorities === 1 || (sp.listed === 1 && authorities === undefined)) return 'เรื่องนี้มีเจ้าภาพรายเดียว'
  const pct = Math.round(sp.top * 100)
  const many = authorities !== undefined && authorities > 50
  if (sp.needed === 1) return `กระจุกอยู่ที่รายเดียว — รายใหญ่สุดคิดเป็น ${pct}% ของเรื่องนี้`
  if (sp.needed !== null) return `ต้องรวม ${sp.needed} หน่วยงานจึงครบ 80% ของเรื่องนี้ — รายใหญ่สุด ${pct}%`
  return many
    ? `กระจายมาก — รายใหญ่สุดคิดเป็นเพียง ${pct}% และรายการนี้แสดงเพียง 50 อันดับแรก`
    : `กระจาย — รายใหญ่สุดคิดเป็น ${pct}% และยังไม่ถึง 80% เมื่อรวมทั้งรายการ`
}
