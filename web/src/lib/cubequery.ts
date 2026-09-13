/** What สำรวจ asks the cube: every facet's counts with its own filter lifted, in as few passes
 *  over the columns as the question actually needs.
 *
 *  The rule a faceted browser has to follow is that a number beside an option answers "what would
 *  I get if I chose this", not "what did I already get" — so each dimension is counted with its
 *  own filter removed and every other filter applied. Done naively that is one scan per
 *  dimension. But two dimensions whose filters are both absent need *the same* scan, so passes
 *  are grouped by the filter they need and each group counts several dimensions at once. With
 *  nothing selected — the common case — the whole page is one pass.
 *
 *  The cube knows nothing about the taxonomy: it stores one topic code per document. Turning that
 *  into "how many are under สิ่งแวดล้อม" means rolling each count up through its ancestors, which
 *  is what the pipeline does when it builds the topic pages, so the two numbers agree.
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
  counts: ReadonlyMap<number, number>,
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
  /** each counted with its own filter lifted and every other filter kept */
  topics: Map<string, number>
  actions: Map<string, number>
  govs: Map<string, number>
  provinces: Map<string, number>
  dtypes: Map<string, number>
  agencies: Map<string, number>
  /** days inside the chosen period, with the day filter lifted */
  days: Map<string, number>
  /** whole-archive counts per month and per year, with the period lifted as well — this is what
   *  makes the period dropdowns answer "where else would this filter find something" */
  months: Map<string, number>
  years: Map<string, number>
  /** the population the topic chips are counted over: corroborated topics only, so the chips sum
   *  to it exactly */
  topicTotal: number
}

/** shared so the empty case allocates nothing and keeps its element types */
const NO_COUNTS: ReadonlyMap<number, number> = new Map<number, number>()

/** A filter with its unset fields removed. Callers build these from form state, so an unchosen
 *  dropdown arrives as `action: undefined` — and `{action: undefined}` is not the same object as
 *  `{}` to anything comparing them, which silently cost this file its whole optimisation. */
const compact = (f: CubeFilter): CubeFilter =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== null && v !== ''))

/** The same filter with some keys lifted. */
function lift(f: CubeFilter, keys: (keyof CubeFilter)[]): CubeFilter {
  const drop = new Set<string>(keys)
  return Object.fromEntries(Object.entries(f).filter(([k]) => !drop.has(k)))
}

/** A stable identity for a filter, so two dimensions needing the same one share a scan. */
const signature = (f: CubeFilter): string => {
  const parts = Object.entries(compact(f))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([k, v]) =>
        `${k}=${Array.isArray(v) ? [...(v as number[])].sort((x, y) => x - y).join('.') : String(v)}`,
    )
  return parts.join('&')
}

/** `days` reads the real publication dates; `months` and `years` read the shard a row sits in,
 *  because those two feed the period dropdowns and a number beside "เดือน 2556-11" has to mean
 *  what opening that month will actually show. The two differ for 160 of 732,143 documents whose
 *  publication date falls outside the file they are published in. */
const colOf = (dim: string) => (dim === 'days' ? 'day' : dim === 'months' || dim === 'years' ? 'shard' : dim)

export interface Want {
  dim: string
  filter: CubeFilter
}

/** Requests that need the same filter are one scan counting several dimensions. Exported because
 *  this is the whole optimisation: with nothing selected, nine requests collapse to one pass. */
export function groupPasses(wants: Want[]): { filter: CubeFilter; dims: string[] }[] {
  const groups = new Map<string, { filter: CubeFilter; dims: string[] }>()
  for (const w of wants) {
    const k = signature(w.filter)
    const g = groups.get(k)
    if (g) g.dims.push(w.dim)
    else groups.set(k, { filter: w.filter, dims: [w.dim] })
  }
  return [...groups.values()]
}

function passes(cube: Cube, wants: Want[]): Map<string, ReadonlyMap<number, number>> {
  const out = new Map<string, ReadonlyMap<number, number>>()
  for (const { filter, dims } of groupPasses(wants)) {
    const r = queryCube(cube, filter, { groupBy: [...new Set(dims.map(colOf))], limit: 0 })
    for (const dim of dims) out.set(dim, r.groups[colOf(dim)] ?? NO_COUNTS)
  }
  return out
}

/** Keys grouped to a shorter prefix: 7 characters for a month, 4 for a year. Works for both the
 *  date column (YYYY-MM-DD) and the shard column (YYYY-MM). */
function bucket(
  cube: Cube,
  dim: string,
  counts: ReadonlyMap<number, number>,
  width: number,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const [key, n] of named(cube, dim, counts)) {
    const k = key.slice(0, width)
    out.set(k, (out.get(k) ?? 0) + n)
  }
  return out
}

export function crossFilter(
  cube: Cube,
  tax: Taxonomy | undefined,
  f: CubeFilter,
  limit: number,
): CrossFilter {
  const base = compact(f)
  const main = queryCube(cube, base, { limit })
  // `day` is lifted for the day list; the whole period is lifted for the month and year lists,
  // because "which other months would this filter find something in" is what they answer
  const got = passes(cube, [
    { dim: 'topic', filter: lift(base, ['topics']) },
    { dim: 'action', filter: lift(base, ['action']) },
    { dim: 'gov', filter: lift(base, ['gov']) },
    { dim: 'prov', filter: lift(base, ['prov']) },
    { dim: 'dtype', filter: lift(base, ['dtype']) },
    { dim: 'agency', filter: lift(base, ['agency']) },
    { dim: 'days', filter: lift(base, ['day']) },
    { dim: 'months', filter: lift(base, ['day', 'from', 'to', 'shards']) },
    { dim: 'years', filter: lift(base, ['day', 'from', 'to', 'shards']) },
  ])
  const topic = got.get('topic') ?? NO_COUNTS
  return {
    total: main.total,
    rows: main.rows,
    topics: rollUp(cube, tax, topic),
    topicTotal: [...topic.values()].reduce((s, n) => s + n, 0),
    actions: named(cube, 'action', got.get('action') ?? NO_COUNTS),
    govs: named(cube, 'gov', got.get('gov') ?? NO_COUNTS),
    provinces: named(cube, 'prov', got.get('prov') ?? NO_COUNTS),
    dtypes: named(cube, 'dtype', got.get('dtype') ?? NO_COUNTS),
    agencies: named(cube, 'agency', got.get('agency') ?? NO_COUNTS),
    days: bucket(cube, 'day', got.get('days') ?? NO_COUNTS, 10),
    months: bucket(cube, 'shard', got.get('months') ?? NO_COUNTS, 7),
    years: bucket(cube, 'shard', got.get('years') ?? NO_COUNTS, 4),
  }
}
