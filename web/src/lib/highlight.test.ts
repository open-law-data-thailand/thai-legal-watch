import { expect, it } from 'vitest'
import { highlight } from './highlight'

it('marks every occurrence, ignoring spaces in both title and query', () => {
  const segs = highlight('การจัดการ มูลฝอย และมูล ฝอยติดเชื้อ', 'มูลฝอย')
  expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(['มูลฝอย', 'มูล ฝอย'])
  expect(segs.map((s) => s.text).join('')).toBe('การจัดการ มูลฝอย และมูล ฝอยติดเชื้อ')
})
it('returns the title untouched without a query or a match', () => {
  expect(highlight('ก ข', '')).toEqual([{ text: 'ก ข', hit: false }])
  expect(highlight('ก ข', 'ค')).toEqual([{ text: 'ก ข', hit: false }])
})
