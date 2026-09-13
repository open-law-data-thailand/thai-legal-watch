import { expect, it } from 'vitest'
import type { Facet } from '../data/types'
import { mainAction, mainActionHint } from './Facet'

const facet = (total: number, by_action: Record<string, number>): Facet => ({
  total,
  by_action,
  by_year: {},
  by_month: {},
  by_topic: {},
  by_govlevel: {},
  agencies: [],
  provinces: {},
  recent: [],
})

it('names the main action only when corroborated labels cover a fifth of the facet', () => {
  expect(mainAction(facet(1000, { registration: 357 }), undefined)).toBe('registration')
  expect(mainAction(facet(444_029, { registration: 357 }), undefined)).toBe('ยืนยันได้ไม่พอจะสรุป')
  expect(mainAction(facet(0, {}), undefined)).toBe('ยืนยันได้ไม่พอจะสรุป')
  expect(mainActionHint(facet(200, { a: 50, b: 50 }))).toBe('ยืนยันแล้ว 50% ของฉบับทั้งหมด')
})
