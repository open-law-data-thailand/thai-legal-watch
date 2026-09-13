/** Hash router: `#/topic/pollution_waste`, `#/doc/2024-001232?m=2024-03`. Typed, testable, no dependencies. */
export type Route =
  | { name: 'home' }
  | { name: 'explore'; q: URLSearchParams }
  | { name: 'topic'; slug: string }
  | { name: 'agency'; id: string }
  | { name: 'province'; file: string }
  | { name: 'doc'; id: string; month?: string }
  | { name: 'dashboard' }
  | { name: 'graph' }
  | { name: 'about' }
  | { name: 'notfound'; path: string }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/'
  const [pathPart, query = ''] = raw.split('?')
  const segs = pathPart.split('/').filter(Boolean).map(decodeURIComponent)
  const q = new URLSearchParams(query)
  switch (segs[0]) {
    case undefined:
      return { name: 'home' }
    case 'explore':
      return { name: 'explore', q }
    case 'topic':
      return segs[1] ? { name: 'topic', slug: segs[1] } : { name: 'notfound', path: raw }
    case 'agency':
      return segs[1] ? { name: 'agency', id: segs[1] } : { name: 'notfound', path: raw }
    case 'province':
      return segs[1] ? { name: 'province', file: segs[1] } : { name: 'notfound', path: raw }
    case 'doc':
      return segs[1]
        ? { name: 'doc', id: segs[1], month: q.get('m') ?? undefined }
        : { name: 'notfound', path: raw }
    case 'dashboard':
      return { name: 'dashboard' }
    case 'graph':
      return { name: 'graph' }
    case 'about':
      return { name: 'about' }
    default:
      return { name: 'notfound', path: raw }
  }
}

export const href = {
  home: () => '#/',
  explore: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ''))
    const s = q.toString()
    return `#/explore${s ? `?${s}` : ''}`
  },
  topic: (slug: string) => `#/topic/${encodeURIComponent(slug)}`,
  agency: (id: string) => `#/agency/${encodeURIComponent(id)}`,
  province: (file: string) => `#/province/${encodeURIComponent(file)}`,
  doc: (id: string, month?: string) => `#/doc/${encodeURIComponent(id)}${month ? `?m=${month}` : ''}`,
  dashboard: () => '#/dashboard',
  graph: () => '#/graph',
  about: () => '#/about',
}

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
