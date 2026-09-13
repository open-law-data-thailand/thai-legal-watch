import { describe, expect, it } from 'vitest'
import { binOf, quantileBins } from './thaimap'

describe('choropleth bands', () => {
  it('splits the provinces into equal-sized bands, not equal-width ones', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1)
    const cuts = quantileBins(values, 5)
    expect(cuts).toHaveLength(4)
    const counts = [0, 0, 0, 0, 0]
    for (const v of values) counts[binOf(v, cuts)]++
    for (const c of counts) expect(c).toBe(20)
  })
  it('keeps one huge outlier from washing out the rest', () => {
    const cuts = quantileBins([1, 2, 3, 4, 5, 6, 7, 8, 9, 5000], 5)
    expect(binOf(5000, cuts)).toBe(4)
    expect(binOf(1, cuts)).toBe(0)
    expect(binOf(5, cuts)).toBeGreaterThan(0)
  })
  it('has no bands at all when nothing has a count', () => {
    expect(quantileBins([], 5)).toEqual([])
    expect(binOf(3, [])).toBe(0)
  })
})
