import { expect, it } from 'vitest'
import { otherPart, parseCitation, pickByPage } from './coords'

it('parses the long form with ตอนที่ / ตอนพิเศษ and Thai digits', () => {
  expect(parseCitation('เล่ม 143 ตอนพิเศษ 219 ง หน้า 23')).toEqual({
    volume: 143,
    part: '219 ง พิเศษ',
    page: 23,
  })
  expect(parseCitation('เล่ม ๑๔๑ ตอนที่ ๑๗ ก หน้า ๔')).toEqual({ volume: 141, part: '17 ก', page: 4 })
  expect(parseCitation('เล่ม 143 ตอน 219 ง พิเศษ')).toEqual({ volume: 143, part: '219 ง พิเศษ', page: null })
})
it('parses the short form and rejects other text', () => {
  expect(parseCitation('143/219ง/23')).toEqual({ volume: 143, part: '219 ง', page: 23 })
  expect(parseCitation('143 / 17 ก พิเศษ')).toEqual({ volume: 143, part: '17 ก พิเศษ', page: null })
  expect(parseCitation('ขยะ')).toBeNull()
})
it('picks the document that starts at or before the cited page', () => {
  const docs = [
    { id: 'c', pg: 20 },
    { id: 'a', pg: 1 },
    { id: 'b', pg: 7 },
  ]
  expect(pickByPage(docs, 9)?.id).toBe('b')
  expect(pickByPage(docs, 20)?.id).toBe('c')
  expect(pickByPage(docs, null)?.id).toBe('a')
  expect(pickByPage(docs, 0)?.id).toBe('a')
  expect(pickByPage([], 3)).toBeNull()
})

it('otherPart adds and removes the พิเศษ marker without touching the rest', () => {
  expect(otherPart('341 ง')).toBe('341 ง พิเศษ')
  expect(otherPart('341 ง พิเศษ')).toBe('341 ง')
  expect(otherPart('17 ก')).toBe('17 ก พิเศษ')
})
