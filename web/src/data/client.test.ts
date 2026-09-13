import { describe, expect, it, vi } from 'vitest'
import { DataClient, DataError, docIdOk } from './client'

function fakeFetch(files: Record<string, unknown>) {
  const calls: string[] = []
  const f = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push(url)
    const key = decodeURIComponent(url.replace(/^\/data\//, ''))
    const body = files[key]
    return Promise.resolve(
      body === undefined
        ? new Response('nope', { status: 404 })
        : new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
    )
  })
  return { f: f as unknown as typeof fetch, calls }
}

describe('DataClient', () => {
  it('caches by path and refuses an unknown contract', async () => {
    const { f, calls } = fakeFetch({
      'agg/meta.json': { contract: 1, sources: [{ name: 'x', url: 'u' }], years: ['2024'] },
    })
    const c = new DataClient({ fetchImpl: f })
    await c.meta()
    await c.meta()
    expect(calls).toHaveLength(1)
    const bad = new DataClient({ fetchImpl: fakeFetch({ 'agg/meta.json': { contract: 99 } }).f })
    await expect(bad.meta()).rejects.toBeInstanceOf(DataError)
  })

  it('finds a document by scanning the months of its year, newest first', async () => {
    const { f, calls } = fakeFetch({
      'agg/years.json': { by_year: { '2024': 2 }, by_month: { '2024-01': 1, '2024-02': 1 } },
      'docs/2024/2024-02.json': [{ id: '2024-000002', t: 'b' }],
      'docs/2024/2024-01.json': [{ id: '2024-000001', t: 'a' }],
    })
    const c = new DataClient({ fetchImpl: f })
    const hit = await c.doc('2024-000001')
    expect(hit?.doc.t).toBe('a')
    expect(hit?.month).toBe('2024-01')
    expect(calls.filter((u) => u.includes('/docs/'))).toEqual([
      '/data/docs/2024/2024-02.json',
      '/data/docs/2024/2024-01.json',
    ])
    expect(await c.doc('2024-999999')).toBeNull()
  })

  it('surfaces 404 as DataError with status and does not poison the cache', async () => {
    const c = new DataClient({ fetchImpl: fakeFetch({}).f })
    await expect(c.topic('nope')).rejects.toMatchObject({ status: 404, path: 'agg/topic/nope.json' })
    await expect(c.topic('nope')).rejects.toBeInstanceOf(DataError)
  })

  it('treats an SPA fallback page as not found', async () => {
    const html = (() =>
      Promise.resolve(
        new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      )) as typeof fetch
    const c = new DataClient({ fetchImpl: html })
    await expect(c.topic('x')).rejects.toMatchObject({ status: 404 })
  })

  it('validates document ids', () => {
    expect(docIdOk('2024-001232')).toBe(true)
    expect(docIdOk('2026-09-10-00125805')).toBe(true)
    expect(docIdOk('2024-1232')).toBe(false)
    expect(docIdOk('../etc')).toBe(false)
  })
})

describe('DataClient accessors', () => {
  it('map to the contract paths', async () => {
    const files: Record<string, unknown> = {
      'agg/taxonomy.json': { topics: {} },
      'agg/home.json': { count: 1 },
      'agg/years.json': { by_year: {}, by_month: {} },
      'agg/bankruptcy.json': { by_court_stage: [] },
      'agg/agency/x.json': { id: 'x' },
      'agg/province/ตรัง.json': { name: 'ตรัง' },
      'index/agencies.json': [],
      'index/provinces.json': [],
      'index/topics.json': [],
    }
    const { f, calls } = fakeFetch(files)
    const c = new DataClient({ fetchImpl: f, baseUrl: '/data/' })
    await Promise.all([
      c.taxonomy(),
      c.home(),
      c.years(),
      c.get_bankruptcy(),
      c.agency('x'),
      c.province('ตรัง'),
      c.agencies(),
      c.provinces(),
      c.topics(),
    ])
    expect(calls).toContain('/data/agg/province/%E0%B8%95%E0%B8%A3%E0%B8%B1%E0%B8%87.json')
    expect(calls).toHaveLength(9)
    expect(await c.monthsOf('2024')).toEqual([])
  })
})
