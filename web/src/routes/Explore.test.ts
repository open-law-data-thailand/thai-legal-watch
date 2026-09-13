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
  it('ANDs every set filter and ignores whitespace in title search', () => {
    expect(matches(doc({}), { govlevel: 'local', province: 'ตรัง', q: 'มูล ฝอย' }, tax)).toBe(true)
    expect(matches(doc({}), { govlevel: 'central' }, tax)).toBe(false)
    expect(matches(doc({}), { agency: 'zzz' }, tax)).toBe(false)
  })
})

it('filtersFrom reads only known keys', () => {
  const f = filtersFrom(new URLSearchParams('topic=health&evil=1&q=x'))
  expect(f).toMatchObject({ topic: 'health', q: 'x' })
  expect('evil' in f).toBe(false)
})

it('toCsv escapes quotes and starts with a BOM for Excel', () => {
  const csv = toCsv([doc({ t: 'เรื่อง "ก"' })])
  expect(csv.startsWith('\uFEFFid,title')).toBe(true)
  expect(csv).toContain('"เรื่อง ""ก"""')
  expect(csv.trim().split('\n')).toHaveLength(2)
})
