/** Types for DATA_CONTRACT.md v1. Fields may be added upstream; never rely on absence. */
export const CONTRACT = 1

export interface SlimLabel {
  s: string
  x: 'topic' | 'action' | 'govlevel'
  w: number
  c: boolean
  m: string[]
}

export interface SlimDoc {
  id: string
  t: string
  d: string | null
  v: number | null
  p: string | null
  pg: number | null
  dt: string | null
  a: string | null
  pr: string | null
  topic: string | null
  action: string | null
  govlevel: string | null
  tc: boolean
  ac: boolean
  gc: boolean
  labels: SlimLabel[]
  /** The publisher's own link to the PDF. An integer is the gazette document number, which is
   *  all the URL varies by; a string is a URL that did not match that shape. Absent for the
   *  years upstream has not backfilled yet — the site falls back to deriving it from `id`. */
  u?: number | string
  x?: Record<string, string>
}

export interface RecentDoc {
  id: string
  t: string
  d: string | null
  a: string | null
  pr: string | null
  topic: string | null
  action: string | null
  govlevel: string | null
  tc: boolean
  ac: boolean
  u?: number | string
}

export interface SourceCredit {
  name: string
  url: string
  layers?: string[]
  license?: string
  built_from_years?: string[]
}

/** Which code read which data. Both halves are commit shas so a number on a page can be traced
 *  to the exact source that produced it; either may be empty when built outside a checkout. */
export interface BuildInfo {
  code?: { repo?: string; sha?: string }
  dataset?: { repo?: string; sha?: string }
}

export interface Meta {
  contract: number
  generated_at: string
  sources: SourceCredit[]
  years: string[]
  docs: number
  labelled: number
  corroborated_any: number
  latest_date: string | null
  site: string
  files: number
  bytes: number
  build?: BuildInfo
  /** Where the full text of a document can be read from, one record at a time. Not part of the
   *  build — the layer is about 10 GB — so the site range-reads it from the publisher. Absent
   *  means this build simply does not offer full text. */
  text?: { base: string; layer?: string; credit?: string }
}

export interface TopicNode {
  thai: string | null
  parent: string | null
  n: number
  children: string[]
}
export interface Taxonomy {
  topics: Record<string, TopicNode>
  actions: Record<string, string>
  govlevels: Record<string, string>
  action_counts: Record<string, number>
  govlevel_counts: Record<string, number>
}

export interface Facet {
  total: number
  by_year: Record<string, number>
  by_month: Record<string, number>
  by_topic: Record<string, number>
  by_action: Record<string, number>
  by_govlevel: Record<string, number>
  agencies: { id: string; name: string; n: number }[]
  provinces: Record<string, number>
  recent: RecentDoc[]
}
export interface TopicPage extends Facet {
  slug: string
  thai: string | null
  parent: string | null
  children: string[]
}
export interface AgencyPage extends Facet {
  id: string
  name: string
  type: string | null
}
export interface ProvincePage extends Facet {
  name: string
}

/** The raw listing behind the "ล่าสุด" page: every document of the last N days, newest first,
 *  without the evidence trail or the bankruptcy extras that a listing never shows. */
export interface Latest {
  days: number
  from: string | null
  to: string | null
  docs: SlimDoc[]
}

export interface Home {
  latest_date: string | null
  count: number
  parts: string[]
  volume: number | null
  by_topic: Record<string, number>
  by_action: Record<string, number>
  by_govlevel: Record<string, number>
  provinces: number
  bankruptcy_stages: Record<string, number>
  highlights: SlimDoc[]
  latest?: SlimDoc[]
  sparkline: { d: string; n: number }[]
}

export interface AgencyIndexItem {
  id: string
  name: string
  type: string | null
  n: number
}
export interface ProvinceIndexItem {
  name: string
  file: string
  n: number
}
export interface TopicIndexItem {
  slug: string
  thai: string | null
  parent: string | null
  n: number
}
/** One number per year for every topic, action and govlevel — the dashboard's whole data set. */
export interface Trends {
  years: string[]
  topics: Record<string, number[]>
  actions: Record<string, number[]>
  govlevels: Record<string, number[]>
}

export interface Years {
  by_year: Record<string, number>
  by_month: Record<string, number>
}
export interface Graph {
  topics: { slug: string; thai: string | null; parent: string | null; n: number }[]
  agencies: { id: string; name: string; n: number }[]
  topic_agency: { t: string; a: string; n: number }[]
  topic_topic: { a: string; b: string; n: number }[]
}
export interface Bankruptcy {
  by_court_stage: { court: string; stage: string; n: number }[]
}
