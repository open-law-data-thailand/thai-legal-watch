import { describe, expect, it } from 'vitest'
import { byDay, matchesText, visibleDays } from './Latest'
import type { SlimDoc } from '../data/types'

const doc = (p: Partial<SlimDoc>): SlimDoc => ({
  id: '2026-09-11-00125346',
  t: 'ประกาศกระทรวงมหาดไทย เรื่อง การให้ใช้บังคับผังเมืองรวม',
  d: '2026-09-11',
  v: 143,
  p: '222 ง พิเศษ',
  pg: 27,
  dt: 'ประกาศ',
  a: 'a1',
  pr: null,
  topic: null,
  action: null,
  govlevel: null,
  tc: false,
  ac: false,
  gc: false,
  labels: [],
  ...p,
})

describe('the filter', () => {
  it('matches an exact run of characters, ignoring spaces on both sides', () => {
    const d = doc({})
    expect(matchesText(d, 'ผังเมือง', undefined)).toBe(true)
    expect(matchesText(d, 'ผังเมืองรวม', undefined)).toBe(true)
    // Thai is written without spaces; a phrase pasted out of a document must still match
    expect(matchesText(doc({ t: 'ผัง เมือง รวม' }), 'ผังเมืองรวม', undefined)).toBe(true)
    expect(matchesText(d, 'ผังเมืองจังหวัด', undefined)).toBe(false)
  })
  it('searches the things printed beside the title, not only the title', () => {
    const d = doc({ t: 'ประกาศ', pr: 'ตรัง', dt: 'ข้อบัญญัติ' })
    expect(matchesText(d, 'ตรัง', undefined)).toBe(true)
    expect(matchesText(d, 'ข้อบัญญัติ', undefined)).toBe(true)
    expect(matchesText(d, '00125346', undefined)).toBe(true)
    expect(matchesText(d, 'เทศบาลนครตรัง', 'เทศบาลนครตรัง')).toBe(true)
  })
  it('keeps everything when nothing is typed', () => {
    expect(matchesText(doc({}), '', undefined)).toBe(true)
  })
})

describe('grouping by day', () => {
  const docs = [
    doc({ id: 'a', d: '2026-09-11' }),
    doc({ id: 'b', d: '2026-09-11' }),
    doc({ id: 'c', d: '2026-09-10' }),
    doc({ id: 'd', d: '2026-09-11' }), // out of order: a new run, not a merge
  ]
  it('makes one run per stretch of the same date', () => {
    const days = byDay(docs)
    expect(days.map((g) => [g.date, g.total])).toEqual([
      ['2026-09-11', 2],
      ['2026-09-10', 1],
      ['2026-09-11', 1],
    ])
  })
  it('handles a document with no date at all', () => {
    expect(byDay([doc({ d: null })])[0]?.date).toBe('')
  })

  it('reports the day’s own count even when the page shows fewer', () => {
    // the number beside a date is a fact about that day, not about how far the page has scrolled
    const days = byDay(Array.from({ length: 200 }, (_, i) => doc({ id: `x${i}`, d: '2026-09-11' })))
    const shown = visibleDays(days, 150)
    expect(shown[0]?.total).toBe(200)
    expect(shown[0]?.docs).toHaveLength(150)
  })
  it('stops once the limit is used up, and keeps whole days below it', () => {
    const days = byDay([
      doc({ id: '1', d: '2026-09-11' }),
      doc({ id: '2', d: '2026-09-10' }),
      doc({ id: '3', d: '2026-09-09' }),
    ])
    expect(visibleDays(days, 2).map((g) => g.date)).toEqual(['2026-09-11', '2026-09-10'])
    expect(visibleDays(days, 99)).toHaveLength(3)
    expect(visibleDays(days, 0)).toEqual([])
  })
})
