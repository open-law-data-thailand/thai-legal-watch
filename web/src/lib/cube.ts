/** Every document's dimensions, in the browser, as typed arrays.
 *
 *  Pre-computing a file per facet means only the questions somebody anticipated can be asked. This
 *  is the other way round: 773,000 rows of small integer codes — half a megabyte over the wire,
 *  seven in memory — over which any combination of filters is a linear scan taking under a
 *  millisecond. Titles are not in it; they are read from the month shards for the rows actually
 *  shown, which is why it stays this small.
 *
 *  A row carries no id. Row i belongs to the month whose range contains it, at that offset within
 *  the shard — the pipeline writes the two in one order and a test checks every row of a build.
 */
export interface CubeMeta {
  rows: number
  /** length of the decompressed blob */
  bytes: number
  encoding?: string
  layout: { name: string; type: 'u8' | 'u16'; offset: number }[]
  months: { m: string; start: number; n: number }[]
  /** per column, code -> value; index 0 is always "none" */
  codes: Record<string, (string | null)[]>
  flags: Record<string, number>
}

export interface Cube {
  meta: CubeMeta
  cols: Record<string, Uint8Array | Uint16Array>
  /** value -> code, for turning a slug, a name or an id into the integer the columns hold */
  index: Record<string, Map<string, number>>
  /** row -> its position in meta.months, so a row resolves to a shard without a search */
  monthOf: Uint16Array
}

export const FLAG_TOPIC = 1
export const FLAG_ACTION = 2
export const FLAG_GOV = 4

/** DATA_CONTRACT.md: headline numbers count corroborated labels only, and the pipeline builds the
 *  topic, agency and province pages that way. The cube has to use the same rule or its counts
 *  disagree with every other page on the site — so a query on one of these three dimensions, and
 *  a count grouped by one of them, both require the corroboration bit. The other dimensions
 *  (province, agency, document type, date) are read off the record and have no such bit. */
const NEEDS_FLAG: Record<string, number> = { topic: FLAG_TOPIC, action: FLAG_ACTION, gov: FLAG_GOV }

export class CubeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CubeError'
  }
}

/** Wrap the raw bytes in typed-array views. No copying: the columns are windows onto the blob. */
export function buildCube(meta: CubeMeta, blob: ArrayBuffer): Cube {
  if (blob.byteLength !== meta.bytes)
    throw new CubeError(`cube.bin is ${blob.byteLength} bytes, cube.json says ${meta.bytes}`)
  const cols: Record<string, Uint8Array | Uint16Array> = {}
  for (const c of meta.layout) {
    const width = c.type === 'u16' ? 2 : 1
    if (c.offset + meta.rows * width > blob.byteLength)
      throw new CubeError(`cube column ${c.name} runs past the end of cube.bin`)
    cols[c.name] =
      c.type === 'u16'
        ? new Uint16Array(blob, c.offset, meta.rows)
        : new Uint8Array(blob, c.offset, meta.rows)
  }
  const index: Record<string, Map<string, number>> = {}
  for (const [name, table] of Object.entries(meta.codes)) {
    const m = new Map<string, number>()
    table.forEach((v, i) => {
      if (v !== null) m.set(v, i)
    })
    index[name] = m
  }
  const monthOf = new Uint16Array(meta.rows)
  meta.months.forEach((m, i) => monthOf.fill(i, m.start, m.start + m.n))
  return { meta, cols, index, monthOf }
}

export interface CubeFilter {
  /** a topic and everything under it — resolved to codes by the caller, since only it has the
   *  taxonomy; a waste rule is an environment document too. Matching requires the topic to be
   *  corroborated, which is how the rest of the site counts. */
  topics?: number[]
  action?: string
  gov?: string
  prov?: string
  dtype?: string
  agency?: string
  /** inclusive ISO dates */
  from?: string
  to?: string
  /** one publication date, which is how a click on the home sparkline arrives */
  day?: string
}

/** Codes resolved once per query instead of once per row. A filter naming something the corpus
 *  has never seen must return nothing, not everything — hence `impossible`. */
interface Compiled {
  impossible: boolean
  topics: Uint8Array | null
  action: number
  gov: number
  prov: number
  dtype: number
  agency: number
}

function compile(cube: Cube, f: CubeFilter): Compiled {
  const code = (dim: string, v: string | undefined) => (v ? (cube.index[dim]?.get(v) ?? -1) : 0)
  // a lookup table rather than a Set: topic codes are u8, so membership is one array read
  let topics: Uint8Array | null = null
  if (f.topics) {
    topics = new Uint8Array(256)
    for (const t of f.topics) if (t > 0 && t < 256) topics[t] = 1
  }
  const c: Compiled = {
    impossible: f.topics?.length === 0,
    topics,
    action: code('action', f.action),
    gov: code('gov', f.gov),
    prov: code('prov', f.prov),
    dtype: code('dtype', f.dtype),
    agency: code('agency', f.agency),
  }
  if ([c.action, c.gov, c.prov, c.dtype, c.agency].includes(-1)) c.impossible = true
  return c
}

/** Day codes are assigned in the order days are met, not in date order, so a range cannot be a
 *  numeric comparison. One pass over the (few thousand) distinct days builds a lookup instead. */
