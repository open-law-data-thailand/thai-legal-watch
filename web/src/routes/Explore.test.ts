import { describe, expect, it } from 'vitest'
import type { SlimDoc, Taxonomy } from '../data/types'
import { filtersFrom, matches, toCsv } from './Explore'

const tax = {
  topics: {
    environment: { thai: 'x', parent: null, n: 1, children: ['pollution'] },
    pollution: { thai: 'y', parent: 'environment', n: 1, children: ['pollution_waste'] },
    pollution_waste: { thai: 'z', parent: 'pollution', n: 1, children: [] },
  },
  actions: {},
  govlevels: {},
  action_counts: {},
  govlevel_counts: {},
} as unknown as Taxonomy
const doc = (o: Partial<SlimDoc>): SlimDoc => ({
  id: '2024-000001',
  t: 'ข้อบัญญัติ เรื่อง การจัดการ มูลฝอย',
  d: '2024-01-02',
  v: 141,
  p: '17 ง',
  pg: 1,
  dt: null,
  a: 'a1',
  pr: 'ตรัง',
  topic: 'pollution_waste',
  action: 'rulemaking',
  govlevel: 'local',
  tc: true,
  ac: true,
  gc: true,
  labels: [],
  ...o,
})

describe('matches', () => {
  it('matches a topic through its ancestors', () => {
    expect(matches(doc({}), { topic: 'environment' }, tax)).toBe(true)
    expect(matches(doc({}), { topic: 'pollution_waste' }, tax)).toBe(true)
    expect(matches(doc({ topic: 'bankruptcy' }), { topic: 'environment' }, tax)).toBe(false)
  })
  it('ignores an uncorroborated label, the way every count on the page does', () => {
    // the counts beside the chips always applied this rule and the filter did not, so a chip
    // could read "(120)" and then list 150 documents
    expect(matches(doc({ tc: false }), { topic: 'environment' }, tax)).toBe(false)
    expect(matches(doc({ ac: false }), { action: 'rulemaking' }, tax)).toBe(false)
    expect(matches(doc({ gc: false }), { govlevel: 'local' }, tax)).toBe(false)
    // it is a rule about the three labelled dimensions, not about the document
    expect(matches(doc({ tc: false, ac: false, gc: false }), { province: 'ตรัง' }, tax)).toBe(true)
  })
  it('filters by document type', () => {
    expect(matches(doc({ dt: 'ประกาศ' }), { dtype: 'ประกาศ' }, tax)).toBe(true)
    expect(matches(doc({ dt: 'ประกาศ' }), { dtype: 'กฎกระทรวง' }, tax)).toBe(false)
    expect(matches(doc({ dt: null }), { dtype: 'ประกาศ' }, tax)).toBe(false)
    expect(filtersFrom(new URLSearchParams('dtype=ประกาศ')).dtype).toBe('ประกาศ')
  })
  it('ANDs every set filter and ignores whitespace in title search', () => {
    expect(matches(doc({}), { govlevel: 'local', province: 'ตรัง', q: 'มูล ฝอย' }, tax)).toBe(true)
    expect(matches(doc({}), { govlevel: 'central' }, tax)).toBe(false)
    expect(matches(doc({}), { agency: 'zzz' }, tax)).toBe(false)
  })
})

it('filtersFrom reads only known keys and defaults the scope to month', () => {
  const f = filtersFrom(new URLSearchParams('topic=health&evil=1&q=x'))
  expect(f).toMatchObject({ topic: 'health', q: 'x', scope: 'month' })
  expect('evil' in f).toBe(false)
  expect(filtersFrom(new URLSearchParams('scope=year&year=2024')).scope).toBe('year')
  expect(filtersFrom(new URLSearchParams('scope=bogus')).scope).toBe('month')
})

it('matches can leave one dimension open for option counts', () => {
  expect(matches(doc({}), { govlevel: 'central', topic: 'environment' }, tax, 'govlevel')).toBe(true)
  expect(matches(doc({}), { govlevel: 'central', topic: 'bankruptcy' }, tax, 'govlevel')).toBe(false)
})

it('toCsv escapes quotes and starts with a BOM for Excel', () => {
  const csv = toCsv([doc({ t: 'title with "quotes"' })])
  expect(csv.startsWith('\uFEFF')).toBe(true)
  expect(csv).toContain('"title with ""quotes"""')
})

it('toCsv gives a spreadsheet reader the Thai names and a link, not just slugs', () => {
  const tax = {
    topics: { pollution_waste: { thai: 'ขยะ', parent: null, n: 1, children: [] } },
    actions: { rulemaking: 'ออกกฎ' },
    govlevels: { local: 'ท้องถิ่น' },
    action_counts: {},
    govlevel_counts: {},
  }
  const csv = toCsv(
    [
      doc({
        id: '2024-000128',
        d: '2024-02-03',
        topic: 'pollution_waste',
        action: 'rulemaking',
        govlevel: 'local',
      }),
    ],
    tax,
    'https://example.org/',
  )
  const [head, row] = csv.replace('\uFEFF', '').split('\n')
  expect(head?.split(',')).toContain('topic_thai')
  expect(row).toContain('"ขยะ"')
  expect(row).toContain('"ออกกฎ"')
  expect(row).toContain('"ท้องถิ่น"')
  expect(row).toContain('https://example.org/#/ratchakitcha/doc/2024-000128?m=2024-02')
})

it('toCsv survives a document with nothing filled in', () => {
  const csv = toCsv([doc({ d: null, v: null, p: null, pg: null, topic: null, action: null, govlevel: null })])
  expect(csv.split('\n')).toHaveLength(3) // header, one row, trailing newline
  expect(csv).not.toContain('undefined')
  expect(csv).not.toContain('null')
})
