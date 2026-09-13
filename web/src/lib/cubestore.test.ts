import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeIndexedDb } from '../test/fakeidb'
import { CubeError } from './cube'
import { fetchCube, readStored, writeStored } from './cubestore'

/** The browser's own gzip, so what the test feeds in is what a real response would carry. */
async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const source = new ReadableStream<BufferSource>({
    start(c) {
      c.enqueue(bytes)
      c.close()
    },
  })
  const out = await new Response(source.pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
  return new Uint8Array(out)
}

/** Two rows, one u16 column and the u8 columns the query needs. */
function blob(): { meta: unknown; bytes: Uint8Array<ArrayBuffer> } {
  const rows = 2
  const u16 = ['agency', 'day']
  const u8 = ['topic', 'action', 'gov', 'prov', 'dtype', 'flags']
  const buf = new Uint8Array(rows * (u16.length * 2 + u8.length))
  const layout: { name: string; type: string; offset: number }[] = []
  let offset = 0
  for (const name of u16) {
    layout.push({ name, type: 'u16', offset })
    offset += rows * 2
  }
  for (const name of u8) {
    layout.push({ name, type: 'u8', offset })
    offset += rows
  }
  return {
    meta: {
      rows,
      bytes: buf.byteLength,
      encoding: 'gzip',
      layout,
      months: [{ m: '2024-01', start: 0, n: 2 }],
      codes: Object.fromEntries([...u16, ...u8].filter((c) => c !== 'flags').map((c) => [c, [null]])),
      flags: { topic_corroborated: 1 },
    },
    bytes: buf,
  }
}

const ok = (body: unknown, json = true) =>
  new Response(json ? JSON.stringify(body) : (body as BodyInit), {
    status: 200,
    headers: { 'content-type': json ? 'application/json' : 'application/octet-stream' },
  })

function server(bin: Uint8Array) {
  const { meta } = blob()
  const calls: string[] = []
  const f = vi.fn((input: RequestInfo | URL) => {
    const url = urlOf(input)
    calls.push(url)
    if (url.endsWith('cube.json')) return Promise.resolve(ok(meta))
    if (url.endsWith('cube.bin')) return Promise.resolve(ok(bin, false))
    return Promise.resolve(new Response('', { status: 404 }))
  })
  return { fetchImpl: f as unknown as typeof fetch, calls }
}

/** `RequestInfo` can be a Request object, which does not stringify to its URL. */
const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

const src = (fetchImpl: typeof fetch) => ({
  source: 'ratchakitcha',
  version: 'build-1',
  metaUrl: '/data/ratchakitcha/agg/cube.json',
  binUrl: '/data/ratchakitcha/agg/cube.bin',
  fetchImpl,
})

describe('fetchCube', () => {
  it('expands a gzipped blob', async () => {
    const { bytes } = blob()
    const { fetchImpl } = server(await gzip(bytes))
    const cube = await fetchCube(src(fetchImpl))
    expect(cube.meta.rows).toBe(2)
    expect(cube.cols['topic']).toHaveLength(2)
  })

  it('takes the blob as it is when something upstream already expanded it', async () => {
    // a host that sets Content-Encoding from the .bin name would have the browser decode it
    // before we ever see the bytes, so what arrived is sniffed rather than assumed
    const { bytes } = blob()
    const { fetchImpl } = server(bytes)
    expect((await fetchCube(src(fetchImpl))).meta.rows).toBe(2)
  })

  it('reports the status when the blob is missing rather than failing on the bytes', async () => {
    const f = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        urlOf(input).endsWith('cube.json') ? ok(blob().meta) : new Response('', { status: 404 }),
      ),
    ) as unknown as typeof fetch
    await expect(fetchCube(src(f))).rejects.toThrow(/404/)
  })

  it('refuses a header that is not a cube', async () => {
    const f = vi.fn(() => Promise.resolve(ok({ hello: 'world' }))) as unknown as typeof fetch
    await expect(fetchCube(src(f))).rejects.toThrow(CubeError)
  })

  it('asks again past the cache when the header and the blob do not fit each other', async () => {
    // The two are separate HTTP cache entries with independent ages, and a visit served from the
    // store fetches only the header — so a browser can pair a fresh header with yesterday's blob.
    const { bytes, meta } = blob()
    const stale = await gzip(new Uint8Array(bytes.byteLength + 4))
    const good = await gzip(bytes)
    const calls: { url: string; reload: boolean }[] = []
    const f = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input)
      const reload = init?.cache === 'reload'
      calls.push({ url, reload })
      if (url.endsWith('cube.json')) return Promise.resolve(ok(meta))
      return Promise.resolve(ok(reload ? good : stale, false))
    }) as unknown as typeof fetch

    const cube = await fetchCube(src(f))
    expect(cube.meta.rows).toBe(2)
    // once from the cache, then once past it — and not a third time
    expect(calls.filter((c) => c.url.endsWith('cube.bin')).map((c) => c.reload)).toEqual([false, true])
  })

  it('gives up rather than looping when a second, uncached read still does not fit', async () => {
    const { bytes, meta } = blob()
    const stale = await gzip(new Uint8Array(bytes.byteLength + 4))
    const f = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(urlOf(input).endsWith('cube.json') ? ok(meta) : ok(stale, false)),
    ) as unknown as typeof fetch
    await expect(fetchCube(src(f))).rejects.toThrow(CubeError)
    expect(f).toHaveBeenCalledTimes(4)
  })

  it('fetches the blob once per instance of the header it was given', async () => {
    const { bytes } = blob()
    const { fetchImpl, calls } = server(await gzip(bytes))
    await fetchCube(src(fetchImpl))
    expect(calls.filter((c) => c.endsWith('cube.bin'))).toHaveLength(1)
  })
})

