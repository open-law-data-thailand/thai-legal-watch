import { describe, expect, it } from 'vitest'
import {
  buildCube,
  codeName,
  CubeError,
  type CubeMeta,
  named,
  planFetch,
  queryCube,
  rowLocation,
} from './cube'
import { crossFilter, descendantCodes, rollUp } from './cubequery'
import type { Taxonomy } from '../data/types'

interface Row {
  agency?: string
  day?: string
  topic?: string
  action?: string
  gov?: string
  prov?: string
  dtype?: string
  /** which of the three labels are corroborated */
  tc?: boolean
  ac?: boolean
  gc?: boolean
}

const U16 = ['agency', 'day'] as const
const U8 = ['topic', 'action', 'gov', 'prov', 'dtype', 'flags'] as const

/** The reader's half of the contract needs a writer to test against; this mirrors the layout
 *  `pipeline/tlw_pipeline/cube.py` writes — u16 columns first, codes from 1, 0 meaning none. */
function makeCube(rows: Row[], months: { m: string; n: number }[]) {
  const tables: Record<string, string[]> = {}
  const code = (col: string, v: string | undefined) => {
    if (!v) return 0
    const t = (tables[col] ??= [])
    const at = t.indexOf(v)
    return at === -1 ? t.push(v) : at + 1
  }
  const values: Record<string, number[]> = {}
  for (const c of [...U16, ...U8]) values[c] = []
  for (const r of rows) {
    values['agency'].push(code('agency', r.agency))
    values['day'].push(code('day', r.day))
    values['topic'].push(code('topic', r.topic))
    values['action'].push(code('action', r.action))
    values['gov'].push(code('gov', r.gov))
    values['prov'].push(code('prov', r.prov))
    values['dtype'].push(code('dtype', r.dtype))
    values['flags'].push((r.tc ? 1 : 0) | (r.ac ? 2 : 0) | (r.gc ? 4 : 0))
  }
  const n = rows.length
  const buf = new ArrayBuffer(n * (U16.length * 2 + U8.length))
  const layout: CubeMeta['layout'] = []
  let offset = 0
  for (const c of U16) {
    new Uint16Array(buf, offset, n).set(values[c])
    layout.push({ name: c, type: 'u16', offset })
    offset += n * 2
  }
  for (const c of U8) {
    new Uint8Array(buf, offset, n).set(values[c])
    layout.push({ name: c, type: 'u8', offset })
    offset += n
  }
  let start = 0
  const meta: CubeMeta = {
    rows: n,
    bytes: buf.byteLength,
    encoding: 'gzip',
    layout,
    months: months.map((m) => {
      const out = { m: m.m, start, n: m.n }
      start += m.n
      return out
    }),
    codes: Object.fromEntries(
      [...U16, ...U8].filter((c) => c !== 'flags').map((c) => [c, [null, ...(tables[c] ?? [])]]),
    ),
    flags: { topic_corroborated: 1, action_corroborated: 2, govlevel_corroborated: 4 },
  }
  return buildCube(meta, buf)
}

const ALL = true
const rows: Row[] = [
  // 2023-01
  {
    day: '2023-01-05',
    topic: 'waste',
    action: 'rulemaking',
    gov: 'local',
    prov: 'ตรัง',
    dtype: 'ประกาศ',
    agency: 'a1',
    tc: ALL,
    ac: ALL,
    gc: ALL,
  },
  {
    day: '2023-01-09',
    topic: 'waste',
    action: 'appointment',
    gov: 'central',
    prov: 'ตรัง',
    dtype: 'ประกาศ',
    agency: 'a2',
    tc: ALL,
    ac: ALL,
    gc: ALL,
  },
  // an uncorroborated waste label: visible on the document, never counted as waste
  {
    day: '2023-01-20',
    topic: 'waste',
    action: 'rulemaking',
    gov: 'local',
    prov: 'ตรัง',
    dtype: 'กฎกระทรวง',
    agency: 'a1',
    tc: false,
    ac: false,
    gc: false,
  },
  // 2023-02
  {
    day: '2023-02-02',
    topic: 'transport',
    action: 'rulemaking',
    gov: 'local',
    prov: 'ภูเก็ต',
    dtype: 'ประกาศ',
    agency: 'a3',
    tc: ALL,
    ac: ALL,
    gc: ALL,
  },
  // 2024-07
  {
    day: '2024-07-11',
    topic: 'waste',
    action: 'rulemaking',
    gov: 'central',
    prov: 'ภูเก็ต',
    dtype: 'ประกาศ',
    agency: 'a1',
    tc: ALL,
    ac: ALL,
    gc: ALL,
  },
  {
    day: '2024-07-30',
    topic: undefined,
    action: undefined,
    gov: undefined,
    prov: undefined,
    dtype: 'ประกาศ',
    agency: 'a4',
  },
]
const MONTHS = [
  { m: '2023-01', n: 3 },
  { m: '2023-02', n: 1 },
  { m: '2024-07', n: 2 },
]
const cube = makeCube(rows, MONTHS)

