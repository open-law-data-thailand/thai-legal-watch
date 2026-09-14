import { describe, expect, it } from 'vitest'
import { shares, spread, verdict } from './authority'

const rows = (...ns: number[]) => ns.map((n, i) => ({ id: `a${i}`, name: `หน่วย ${i}`, n }))

describe('shares', () => {
  it('ranks by size and reports each as a fraction of the whole', () => {
    const s = shares(rows(10, 50, 40), 100)
    expect(s.map((r) => r.n)).toEqual([50, 40, 10])
    expect(s[0]?.share).toBeCloseTo(0.5)
  })

  it('drops entries with nothing in them, and refuses to divide by nothing', () => {
    expect(shares(rows(3, 0, 1), 4).map((r) => r.n)).toEqual([3, 1])
    expect(shares(rows(3), 0)).toEqual([])
  })
})

describe('spread', () => {
  it('counts how many it takes to reach four fifths', () => {
    // 50 + 30 = 80%
    const sp = spread(rows(50, 30, 10, 10), 100)
    expect(sp.needed).toBe(2)
    expect(sp.top).toBeCloseTo(0.5)
    expect(sp.covered).toBeCloseTo(1)
  })

  it('says one when a single body holds most of it', () => {
    expect(spread(rows(85, 10, 5), 100).needed).toBe(1)
  })

  it('refuses to answer when the list runs out before four fifths', () => {
    // the facet pages carry the fifty largest; a subject spread over thousands cannot be
    // summarised from them, and "50" would be a lie shaped like a fact
    const sp = spread(rows(...Array<number>(50).fill(2)), 1000)
    expect(sp.needed).toBeNull()
    expect(sp.listed).toBe(50)
    expect(sp.covered).toBeCloseTo(0.1)
  })

  it('handles a subject with no agency at all', () => {
    const sp = spread([], 12)
    expect(sp).toEqual({ top: 0, needed: null, covered: 0, listed: 0 })
  })
})

describe('verdict', () => {
  it('names the single-authority case plainly', () => {
    expect(verdict(spread(rows(24), 24), 1)).toContain('รายเดียว')
  })

  it('gives the number that tells a reader how many doors there are', () => {
    expect(verdict(spread(rows(50, 30, 20), 100), 3)).toContain('2 หน่วยงาน')
  })

  it('says the list is trimmed rather than implying it is complete', () => {
    const v = verdict(spread(rows(...Array<number>(50).fill(2)), 1000), 2436)
    expect(v).toContain('50 อันดับแรก')
    expect(v).toContain('กระจายมาก')
  })

  it('says so when nothing is attributable', () => {
    expect(verdict(spread([], 2))).toContain('ยังไม่มีหน่วยงาน')
  })
})