describe('the store', () => {
  let fake: ReturnType<typeof installFakeIndexedDb> | null = null
  afterEach(() => {
    fake?.uninstall()
    fake = null
  })

  it('is optional: with no IndexedDB, reading misses and writing reports failure', async () => {
    // jsdom has no IndexedDB, which is the same situation as a locked-down browser — the cube
    // still has to load, just from the network every time
    expect(await readStored('ratchakitcha', 'build-1')).toBe(null)
    expect(await writeStored('ratchakitcha', 'build-1', new ArrayBuffer(4))).toBe(false)
  })

  it('does not let a failed write fail the load', async () => {
    const { bytes } = blob()
    const { fetchImpl } = server(await gzip(bytes))
    await expect(fetchCube(src(fetchImpl))).resolves.toBeTruthy()
  })

  it('keeps a build and hands it back without going to the network', async () => {
    fake = installFakeIndexedDb()
    const { bytes } = blob()
    const first = server(await gzip(bytes))
    await fetchCube(src(first.fetchImpl))
    // the write is deliberately not awaited inside fetchCube, so let it land
    await new Promise((r) => setTimeout(r, 0))
    expect(fake.data.size).toBe(1)

    const second = server(await gzip(bytes))
    const cube = await fetchCube(src(second.fetchImpl))
    expect(cube.meta.rows).toBe(2)
    expect(second.calls.filter((c) => c.endsWith('cube.bin'))).toHaveLength(0)
  })

  it('ignores a copy from an earlier build, which is the whole reason for the stamp', async () => {
    fake = installFakeIndexedDb()
    const { bytes } = blob()
    const first = server(await gzip(bytes))
    await fetchCube(src(first.fetchImpl))
    await new Promise((r) => setTimeout(r, 0))

    const next = server(await gzip(bytes))
    await fetchCube({ ...src(next.fetchImpl), version: 'build-2' })
    expect(next.calls.filter((c) => c.endsWith('cube.bin'))).toHaveLength(1)
  })

  it('goes to the network when a stored copy no longer fits its header', async () => {
    fake = installFakeIndexedDb()
    fake.data.set('cube:ratchakitcha', { version: 'build-1', bytes: new Uint8Array([1, 2, 3]).buffer })
    const { bytes } = blob()
    const s = server(await gzip(bytes))
    expect((await fetchCube(src(s.fetchImpl))).meta.rows).toBe(2)
    expect(s.calls.filter((c) => c.endsWith('cube.bin'))).toHaveLength(1)
  })

  it('survives storage that opens and then refuses every operation', async () => {
    fake = installFakeIndexedDb({ failOps: true })
    expect(await readStored('ratchakitcha', 'build-1')).toBe(null)
    expect(await writeStored('ratchakitcha', 'build-1', new ArrayBuffer(4))).toBe(false)
    const { bytes } = blob()
    const s = server(await gzip(bytes))
    expect((await fetchCube(src(s.fetchImpl))).meta.rows).toBe(2)
  })

  it('survives storage that will not open at all', async () => {
    fake = installFakeIndexedDb({ failOpen: true })
    expect(await readStored('ratchakitcha', 'build-1')).toBe(null)
    fake.uninstall()
    fake = installFakeIndexedDb({ throwOnOpen: true })
    expect(await readStored('ratchakitcha', 'build-1')).toBe(null)
  })

  it('closes the database it opened', async () => {
    fake = installFakeIndexedDb()
    await writeStored('ratchakitcha', 'build-1', new ArrayBuffer(4))
    await readStored('ratchakitcha', 'build-1')
    expect(fake.closed()).toBe(2)
  })
})
