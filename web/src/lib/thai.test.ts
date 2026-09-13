import { describe, expect, it } from 'vitest'
import {
  beYear,
  citation,
  coordinates,
  parseISODate,
  partLabel,
  thaiDate,
  thaiDigits,
  formatNumber,
} from './thai'

describe('thaiDate', () => {
  it('renders Buddhist year and Thai month', () => {
    expect(thaiDate('2024-03-29')).toBe('29 มีนาคม 2567')
    expect(thaiDate('2024-03-29', { short: true })).toBe('29 มี.ค. 2567')
  })
  it('is safe on missing or malformed input', () => {
    expect(thaiDate(null)).toBe('—')
    expect(thaiDate('not a date')).toBe('—')
    expect(parseISODate('2024-13-01')).toBeNull()
  })
})

describe('coordinates and citation', () => {
  it('spells out ตอนพิเศษ and ตอนที่', () => {
    expect(partLabel('211 ง พิเศษ')).toBe('ตอนพิเศษ 211 ง')
    expect(partLabel('17 ก')).toBe('ตอนที่ 17 ก')
  })
  it('omits unknown parts without dangling spaces', () => {
    expect(coordinates({ volume: 141, part: null, page: null, date: null })).toBe('เล่ม 141')
    expect(coordinates({ volume: null, part: null, page: null, date: null })).toBe('')
  })
  it('produces the standard citation', () => {
    expect(citation('กฎกระทรวง ก', { volume: 141, part: '17 ก', page: 4, date: '2024-03-29' })).toBe(
      'กฎกระทรวง ก, ราชกิจจานุเบกษา เล่ม 141 ตอนที่ 17 ก หน้า 4 (29 มีนาคม 2567).',
    )
  })
})

it('thaiDigits, beYear, formatNumber', () => {
  expect(thaiDigits(2567)).toBe('๒๕๖๗')
  expect(beYear('2024')).toBe(2567)
  expect(formatNumber(1234567)).toBe('1,234,567')
})
