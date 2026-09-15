import { describe, expect, it, vi } from 'vitest'
import { DataClient, DataError, docIdOk } from './client'

function fakeFetch(files: Record<string, unknown>) {
  const calls: string[] = []
  const f = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push(url)
    const key = decodeURIComponent(url.replace(/^\/data\/(ratchakitcha\/)?/, ''))
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
      '/data/ratchakitcha/docs/2024/2024-02.json',
      '/data/ratchakitcha/docs/2024/2024-01.json',
    ])
    expect(await c.doc('2024-999999')).toBeNull()
  })

  it('surfaces 404 as DataError with status and does not poison the cache', async () => {
    const c = new DataClient({ fetchImpl: fakeFetch({}).f })
    await expect(c.topic('nope')).rejects.toMatchObject({
      status: 404,
      path: '/data/ratchakitcha/agg/topic/nope.json',
    })
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
    expect(calls).toContain('/data/ratchakitcha/agg/province/%E0%B8%95%E0%B8%A3%E0%B8%B1%E0%B8%87.json')
    expect(calls).toHaveLength(9)
    expect(await c.monthsOf('2024')).toEqual([])
  })
})

it('drops old month shards so a long browse does not pin a hundred megabytes', async () => {
  const months = Object.fromEntries(
    ['01', '02', '03', '04', '05', '06', '07'].map((m) => [`docs/2024/2024-${m}.json`, []]),
  )
  const { f, calls } = fakeFetch(months)
  const c = new DataClient({ fetchImpl: f })
  for (const m of ['01', '02', '03', '04', '05', '06', '07']) await c.month('2024', `2024-${m}`)
  const before = calls.length
  // the six newest are still cached; the first has been evicted and refetches
  await c.month('2024', '2024-07')
  expect(calls.length).toBe(before)
  await c.month('2024', '2024-01')
  expect(calls.length).toBe(before + 1)
})

it('keeps small aggregates cached however many shards go by', async () => {
  const { f, calls } = fakeFetch({
    'agg/taxonomy.json': { topics: {}, actions: {}, govlevels: {} },
    ...Object.fromEntries(
      ['01', '02', '03', '04', '05', '06', '07', '08'].map((m) => [`docs/2024/2024-${m}.json`, []]),
    ),
  })
  const c = new DataClient({ fetchImpl: f })
  await c.taxonomy()
  for (const m of ['01', '02', '03', '04', '05', '06', '07', '08']) await c.month('2024', `2024-${m}`)
  const before = calls.length
  await c.taxonomy()
  expect(calls.length).toBe(before)
})

it('opens a legacy document from the month index instead of walking the year', async () => {
  const { f, calls } = fakeFetch({
    'index/months/2024.json': {
      year: '2024',
      months: {
        '2024-01': ['2024-000001', '2024-000900'],
        '2024-02': ['2024-000901', '2024-001800'],
        '2024-03': ['2024-001801', '2024-002700'],
      },
    },
    'docs/2024/2024-02.json': [{ id: '2024-001234', t: 'x' }],
  })
  const c = new DataClient({ fetchImpl: f })
  const hit = await c.doc('2024-001234')
  expect(hit?.month).toBe('2024-02')
  // the index plus exactly one shard — not every month of the year
  expect(calls.filter((u) => u.includes('/docs/'))).toHaveLength(1)
})

it('reads the month straight out of a modern id, with no index at all', async () => {
  const { f, calls } = fakeFetch({
    'docs/2026/2026-09.json': [{ id: '2026-09-10-00125805', t: 'y' }],
  })
  const c = new DataClient({ fetchImpl: f })
  expect((await c.doc('2026-09-10-00125805'))?.month).toBe('2026-09')
  expect(calls.some((u) => u.includes('index/months'))).toBe(false)
  expect(calls.filter((u) => u.includes('/docs/'))).toHaveLength(1)
})

it('still finds a document when the month index disagrees with the shards', async () => {
  const { f } = fakeFetch({
    'index/months/2024.json': { year: '2024', months: { '2024-01': ['2024-000001', '2024-000900'] } },
    'agg/years.json': { by_year: { '2024': 1 }, by_month: { '2024-01': 0, '2024-05': 1 } },
    'docs/2024/2024-01.json': [],
    'docs/2024/2024-05.json': [{ id: '2024-000500', t: 'moved' }],
  })
  const c = new DataClient({ fetchImpl: f })
  expect((await c.doc('2024-000500'))?.month).toBe('2024-05')
})

