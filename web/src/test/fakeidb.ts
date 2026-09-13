/** Just enough IndexedDB for the tests: jsdom ships none, and the interesting half of
 *  `cubestore.ts` — keeping a build and discarding the one before it — only exists when there is
 *  a store to keep it in. Deliberately small: one database, synchronous storage, callbacks fired
 *  on a microtask so handlers assigned after the call still run, and a switch for making any
 *  operation fail, since "storage is there but refuses" is a real browser state.
 */
type Handler = ((ev?: unknown) => void) | null

class Req {
  onsuccess: Handler = null
  onerror: Handler = null
  onupgradeneeded: Handler = null
  onblocked: Handler = null
  result: unknown = undefined
  error: unknown = null
}

export interface FakeIdbOptions {
  /** reject indexedDB.open, the way a browser with site data blocked does */
  failOpen?: boolean
  /** let the database open but fail every read and write, the way an exhausted quota does */
  failOps?: boolean
  /** throw from indexedDB.open itself, which is what Firefox does in some private windows */
  throwOnOpen?: boolean
}

export function installFakeIndexedDb(opts: FakeIdbOptions = {}): {
  uninstall: () => void
  data: Map<string, unknown>
  closed: () => number
} {
  const data = new Map<string, unknown>()
  const stores = new Set<string>()
  let closes = 0
  const later = (f: () => void) => {
    queueMicrotask(f)
  }

  const db = {
    objectStoreNames: { contains: (n: string) => stores.has(n) },
    createObjectStore: (n: string) => {
      stores.add(n)
      return {}
    },
    close: () => {
      closes++
    },
    transaction: () => ({
      objectStore: () => ({
        get: (k: string) => {
          const r = new Req()
          later(() => {
            if (opts.failOps) r.onerror?.()
            else {
              r.result = data.get(k)
              r.onsuccess?.()
            }
          })
          return r
        },
        put: (v: unknown, k: string) => {
          const r = new Req()
          later(() => {
            if (opts.failOps) r.onerror?.()
            else {
              data.set(k, v)
              r.result = k
              r.onsuccess?.()
            }
          })
          return r
        },
      }),
    }),
  }

  const fake = {
    open: () => {
      if (opts.throwOnOpen) throw new Error('storage is blocked')
      const r = new Req()
      r.result = db
      later(() => {
        if (opts.failOpen) return r.onerror?.()
        if (!stores.size) r.onupgradeneeded?.()
        r.onsuccess?.()
      })
      return r
    },
  }

  const g = globalThis as unknown as { indexedDB?: unknown }
  const had = 'indexedDB' in g
  const before = g.indexedDB
  g.indexedDB = fake
  return {
    data,
    closed: () => closes,
    uninstall: () => {
      if (had) g.indexedDB = before
      else delete g.indexedDB
    },
  }
}
