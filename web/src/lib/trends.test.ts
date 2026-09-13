import { describe, expect, it } from 'vitest'
import { completeYears, monthProfile, movers, sumAt, yearToDate } from './trends'
import type { Trends, Years } from '../data/types'

const years = ['2020', '2021', '2022', '2023', '2024', '2025', '2026']

describe('complete years', () => {
  it('drops the year the corpus is still in the middle of', () => {
    expect(completeYears(years, '2026-09-11')).toEqual(['2020', '2021', '2022', '2023', '2024', '2025'])
  })
  it('keeps everything when there is no latest date to judge by', () => {
    expect(completeYears(years, null)).toEqual(years)
  })
})

describe('movers', () => {
  const complete = ['2020', '2021', '2022', '2023', '2024', '2025']
  it('compares the last three complete years against the three before', () => {
    const series = { rising: [60, 60, 60, 600, 600, 600], falling: [1000, 1000, 1000, 100, 100, 100, 0] }
    const m = movers(series, years, complete, 3, 1)
    const by = Object.fromEntries(m.map((x) => [x.key, x]))
    expect(by.rising?.before).toBe(180)
    expect(by.rising?.after).toBe(1800)
    expect(by.rising?.ratio).toBeCloseTo(9)
    expect(by.falling?.change).toBe(-2700)
    expect(by.falling?.ratio).toBeCloseTo(-0.9)
  })

  it('ignores the partial year even though it is in the series', () => {
    const m = movers({ a: [0, 0, 0, 50, 50, 50, 9999] }, years, complete, 3, 1)
    expect(m[0]?.after).toBe(150)
  })
  it('keeps a topic with four documents off the leaderboard', () => {
    expect(movers({ tiny: [1, 0, 0, 4, 0, 0] }, years, complete, 3, 150)).toEqual([])
  })
  it('says nothing rather than printing a percentage off a base of one', () => {
    // 1 -> 384 is not a 38,300% rise, it is a category that did not exist before
    const m = movers({ born: [1, 0, 0, 384, 0, 0] }, years, complete, 3, 1)
    expect(m[0]?.ratio).toBeNull()
    expect(m[0]?.change).toBe(383)
  })

  it('ranks by how many documents moved, not by percentage', () => {
    const m = movers({ tiny: [60, 0, 0, 600, 0, 0], big: [2000, 0, 0, 6600, 0, 0] }, years, complete, 3, 1)
    expect(m.map((x) => x.key)).toEqual(['big', 'tiny'])
  })
})

describe('month profile and year to date', () => {
  const y: Years = {
    by_year: { '2025': 30, '2026': 12 },
    by_month: { '2025-01': 10, '2025-02': 20, '2026-01': 7, '2026-02': 5, '2026-09': 100 },
  }
  it('adds up the same calendar month across every year', () => {
    const p = monthProfile(y)
    expect(p).toHaveLength(12)
    expect(p[0]).toEqual({ month: 1, n: 17 })
    expect(p[1]).toEqual({ month: 2, n: 25 })
    expect(p[11]).toEqual({ month: 12, n: 0 })
  })
  it('compares only the months both years actually have', () => {
    const ytd = yearToDate(y, '2026-02-10')
    expect(ytd).toEqual({ year: '2026', now: 12, then: 30, months: 2 })
  })
  it('has nothing to say without a latest date', () => {
    expect(yearToDate(y, null)).toBeNull()
  })
})

it('sums several keys of one group at one year', () => {
  const t: Trends = {
    years: ['2024', '2025'],
    topics: {},
    actions: { rulemaking: [5, 7], amendment: [1, 2], repeal: [0, 1] },
    govlevels: {},
  }
  expect(sumAt(t, 'actions', ['rulemaking', 'amendment', 'repeal'], '2025')).toBe(10)
  expect(sumAt(t, 'actions', ['rulemaking'], '1999')).toBe(0)
})