function dayMask(cube: Cube, f: CubeFilter): Uint16Array | null {
  if (!f.from && !f.to && !f.day) return null
  const days = cube.meta.codes['day'] ?? []
  const mask = new Uint16Array(days.length)
  const from = f.day ?? f.from
  const to = f.day ?? f.to
  for (let i = 1; i < days.length; i++) {
    const d = days[i]
    if (!d) continue
    if (from && d < from) continue
    if (to && d > to) continue
    mask[i] = 1
  }
  return mask
}

export interface CubeResult {
  total: number
  /** matching rows, newest first, capped — nothing renders 700,000 of them */
  rows: number[]
  /** code -> count, per dimension asked for */
  groups: Record<string, Map<number, number>>
}

/**
 * One pass over the columns: the count, any group-bys, and the newest `limit` matching rows.
 *
 * Rows run oldest to newest (the shards do), so the scan runs backwards — which also means the
 * cap keeps the most recent matches rather than the oldest ones.
 */
export function queryCube(
  cube: Cube,
  filter: CubeFilter,
  opts: { groupBy?: string[]; limit?: number } = {},
): CubeResult {
  const groups: Record<string, Map<number, number>> = {}
  for (const g of opts.groupBy ?? []) groups[g] = new Map()
  const c = compile(cube, filter)
  if (c.impossible) return { total: 0, rows: [], groups }

  const mask = dayMask(cube, filter)
  const limit = opts.limit ?? 200
  const topic = cube.cols['topic']
  const action = cube.cols['action']
  const gov = cube.cols['gov']
  const prov = cube.cols['prov']
  const dtype = cube.cols['dtype']
  const agency = cube.cols['agency']
  const day = cube.cols['day']
  const flags = cube.cols['flags']
  if (!topic || !action || !gov || !prov || !dtype || !agency || !day || !flags)
    throw new CubeError('cube.bin is missing a column the query needs')
  const into = (opts.groupBy ?? []).map((g) => {
    const col = cube.cols[g]
    if (!col) throw new CubeError(`cannot group by ${g}: no such column`)
    return [col, groups[g], NEEDS_FLAG[g] ?? 0] as const
  })
  const rows: number[] = []
  let total = 0

  for (let i = cube.meta.rows - 1; i >= 0; i--) {
    const fl = flags[i]
    if (c.topics && (!c.topics[topic[i]] || !(fl & FLAG_TOPIC))) continue
    if (c.action && (action[i] !== c.action || !(fl & FLAG_ACTION))) continue
    if (c.gov && (gov[i] !== c.gov || !(fl & FLAG_GOV))) continue
    if (c.prov && prov[i] !== c.prov) continue
    if (c.dtype && dtype[i] !== c.dtype) continue
    if (c.agency && agency[i] !== c.agency) continue
    if (mask && !mask[day[i]]) continue
    total++
    if (rows.length < limit) rows.push(i)
    for (const [col, m, need] of into) {
      if (need && !(fl & need)) continue
      const k = col[i]
      if (k) m.set(k, (m.get(k) ?? 0) + 1)
    }
  }
  return { total, rows, groups }
}

/** Which shard holds the document a row describes, and where in it. */
export function rowLocation(cube: Cube, row: number): { month: string; offset: number } | null {
  const at = cube.monthOf[row]
  const m = at === undefined ? undefined : cube.meta.months[at]
  if (!m || row < m.start || row >= m.start + m.n) return null
  return { month: m.m, offset: row - m.start }
}

export interface FetchPlan {
  /** the shards to read, newest first */
  months: string[]
  /** rows those shards can resolve, in the order they were given */
  rows: number[]
  /** rows left over because the shard budget ran out */
  rest: number[]
}

/**
 * Titles live in the month shards, and a shard is up to 10 MB. A narrow filter — one topic in one
 * province — can have its fifty newest matches spread over fifty different months, so resolving a
 * page of results naively would download half a gigabyte. This picks the shards the earliest rows
 * need, stops at `maxShards`, and hands back what it could not reach so the caller can offer to
 * fetch more rather than pretend those documents do not exist.
 */
export function planFetch(cube: Cube, rows: number[], maxShards: number): FetchPlan {
  const months: string[] = []
  const take: number[] = []
  const rest: number[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const loc = rowLocation(cube, r)
    if (!loc) continue
    if (!seen.has(loc.month)) {
      if (seen.size >= maxShards) {
        rest.push(r)
        continue
      }
      seen.add(loc.month)
      months.push(loc.month)
    }
    take.push(r)
  }
  return { months, rows: take, rest }
}

export const codeName = (cube: Cube, dim: string, code: number): string | null =>
  cube.meta.codes[dim]?.[code] ?? null

export const codeOf = (cube: Cube, dim: string, value: string): number | undefined =>
  cube.index[dim]?.get(value)

/** Counts keyed by code turned back into counts keyed by the value a page shows. */
export function named(cube: Cube, dim: string, counts: ReadonlyMap<number, number>): Map<string, number> {
  const out = new Map<string, number>()
  for (const [code, n] of counts) {
    const name = codeName(cube, dim, code)
    if (name) out.set(name, n)
  }
  return out
}
