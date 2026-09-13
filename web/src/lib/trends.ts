/** Turning per-year counts into the two things a reader of the gazette actually asks:
 *  what is growing, and when in the year does the work land. */
import type { Trends, Years } from '../data/types'

export interface Move {
  key: string
  before: number
  after: number
  change: number
  /** +0.42 = up 42%. Null when there was nothing to grow from. */
  ratio: number | null
}

/** The current year is always partial, so it is excluded: comparing eight months against twelve
 *  would invent a collapse in every category. */
export function completeYears(years: string[], latestDate: string | null): string[] {
  const partial = latestDate?.slice(0, 4)
  const done = partial ? years.filter((y) => y < partial) : [...years]
  return done
}

/** How small a base still deserves a percentage. Below it, "1 → 384" is not a 38,300% rise, it is
 *  a category that did not exist, and printing the number would be worse than printing nothing. */
export const RATIO_FLOOR = 50

/** Compare the last `window` complete years against the `window` before them, ranked by how many
 *  documents actually moved. Ranking by percentage instead puts every brand-new category on top
 *  and buries the subject that went from two thousand documents to six thousand. */
export function movers(
  series: Record<string, number[]>,
  years: string[],
  complete: string[],
  window = 3,
  floor = 200,
): Move[] {
  const idx = (y: string) => years.indexOf(y)
  const recent = complete
    .slice(-window)
    .map(idx)
    .filter((i) => i >= 0)
  const prior = complete
    .slice(-2 * window, -window)
    .map(idx)
    .filter((i) => i >= 0)
  if (!recent.length || !prior.length) return []
  const out: Move[] = []
  for (const [key, xs] of Object.entries(series)) {
    const after = recent.reduce((s, i) => s + (xs[i] ?? 0), 0)
    const before = prior.reduce((s, i) => s + (xs[i] ?? 0), 0)
    if (before < floor && after < floor) continue
    out.push({
      key,
      before,
      after,
      change: after - before,
      ratio: before >= RATIO_FLOOR ? (after - before) / before : null,
    })
  }
  return out.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
}

/** Documents per calendar month across every year: the gazette has a September. */
export function monthProfile(years: Years): { month: number; n: number }[] {
  const out = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, n: 0 }))
  for (const [ym, n] of Object.entries(years.by_month)) {
    const m = Number(ym.slice(5, 7))
    const row = out[m - 1]
    if (row) row.n += n
  }
  return out
}

/** This year so far against the same months of the year before — the only honest year-on-year. */
export function yearToDate(
  years: Years,
  latestDate: string | null,
): { year: string; now: number; then: number; months: number } | null {
  if (!latestDate) return null
  const year = latestDate.slice(0, 4)
  const upTo = latestDate.slice(5, 7)
  const prev = String(Number(year) - 1)
  let now = 0
  let then = 0
  let months = 0
  for (const [ym, n] of Object.entries(years.by_month)) {
    const mm = ym.slice(5, 7)
    if (mm > upTo) continue
    if (ym.startsWith(year)) {
      now += n
      months++
    } else if (ym.startsWith(prev)) then += n
  }
  return { year, now, then, months }
}

export const sumAt = (t: Trends, group: keyof Omit<Trends, 'years'>, keys: string[], year: string) => {
  const i = t.years.indexOf(year)
  if (i < 0) return 0
  return keys.reduce((s, k) => s + (t[group][k]?.[i] ?? 0), 0)
}

/** One year against the year before it, ranked by how many documents moved.
 *
 *  `movers` compares three years against three, which is the right window for "what is changing
 *  in the gazette" but the wrong answer to "what changed in 2568" — and a page that lets a reader
 *  pick a year has to answer the second. The floor is lower here because one year holds a third
 *  of the documents three do.
 */
export function yearOverYear(
  series: Record<string, number[]>,
  years: string[],
  year: string,
  floor = 60,
): Move[] {
  const i = years.indexOf(year)
  if (i < 1) return []
  const out: Move[] = []
  for (const [key, xs] of Object.entries(series)) {
    const after = xs[i] ?? 0
    const before = xs[i - 1] ?? 0
    if (before < floor && after < floor) continue
    out.push({
      key,
      before,
      after,
      change: after - before,
      ratio: before >= RATIO_FLOOR ? (after - before) / before : null,
    })
  }
  return out.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
}