describe('byCitation', () => {
  const vol = {
    'index/volumes/143.json': {
      volume: 143,
      parts: { '219 ง พิเศษ': ['2026-09'], '17 ก': ['2026-01', '2026-02'] },
    },
  }

  it('opens the document that starts at or before the cited page', async () => {
    const { f } = fakeFetch({
      ...vol,
      'docs/2026/2026-09.json': [
        { id: 'a', v: 143, p: '219 ง พิเศษ', pg: 1 },
        { id: 'b', v: 143, p: '219 ง พิเศษ', pg: 20 },
        { id: 'c', v: 143, p: '219 ง พิเศษ', pg: 40 },
        { id: 'other', v: 143, p: '17 ก', pg: 25 },
      ],
    })
    const c = new DataClient({ fetchImpl: f })
    // page 23 falls inside the item that begins on page 20
    expect((await c.byCitation({ volume: 143, part: '219 ง พิเศษ', page: 23 }))?.doc.id).toBe('b')
    expect((await c.byCitation({ volume: 143, part: '219 ง พิเศษ', page: 40 }))?.doc.id).toBe('c')
    // no page given: the ตอน starts at its first item
    expect((await c.byCitation({ volume: 143, part: '219 ง พิเศษ', page: null }))?.doc.id).toBe('a')
  })

  it('searches every month a ตอน spans', async () => {
    const { f } = fakeFetch({
      ...vol,
      'docs/2026/2026-01.json': [{ id: 'jan', v: 143, p: '17 ก', pg: 1 }],
      'docs/2026/2026-02.json': [{ id: 'feb', v: 143, p: '17 ก', pg: 9 }],
    })
    const c = new DataClient({ fetchImpl: f })
    const hit = await c.byCitation({ volume: 143, part: '17 ก', page: 9 })
    expect(hit?.doc.id).toBe('feb')
    expect(hit?.month).toBe('2026-02')
  })

  it('says nothing rather than guessing when the coordinates are not in the archive', async () => {
    const { f } = fakeFetch(vol)
    const c = new DataClient({ fetchImpl: f })
    expect(await c.byCitation({ volume: 99, part: '1 ก', page: 1 })).toBeNull()
    expect(await c.byCitation({ volume: 143, part: 'ไม่มีตอนนี้', page: 1 })).toBeNull()
  })

  it('still finds a ตอน the archive labels without its พิเศษ marker', async () => {
    // เล่ม 142 arrives with no ง พิเศษ at all, so a reader typing what the page prints —
    // "เล่ม 142 ตอนพิเศษ 341 ง หน้า 85" — must not be told the document does not exist
    const { f } = fakeFetch({
      'index/volumes/142.json': { volume: 142, parts: { '341 ง': ['2025-10'] } },
      'docs/2025/2025-10.json': [{ id: 'x', v: 142, p: '341 ง', pg: 85 }],
    })
    const c = new DataClient({ fetchImpl: f })
    expect((await c.byCitation({ volume: 142, part: '341 ง พิเศษ', page: 85 }))?.doc.id).toBe('x')
    // and the plain form still resolves directly
    expect((await c.byCitation({ volume: 142, part: '341 ง', page: 85 }))?.doc.id).toBe('x')
  })

  it('prefers the ตอน as written when both labels exist', async () => {
    const { f } = fakeFetch({
      'index/volumes/141.json': { volume: 141, parts: { '7 ง': ['2024-03'], '7 ง พิเศษ': ['2024-03'] } },
      'docs/2024/2024-03.json': [
        { id: 'plain', v: 141, p: '7 ง', pg: 3 },
        { id: 'special', v: 141, p: '7 ง พิเศษ', pg: 3 },
      ],
    })
    const c = new DataClient({ fetchImpl: f })
    expect((await c.byCitation({ volume: 141, part: '7 ง พิเศษ', page: 3 }))?.doc.id).toBe('special')
    expect((await c.byCitation({ volume: 141, part: '7 ง', page: 3 }))?.doc.id).toBe('plain')
  })
})