const tax = {
  topics: {
    environment: { thai: 'สิ่งแวดล้อม', parent: null, n: 0, children: ['waste'] },
    waste: { thai: 'ขยะ', parent: 'environment', n: 0, children: [] },
    transport: { thai: 'คมนาคม', parent: null, n: 0, children: [] },
  },
  actions: {},
  govlevels: {},
  action_counts: {},
  govlevel_counts: {},
} as unknown as Taxonomy

const code = (dim: string, v: string) => cube.index[dim]?.get(v) ?? -1

describe('buildCube', () => {
  it('lays the columns out where cube.json says they are', () => {
    expect(cube.meta.rows).toBe(6)
    expect([...(cube.cols['prov'] ?? [])]).toEqual([1, 1, 1, 2, 2, 0])
    expect(codeName(cube, 'prov', 1)).toBe('ตรัง')
    expect(codeName(cube, 'prov', 0)).toBe(null)
  })

  it('refuses a blob that is not the size the header promised', () => {
    const meta = { ...cube.meta, bytes: cube.meta.bytes + 8 }
    expect(() => buildCube(meta, new ArrayBuffer(cube.meta.bytes))).toThrow(CubeError)
  })

  it('refuses a column that runs off the end', () => {
    const layout = cube.meta.layout.map((c) => (c.name === 'flags' ? { ...c, offset: c.offset + 4 } : c))
    expect(() => buildCube({ ...cube.meta, layout }, new ArrayBuffer(cube.meta.bytes))).toThrow(CubeError)
  })
})

describe('queryCube', () => {
  it('counts every row when nothing is filtered', () => {
    expect(queryCube(cube, {}).total).toBe(6)
  })

  it('returns rows newest first', () => {
    expect(queryCube(cube, {}).rows).toEqual([5, 4, 3, 2, 1, 0])
  })

  it('keeps the newest matches, not the oldest, when the cap bites', () => {
    expect(queryCube(cube, {}, { limit: 2 }).rows).toEqual([5, 4])
    expect(queryCube(cube, {}, { limit: 2 }).total).toBe(6)
  })

  it('combines filters across dimensions — the thing no pre-built facet file could answer', () => {
    const r = queryCube(cube, { topics: [code('topic', 'waste')], prov: 'ตรัง' })
    expect(r.total).toBe(2)
    expect(r.rows).toEqual([1, 0])
  })

  it('counts a labelled dimension only when the label is corroborated', () => {
    // row 2 carries topic=waste, action=rulemaking, gov=local, all uncorroborated
    expect(queryCube(cube, { topics: [code('topic', 'waste')] }).total).toBe(3)
    expect(queryCube(cube, { action: 'rulemaking' }).total).toBe(3)
    expect(queryCube(cube, { gov: 'local' }).total).toBe(2)
    // province is read off the record and has no such rule
    expect(queryCube(cube, { prov: 'ตรัง' }).total).toBe(3)
  })

  it('applies the same rule to group counts', () => {
    const g = queryCube(cube, {}, { groupBy: ['topic', 'prov'] })
    expect(g.groups['topic']?.get(code('topic', 'waste'))).toBe(3)
    expect(g.groups['prov']?.get(code('prov', 'ตรัง'))).toBe(3)
  })

  it('never counts code 0 as a value of its own', () => {
    const g = queryCube(cube, {}, { groupBy: ['prov'] })
    expect(g.groups['prov']?.has(0)).toBe(false)
    expect([...(g.groups['prov'] ?? [])].reduce((s, [, n]) => s + n, 0)).toBe(5)
  })

  it('finds nothing for a value the corpus has never carried', () => {
    // the dangerous failure is the opposite: an unknown filter silently matching everything
    expect(queryCube(cube, { prov: 'เชียงใหม่' }).total).toBe(0)
    expect(queryCube(cube, { agency: 'nope' }).total).toBe(0)
    expect(queryCube(cube, { topics: [] }).total).toBe(0)
  })

  it('filters a date range even though day codes are not in date order', () => {
    expect(queryCube(cube, { from: '2023-01-06', to: '2023-02-28' }).total).toBe(3)
    expect(queryCube(cube, { day: '2023-01-05' }).rows).toEqual([0])
    expect(queryCube(cube, { from: '2025-01-01' }).total).toBe(0)
  })

  it('refuses to group by a column that does not exist', () => {
    expect(() => queryCube(cube, {}, { groupBy: ['nope'] })).toThrow(CubeError)
  })
})

