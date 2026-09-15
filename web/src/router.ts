/** Hash router. Every content route is scoped by a data-source id so a second dataset
 *  can sit beside the gazette without moving any published URL:
 *  `#/ratchakitcha/topic/pollution_waste`, `#/ratchakitcha/doc/2026-09-10-00125805?m=2026-09`. */
export const DEFAULT_SOURCE = 'ratchakitcha'

export type Route =
  | { name: 'home' }
  | { name: 'explore'; source: string; q: URLSearchParams }
  | { name: 'topic'; source: string; slug: string }
  | { name: 'agency'; source: string; id: string }
  | { name: 'province'; source: string; file: string }
  | { name: 'provinces'; source: string }
  | { name: 'latest'; source: string; q: URLSearchParams }
  | { name: 'doc'; source: string; id: string; month?: string }
  | { name: 'dashboard'; source: string; q: URLSearchParams }
  | { name: 'graph'; source: string }
  | { name: 'feeds'; source: string }
  | { name: 'about' }
  | { name: 'notfound'; path: string }

const SOURCE_ID = /^[a-z][a-z0-9-]{1,40}$/

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/'
  const [pathPart, query = ''] = raw.split('?')
  const segs = pathPart.split('/').filter(Boolean).map(decodeURIComponent)
  const q = new URLSearchParams(query)
  const nf = (): Route => ({ name: 'notfound', path: raw })
  if (segs.length === 0) return { name: 'home' }
  if (segs[0] === 'about') return { name: 'about' }
  const source = segs[0] ?? ''
  if (!SOURCE_ID.test(source)) return nf()
  switch (segs[1]) {
    case undefined:
    case 'explore':
      return { name: 'explore', source, q }
    case 'topic':
      return segs[2] ? { name: 'topic', source, slug: segs[2] } : nf()
    case 'agency':
      return segs[2] ? { name: 'agency', source, id: segs[2] } : nf()
    case 'provinces':
      return { name: 'provinces', source }
    case 'latest':
      return { name: 'latest', source, q }
    case 'province':
      return segs[2] ? { name: 'province', source, file: segs[2] } : nf()
    case 'doc':
      return segs[2] ? { name: 'doc', source, id: segs[2], month: q.get('m') ?? undefined } : nf()
    case 'dashboard':
      return { name: 'dashboard', source, q }
    case 'graph':
      return { name: 'graph', source }
    case 'feeds':
      return { name: 'feeds', source }
    default:
      return nf()
  }
}

export function hrefFor(source: string) {
  const base = `#/${encodeURIComponent(source)}`
  return {
    home: () => '#/',
    about: () => '#/about',
    explore: (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ''))
      const s = q.toString()
      return `${base}/explore${s ? `?${s}` : ''}`
    },
    topic: (slug: string) => `${base}/topic/${encodeURIComponent(slug)}`,
    agency: (id: string) => `${base}/agency/${encodeURIComponent(id)}`,
    province: (file: string) => `${base}/province/${encodeURIComponent(file)}`,
    provinces: () => `${base}/provinces`,
    latest: (q = '') => `${base}/latest${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    doc: (id: string, month?: string) => `${base}/doc/${encodeURIComponent(id)}${month ? `?m=${month}` : ''}`,
    // สถิติ carries its filter in the address, so a narrowed page can be refreshed, bookmarked
    // and sent to somebody else. Same parameter names as สำรวจ, so the link across is nearly
    // the same query and neither page invents its own vocabulary.
    dashboard: (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ''))
      const s = q.toString()
      return `${base}/dashboard${s ? `?${s}` : ''}`
    },
    graph: () => `${base}/graph`,
    feeds: () => `${base}/feeds`,
  }
}

/** Links for the default source; pages that know their source should use hrefFor(source). */
export const href = hrefFor(DEFAULT_SOURCE)

export function subscribe(onChange: (r: Route) => void): () => void {
  const handler = () => {
    onChange(parseHash(location.hash))
  }
  addEventListener('hashchange', handler)
  handler()
  return () => {
    removeEventListener('hashchange', handler)
  }
}
