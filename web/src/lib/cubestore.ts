/** Getting the cube into the browser, and keeping it there between visits.
 *
 *  `/data/*` is served with an hour of cache because the corpus is rebuilt nightly, so without a
 *  store of our own a reader who comes back in the afternoon pays for the whole file again. The
 *  build stamp is in `agg/meta.json`, so the copy can be kept until that stamp changes — which is
 *  the one thing an HTTP cache with a fixed max-age cannot do.
 *
 *  The compressed bytes are what gets stored, not the expanded columns: half a megabyte instead of
 *  seven, which matters on a browser with a small quota, and the decompression is tens of
 *  milliseconds. Every part of this is optional — private windows, disabled storage and old
 *  browsers all end up at the network, and a failure to store is never a failure to load.
 */
import { buildCube, type Cube, CubeError, type CubeMeta } from './cube'

const DB = 'tlw'
const STORE = 'blobs'
/** one entry per source, replaced in place, so the store cannot grow with the number of builds */
const key = (source: string) => `cube:${source}`

interface Stored {
  version: string
  bytes: ArrayBuffer
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      req = indexedDB.open(DB, 1)
    } catch {
      // Firefox throws here rather than failing the request when storage is blocked
      return resolve(null)
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => {
      resolve(req.result)
    }
    req.onerror = () => {
      resolve(null)
    }
    req.onblocked = () => {
      resolve(null)
    }
  })
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  f: (s: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  return new Promise((resolve) => {
    let req: IDBRequest
    try {
      req = f(db.transaction(STORE, mode).objectStore(STORE))
    } catch {
      return resolve(null)
    }
    req.onsuccess = () => {
      resolve(req.result as T)
    }
    req.onerror = () => {
      resolve(null)
    }
  })
}

export async function readStored(source: string, version: string): Promise<ArrayBuffer | null> {
  const db = await openDb()
  if (!db) return null
  try {
    const hit = await run<Stored>(db, 'readonly', (s) => s.get(key(source)))
    // a stale build is not worth keeping: the next write replaces it anyway
    return hit && hit.version === version ? hit.bytes : null
  } finally {
    db.close()
  }
}

export async function writeStored(source: string, version: string, bytes: ArrayBuffer): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  try {
    const ok = await run<IDBValidKey>(db, 'readwrite', (s) =>
      s.put({ version, bytes } satisfies Stored, key(source)),
    )
    return ok !== null
  } finally {
    db.close()
  }
}

const isGzip = (b: ArrayBuffer) =>
  b.byteLength > 2 && new Uint8Array(b, 0, 2)[0] === 0x1f && new Uint8Array(b, 0, 2)[1] === 0x8b

/** The blob is written gzipped so a CDN that does not compress octet-stream cannot undo the work.
 *  Some servers set Content-Encoding from the file name and the browser expands it before we see
 *  it, so what arrived is sniffed rather than assumed. */
async function gunzip(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  if (!isGzip(bytes)) return bytes
  if (typeof DecompressionStream === 'undefined')
    throw new CubeError('this browser cannot decompress the index (DecompressionStream missing)')
  // a ReadableStream built by hand rather than Blob.stream(): the Blob route needs a Blob
  // implementation that streams, which jsdom (and so every unit test) does not have
  const source = new ReadableStream<BufferSource>({
    start(c) {
      c.enqueue(new Uint8Array(bytes))
      c.close()
    },
  })
  return await new Response(source.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
}

export interface CubeSource {
  source: string
  /** changes whenever the data is rebuilt */
  version: string
  metaUrl: string
  binUrl: string
  fetchImpl?: typeof fetch
}

/** The cube, from the store if this build is already there and from the network otherwise. */
export async function fetchCube(src: CubeSource): Promise<Cube> {
  const f = src.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  const header = async (init?: RequestInit) => {
    const r = await f(src.metaUrl, init)
    if (!r.ok) throw new CubeError(`${r.status} for ${src.metaUrl}`)
    const meta = (await r.json()) as CubeMeta
    if (!meta.layout?.length) throw new CubeError(`${src.metaUrl} is not a cube header`)
    return meta
  }
  const body = async (init?: RequestInit) => {
    const r = await f(src.binUrl, init)
    if (!r.ok) throw new CubeError(`${r.status} for ${src.binUrl}`)
    return await r.arrayBuffer()
  }
  const keep = (bytes: ArrayBuffer) => {
    // not awaited: a full quota must not delay the page, and a failed write is not a failed load
    void writeStored(src.source, src.version, bytes).catch(() => false)
  }

  const meta = await header()
  const cached = await readStored(src.source, src.version).catch(() => null)
  if (cached) {
    try {
      return buildCube(meta, await gunzip(cached))
    } catch {
      // a stored copy that no longer fits the header is a stale write, not a reason to fail
    }
  }
  try {
    const raw = await body()
    const cube = buildCube(meta, await gunzip(raw))
    keep(raw)
    return cube
  } catch (e) {
    if (!(e instanceof CubeError)) throw e
    // The header and the blob are two HTTP cache entries with independent ages, and a visit that
    // was served from the store fetched only the header — so after a nightly rebuild the browser
    // can hand back a fresh header with yesterday's blob, which do not fit each other. Ask for
    // both again, past the cache, once. (A build is minutes of work; this is two requests.)
    const fresh: RequestInit = { cache: 'reload' }
    const [meta2, raw2] = await Promise.all([header(fresh), body(fresh)])
    const cube = buildCube(meta2, await gunzip(raw2))
    keep(raw2)
    return cube
  }
}
