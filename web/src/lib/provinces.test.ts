import { describe, expect, it } from 'vitest'
import { PROVINCES, REGIONS } from './provinces'

describe('province table', () => {
  it('covers all 77 provinces exactly once', () => {
    expect(PROVINCES).toHaveLength(77)
    expect(new Set(PROVINCES.map((p) => p.name)).size).toBe(77)
  })
  it('uses the official six-region division with its usual sizes', () => {
    const size = (r: (typeof REGIONS)[number]) => PROVINCES.filter((p) => p.region === r).length
    expect(size('เหนือ')).toBe(9)
    expect(size('ตะวันออกเฉียงเหนือ')).toBe(20)
    expect(size('กลาง')).toBe(22) // 21 + กรุงเทพมหานคร
    expect(size('ตะวันออก')).toBe(7)
    expect(size('ตะวันตก')).toBe(5)
    expect(size('ใต้')).toBe(14)
  })
})
