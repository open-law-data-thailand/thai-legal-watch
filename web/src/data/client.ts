/** Typed fetch layer over the static data contract. One in-memory cache per path. */
import type {
  AgencyIndexFile,
  AgencyIndexItem,
  AgencyPage,
  Bankruptcy,
  Graph,
  Home,
  Latest,
  Meta,
  ProvinceIndexItem,
  ProvincePage,
  SlimDoc,
  Taxonomy,
  TopicIndexItem,
  TopicPage,
  Trends,
  Years,
} from './types'
import { decodeAgencies } from './agencies'
import { CONTRACT } from './types'
import { pickByPage } from '../lib/coords'
import type { Cube } from '../lib/cube'
import { fetchCube } from '../lib/cubestore'

export class DataError extends Error {
  readonly path: string
  readonly status: number | undefined
  constructor(message: string, path: string, status?: number) {
    super(message)
    this.name = 'DataError'
    this.path = path
    this.status = status
  }
}

export interface ClientOptions {
  baseUrl?: string
  source?: string
  fetchImpl?: typeof fetch
}

export interface SourceInfo {
  id: string
  title: string
  credit: string
  url: string
  docs: number
  latest_date: string | null
  generated_at: string
}

export class DataClient {
  private readonly base: string
  private readonly root: string
  readonly source: string
  private readonly f: typeof fetch
  private readonly cache = new Map<string, Promise<unknown>>()
  /** Aggregates are small and asked for constantly; month shards are up to 10 MB parsed and are
   *  usually read once. Keeping every one of them is how a long browse ends up holding a hundred
   *  megabytes, so the oldest shards are evicted once there are more than this many. */
  private agencyIndex?: Promise<AgencyIndexItem[]>
  private readonly shards: string[] = []
  private static readonly MAX_SHARDS = 6

