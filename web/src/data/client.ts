/** Typed fetch layer over the static data contract. One in-memory cache per path. */
import type {
  AgencyIndexItem,
  AgencyPage,
  Bankruptcy,
  Graph,
  Home,
  Meta,
  ProvinceIndexItem,
  ProvincePage,
  SlimDoc,
  Taxonomy,
  TopicIndexItem,
  TopicPage,
  Years,
} from './types'
import { CONTRACT } from './types'
import { pickByPage } from '../lib/coords'

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
    return p
  }

  /** Every source in this build, from the data root. */
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
  home(): Promise<Home> {
    return this.get('agg/home.json')
  }
  years(): Promise<Years> {
    return this.get('agg/years.json')
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
  agencies(): Promise<AgencyIndexItem[]> {
    return this.get('index/agencies.json')
  }
  provinces(): Promise<ProvinceIndexItem[]> {
    return this.get('index/provinces.json')
  }
  topics(): Promise<TopicIndexItem[]> {
    return this.get('index/topics.json')
  }
  month(year: string, month: string): Promise<SlimDoc[]> {
    return this.get(`docs/${year}/${month}.json`)
  }
  titles(year: string): Promise<[string, string][]> {
    return this.get(`titles/${year}.json`)
  }

  /** A document lives in the shard of its month; the id alone tells the year, the meta tells the month. */
  async doc(id: string, monthHint?: string): Promise<{ doc: SlimDoc; month: string } | null> {
    const year = id.slice(0, 4)
    const months = monthHint ? [monthHint] : await this.monthsOf(year)
    for (const m of months) {
      const docs = await this.month(year, m)
      const doc = docs.find((d) => d.id === id)
      if (doc) return { doc, month: m }
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
