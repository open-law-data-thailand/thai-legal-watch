/** What สำรวจ asks the cube: every facet's counts with its own filter lifted, in one place.
 *
 *  The cube knows nothing about the taxonomy — it stores one topic code per document. Turning that
 *  into "how many documents are under สิ่งแวดล้อม" means rolling each count up through its
 *  ancestors, which is exactly what the pipeline does when it builds the topic pages, so the two
 *  numbers agree.
 */
import type { Taxonomy } from '../data/types'
import { type Cube, type CubeFilter, named, queryCube } from './cube'

/** A topic and everything below it, as cube codes. Slugs the corpus has never used are dropped;
 *  an empty result means "this topic exists in the taxonomy but no document carries it", which
 *  must show nothing rather than everything. */
export function descendantCodes(cube: Cube, tax: Taxonomy | undefined, slug: string): number[] {
  const out: number[] = []
  const seen = new Set<string>()
  const stack = [slug]
  while (stack.length) {
    const s = stack.pop()
    if (!s || seen.has(s)) continue
    seen.add(s)
    const code = cube.index['topic']?.get(s)
    if (code !== undefined) out.push(code)
    for (const child of tax?.topics[s]?.children ?? []) stack.push(child)
  }
  return out
}

/** Counts per topic code become counts per slug, each document counted for its topic and every
 *  ancestor of it — a waste rule is a pollution document and an environment document. */
export function rollUp(
  cube: Cube,
  tax: Taxonomy | undefined,
  counts: Map<number, number>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const [slug, n] of named(cube, 'topic', counts))
    for (let cur: string | null = slug; cur; cur = tax?.topics[cur]?.parent ?? null)
      out.set(cur, (out.get(cur) ?? 0) + n)
  return out
}

export interface CrossFilter {
  /** documents matching every filter */
  total: number
  /** the newest matches, as row numbers */
  rows: number[]
  /** each of these is counted with its own filter lifted, so a dropdown can say what choosing a
   *  different value would give rather than what the current one already gave */
  topics: Map<string, number>
  actions: Map<string, number>
  govs: Map<string, number>
  provinces: Map<string, number>
  dtypes: Map<string, number>
  /** matches per year, for a filter too sparse to list from a handful of month shards: the count
   *  is exact for the whole archive even when the list below it cannot be */
  years: Map<string, number>
  /** how many the topic chips are counted over — the "ทุกหมวด" number, corroborated topics only */
  topicTotal: number
}

/** The same filter with one dimension lifted, so that dimension's own options can be counted. */
const without = (f: CubeFilter, key: keyof CubeFilter): CubeFilter =>
  Object.fromEntries(Object.entries(f).filter(([k]) => k !== key))

/**
 * Six passes over the columns — one for the result and one per open dimension. Each is a linear
 * scan of ~773,000 bytes per column touched, which measures at well under a millisecond, so the
 * whole thing is cheaper than the render it feeds.
 */
export function crossFilter(
  cube: Cube,
  tax: Taxonomy | undefined,
  f: CubeFilter,
  limit: number,
): CrossFilter {
  const main = queryCube(cube, f, { groupBy: ['day'], limit })
  const years = new Map<string, number>()
  for (const [date, n] of named(cube, 'day', main.groups['day'] ?? new Map()))
    years.set(date.slice(0, 4), (years.get(date.slice(0, 4)) ?? 0) + n)
  const topicPass = queryCube(cube, without(f, 'topics'), { groupBy: ['topic'], limit: 0 })
  return {
    total: main.total,
    rows: main.rows,
    years,
    topics: rollUp(cube, tax, topicPass.groups['topic'] ?? new Map()),
    // the chips count corroborated topics only, so "ทุกหมวด" has to be that same population or
    // the numbers beside the chips add up to more than the total above them
    topicTotal: [...(topicPass.groups['topic'] ?? new Map<number, number>()).values()].reduce(
      (s, n) => s + n,
      0,
    ),
    actions: named(
      cube,
      'action',
      queryCube(cube, without(f, 'action'), { groupBy: ['action'], limit: 0 }).groups['action'] ?? new Map(),
    ),
    govs: named(
      cube,
      'gov',
      queryCube(cube, without(f, 'gov'), { groupBy: ['gov'], limit: 0 }).groups['gov'] ?? new Map(),
    ),
    provinces: named(
      cube,
      'prov',
      queryCube(cube, without(f, 'prov'), { groupBy: ['prov'], limit: 0 }).groups['prov'] ?? new Map(),
    ),
    dtypes: named(
      cube,
      'dtype',
      queryCube(cube, without(f, 'dtype'), { groupBy: ['dtype'], limit: 0 }).groups['dtype'] ?? new Map(),
    ),
  }
}