describe('rowLocation', () => {
  it('turns a row into the shard and offset that hold the document', () => {
    expect(rowLocation(cube, 0)).toEqual({ month: '2023-01', offset: 0 })
    expect(rowLocation(cube, 2)).toEqual({ month: '2023-01', offset: 2 })
    expect(rowLocation(cube, 3)).toEqual({ month: '2023-02', offset: 0 })
    expect(rowLocation(cube, 5)).toEqual({ month: '2024-07', offset: 1 })
  })

  it('reports nothing rather than a wrong document for a row out of range', () => {
    expect(rowLocation(cube, 99)).toBe(null)
  })
})

describe('planFetch', () => {
  it('stops at the shard budget and says what it left behind', () => {
    const plan = planFetch(cube, [5, 3, 0], 2)
    expect(plan.months).toEqual(['2024-07', '2023-02'])
    expect(plan.rows).toEqual([5, 3])
    expect(plan.rest).toEqual([0])
  })

  it('counts a shard once however many rows come from it', () => {
    const plan = planFetch(cube, [2, 1, 0, 3], 1)
    expect(plan.months).toEqual(['2023-01'])
    expect(plan.rows).toEqual([2, 1, 0])
    expect(plan.rest).toEqual([3])
  })
})

describe('taxonomy bridge', () => {
  it('resolves a topic to itself and its descendants', () => {
    expect(descendantCodes(cube, tax, 'environment').sort()).toEqual(
      [code('topic', 'environment'), code('topic', 'waste')].filter((c) => c !== -1).sort(),
    )
    // "environment" is a taxonomy node no document carries directly
    expect(descendantCodes(cube, tax, 'environment')).toEqual([code('topic', 'waste')])
  })

  it('counts a document for its topic and every ancestor', () => {
    const counts = queryCube(cube, {}, { groupBy: ['topic'] }).groups['topic'] ?? new Map()
    expect(rollUp(cube, tax, counts)).toEqual(
      new Map([
        ['waste', 3],
        ['environment', 3],
        ['transport', 1],
      ]),
    )
  })

  it('turns code counts back into the names a page shows', () => {
    const counts = queryCube(cube, {}, { groupBy: ['dtype'] }).groups['dtype'] ?? new Map()
    expect(named(cube, 'dtype', counts)).toEqual(
      new Map([
        ['ประกาศ', 5],
        ['กฎกระทรวง', 1],
      ]),
    )
  })
})

describe('crossFilter', () => {
  it('leaves each dimension out of its own count, so a dropdown says where you could go next', () => {
    const r = crossFilter(cube, tax, { prov: 'ตรัง' }, 50)
    expect(r.total).toBe(3)
    // provinces are counted with the province filter lifted — otherwise every other option reads 0
    expect(r.provinces.get('ภูเก็ต')).toBe(2)
    expect(r.provinces.get('ตรัง')).toBe(3)
    // everything else stays narrowed to ตรัง, corroborated only
    expect(r.topics.get('waste')).toBe(2)
    expect(r.actions.get('rulemaking')).toBe(1)
    expect(r.dtypes.get('ประกาศ')).toBe(2)
  })

  it('reports the topic total over the same population the chips count', () => {
    const r = crossFilter(cube, tax, {}, 50)
    // four of the six rows carry a corroborated topic; the fifth's is unconfirmed and the sixth
    // has none, so the chips must not add up to the six documents above them
    expect(r.topicTotal).toBe(4)
    expect(r.topics.get('environment')).toBe(3)
    expect(r.topics.get('transport')).toBe(1)
  })

  it('narrows a topic by ancestry', () => {
    const r = crossFilter(cube, tax, { topics: descendantCodes(cube, tax, 'environment') }, 50)
    expect(r.total).toBe(3)
    expect(r.provinces.get('ตรัง')).toBe(2)
    expect(r.provinces.get('ภูเก็ต')).toBe(1)
  })
})
