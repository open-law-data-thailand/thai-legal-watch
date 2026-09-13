/** Thai-language helpers: dates, numerals, gazette coordinates, citations. */

const TH_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]
const TH_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

export function parseISODate(s: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const y = Number(m[1]),
    mo = Number(m[2]),
    d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

/** 2024-03-29 → "29 มีนาคม 2567" (Buddhist year). */
export function thaiDate(s: string | null | undefined, opts: { short?: boolean } = {}): string {
  const p = parseISODate(s)
  if (!p) return '—'
  const months = opts.short ? TH_MONTHS_SHORT : TH_MONTHS
  return `${p.d} ${months[p.m - 1]} ${p.y + 543}`
}

export function beYear(gregorian: number | string): number {
  return Number(gregorian) + 543
}

/** A share, or a dash. Rendering "NaN%" because a denominator was briefly zero is worse than
 *  admitting there is nothing to divide yet. */
export function percent(part: number, whole: number, digits = 0): string {
  if (!whole || !Number.isFinite(part / whole)) return '—'
  const p = (100 * part) / whole
  return `${p > 99 && p < 100 ? p.toFixed(Math.max(1, digits)) : p.toFixed(digits)}%`
}

/** The Buddhist span of a year list, or a dash when the list is empty. */
export function beRange(years: readonly string[] | undefined): string {
  const first = years?.[0]
  const last = years?.[years.length - 1]
  if (!first || !last) return '—'
  return first === last ? `${beYear(first)}` : `${beYear(first)}–${beYear(last)}`
}

/** "2026-09" → "2569-09" — the same shard name, in the year Thai readers actually use. */
export function beMonth(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  return m ? `${Number(m[1]) + 543}-${m[2]}` : month
}

/** Arabic → Thai numerals, for the citation format lawyers expect. */
export function thaiDigits(n: number | string): string {
  return String(n).replace(/\d/g, (c) => '๐๑๒๓๔๕๖๗๘๙'[Number(c)] ?? c)
}

export interface Coordinates {
  volume: number | null
  part: string | null
  page: number | null
  date: string | null
}

/** "เล่ม 141 ตอนพิเศษ 211 ง หน้า 4" — the way the gazette prints it. */
export function coordinates(c: Coordinates): string {
  const parts: string[] = []
  if (c.volume) parts.push(`เล่ม ${c.volume}`)
  if (c.part) parts.push(partLabel(c.part))
  if (c.page) parts.push(`หน้า ${c.page}`)
  return parts.join(' ')
}

/** "211 ง พิเศษ" → "ตอนพิเศษ 211 ง"; "17 ก" → "ตอนที่ 17 ก". */
export function partLabel(part: string): string {
  const special = /พิเศษ/.test(part)
  const rest = part.replace(/พิเศษ/g, '').replace(/\s+/g, ' ').trim()
  return special ? `ตอนพิเศษ ${rest}` : `ตอนที่ ${rest}`
}
