import { describe, expect, it } from 'vitest'
import {
  beYear,
  beMonth,
  beRange,
  percent,
  coordinates,
  parseISODate,
  partLabel,
  thaiDate,
  thaiDigits,
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

describe('Buddhist-era months', () => {
  it('keeps the shard shape but shows the year Thai readers use', () => {
    expect(beMonth('2026-09')).toBe('2569-09')
    expect(beMonth('2005-01')).toBe('2548-01')
  })
  it('leaves anything that is not a month alone', () => {
    expect(beMonth('2026')).toBe('2026')
    expect(beMonth('')).toBe('')
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
})

it('thaiDigits and beYear', () => {
  expect(thaiDigits(2567)).toBe('๒๕๖๗')
  expect(beYear('2024')).toBe(2567)
})

describe('percent and year ranges', () => {
  it('never rounds an imperfect share up to a perfect one', () => {
    expect(percent(729_566, 732_143)).toBe('99.6%')
    expect(percent(732_143, 732_143)).toBe('100%')
    expect(percent(1, 2)).toBe('50%')
    expect(percent(0, 10)).toBe('0%')
  })
  it('says nothing rather than NaN when there is nothing to divide', () => {
    expect(percent(0, 0)).toBe('—')
    expect(percent(5, 0)).toBe('—')
  })
  it('turns a year list into a Buddhist span, or a dash', () => {
    expect(beRange(['2005', '2026'])).toBe('2548–2569')
    expect(beRange(['2026'])).toBe('2569')
    expect(beRange([])).toBe('—')
    expect(beRange(undefined)).toBe('—')
  })
})