  constructor(opts: ClientOptions = {}) {
    this.root = (opts.baseUrl ?? '/data').replace(/\/$/, '')
    this.source = opts.source ?? 'ratchakitcha'
    this.base = `${this.root}/${encodeURIComponent(this.source)}`
    this.f = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  get<T>(path: string): Promise<T> {
    return this.getAbs(`${this.base}/${path}`)
  }

  private getAbs<T>(url: string): Promise<T> {
    const path = url
    const hit = this.cache.get(path)
    if (hit) return hit as Promise<T>
    const p = this.f(url)
      .then(async (r) => {
        if (!r.ok) throw new DataError(`${r.status} for ${path}`, path, r.status)
        // a static host answers an unknown path with the SPA's index.html (200, text/html)
        if (!(r.headers.get('content-type') ?? '').includes('json'))
          throw new DataError(`no data at ${path}`, path, 404)
        return (await r.json()) as T
      })
      .catch((e: unknown) => {
        this.cache.delete(path)
        throw e instanceof DataError ? e : new DataError(String(e), path)
      })
    this.cache.set(path, p)
    if (/\/docs\/\d{4}\/[\d-]+\.json$/.test(path)) {
      this.shards.push(path)
      while (this.shards.length > DataClient.MAX_SHARDS) {
        const old = this.shards.shift()
        if (old && old !== path) this.cache.delete(old)
      }
    }
    return p
  }

  /** Every source in this build, from the data root. Nothing calls this yet: it is the hook the
   *  planned source switcher needs (docs/HANDOFF.md, plan item 6), and the shape it returns is
   *  what the pipeline already writes. */
  sources(): Promise<{ contract: number; sources: SourceInfo[] }> {
    return this.getAbs(`${this.root}/sources.json`)
  }

  async meta(): Promise<Meta> {
    const m = await this.get<Meta>('agg/meta.json')
    if (m.contract !== CONTRACT) throw new DataError(`unknown data contract ${m.contract}`, 'agg/meta.json')
    return m
  }
  taxonomy(): Promise<Taxonomy> {
    return this.get('agg/taxonomy.json')
  }
  latest(): Promise<Latest> {
    return this.get('agg/latest.json')
  }
  home(): Promise<Home> {
    return this.get('agg/home.json')
  }
  years(): Promise<Years> {
    return this.get('agg/years.json')
  }
  trends(): Promise<Trends> {
    return this.get('agg/trends.json')
  }
  volume(volume: number): Promise<{ volume: number; parts: Record<string, string[]> }> {
    return this.get(`index/volumes/${volume}.json`)
  }

  /** เล่ม/ตอน/หน้า → the document that starts at or before that page in that ตอน. */
  async byCitation(c: {
    volume: number
    part: string
    page: number | null
  }): Promise<{ doc: SlimDoc; month: string } | null> {
    const v = await this.volume(c.volume).catch(() => null)
    const months = v?.parts[c.part] ?? []
    const candidates: { doc: SlimDoc; month: string }[] = []
    for (const m of months) {
      const docs = await this.month(m.slice(0, 4), m)
      for (const d of docs) if (d.v === c.volume && d.p === c.part) candidates.push({ doc: d, month: m })
    }
    const pick = pickByPage(
      candidates.map((x) => ({ ...x, pg: x.doc.pg })),
      c.page,
    )
    return pick ? { doc: pick.doc, month: pick.month } : null
  }

  /** The whole corpus's dimensions as typed arrays, for filtering that no pre-built facet file
   *  anticipated. Memoised on the same map as everything else, so the several components that
   *  want it share one download. The version is the build stamp: it is what lets the browser keep
   *  a copy between visits and still notice the nightly rebuild. */
  cube(): Promise<Cube> {
    const k = `${this.base}#cube`
    const hit = this.cache.get(k)
    if (hit) return hit as Promise<Cube>
    const p = this.meta()
      .then((m) =>
        fetchCube({
          source: this.source,
          version: `${m.generated_at}/${m.docs}`,
          metaUrl: `${this.base}/agg/cube.json`,
          binUrl: `${this.base}/agg/cube.bin`,
          fetchImpl: this.f,
        }),
      )
      .catch((e: unknown) => {
        this.cache.delete(k)
        throw e
      })
    this.cache.set(k, p)
    return p
  }

  graph(): Promise<Graph> {
    return this.get('agg/graph.json')
  }
  get_bankruptcy(): Promise<Bankruptcy> {
    return this.get('agg/bankruptcy.json')
  }
  topic(slug: string): Promise<TopicPage> {
    return this.get(`agg/topic/${encodeURIComponent(slug)}.json`)
  }
  agency(id: string): Promise<AgencyPage> {
    return this.get(`agg/agency/${encodeURIComponent(id)}.json`)
  }
  province(file: string): Promise<ProvincePage> {
    return this.get(`agg/province/${encodeURIComponent(file)}.json`)
  }
  /** Decoding is memoised, not just the fetch: six routes ask for this and rebuilding 17,000
   *  names each time would be work the reader pays for on every navigation. */
  agencies(): Promise<AgencyIndexItem[]> {
    this.agencyIndex ??= this.get<AgencyIndexFile | AgencyIndexItem[]>('index/agencies.json')
      .then(decodeAgencies)
      .catch((e: unknown) => {
        this.agencyIndex = undefined
        throw e
      })
    return this.agencyIndex
  }
  provinces(): Promise<ProvinceIndexItem[]> {
    return this.get('index/provinces.json')
  }
  topics(): Promise<TopicIndexItem[]> {
    return this.get('index/topics.json')
  }
  /** Where a feed lives for this source. Built here because it is a data URL, not a route, so
   *  it has to follow the same base as everything else the client fetches. */
  feedUrl(path: string): string {
    return `${this.base}/feeds/${path}.xml`
  }
  month(year: string, month: string): Promise<SlimDoc[]> {
    return this.get(`docs/${year}/${month}.json`)
  }

  /** Which month shards could hold this id. A modern id says so itself; a legacy one needs the
   *  month index, which is twelve number pairs. Falling back to every month of the year is what
   *  the old code always did: up to twelve fetches and ~40 MB to open one document. */
  private async shardsFor(id: string, monthHint?: string): Promise<string[]> {
    if (monthHint) return [monthHint]
    const year = id.slice(0, 4)
    const modern = /^(\d{4}-\d{2})-\d{2}-\d{8}$/.exec(id)
    if (modern?.[1]) return [modern[1]]
    const idx = await this.get<{ months: Record<string, [string, string]> }>(
      `index/months/${year}.json`,
    ).catch(() => null)
    const hits = Object.entries(idx?.months ?? {})
      .filter(([, [lo, hi]]) => lo <= id && id <= hi)
      .map(([m]) => m)
    return hits.length ? hits : await this.monthsOf(year)
  }

  /** A document lives in the shard of its month. */
  async doc(id: string, monthHint?: string): Promise<{ doc: SlimDoc; month: string } | null> {
    const year = id.slice(0, 4)
    for (const m of await this.shardsFor(id, monthHint)) {
      const docs = await this.month(year, m)
      const doc = docs.find((d) => d.id === id)
      if (doc) return { doc, month: m }
    }
    // an id inside a month's range but absent from it means the index is stale, not that the
    // document is gone; fall back rather than report "not found" wrongly
    if (!monthHint) {
      for (const m of await this.monthsOf(year)) {
        const docs = await this.month(year, m)
        const doc = docs.find((d) => d.id === id)
        if (doc) return { doc, month: m }
      }
    }
    return null
  }

  async monthsOf(year: string): Promise<string[]> {
    const y = await this.years()
    return Object.keys(y.by_month)
      .filter((m) => m.startsWith(year))
      .sort()
      .reverse()
  }
}

export function docIdOk(id: string): boolean {
  return /^\d{4}-\d{6}$/.test(id) || /^\d{4}-\d{2}-\d{2}-\d{8}$/.test(id)
}
