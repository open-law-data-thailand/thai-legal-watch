import { describe, expect, it } from 'vitest'
import { CITE_FORMATS, formatCitation, permalink } from './cite'

const c = { volume: 141, part: '17 ก', page: 4, date: '2024-03-29' }
const special = { volume: 143, part: '219 ง พิเศษ', page: 23, date: '2026-09-10' }

describe('citation formats', () => {
  it('writes the standard form the way the gazette prints the coordinates', () => {
    expect(formatCitation('standard', 'กฎกระทรวง ก', c)).toBe(
      'กฎกระทรวง ก, ราชกิจจานุเบกษา เล่ม 141 ตอนที่ 17 ก หน้า 4 (29 มีนาคม 2567).',
    )
  })
  it('uses Thai numerals throughout the footnote form', () => {
    expect(formatCitation('footnote', 'กฎกระทรวง ก', c)).toBe(
      'กฎกระทรวง ก. ราชกิจจานุเบกษา เล่ม ๑๔๑ ตอนที่ ๑๗ ก หน้า ๔ (๒๙ มีนาคม ๒๕๖๗).',
    )
  })
  it('puts the year first and the page last in APA', () => {
    expect(formatCitation('apa', 'กฎกระทรวง ก', c)).toBe(
      'กฎกระทรวง ก. (2567, 29 มีนาคม). ราชกิจจานุเบกษา, 141(ตอนที่ 17 ก), 4.',
    )
  })
  it('keeps ตอนพิเศษ in every form', () => {
    for (const f of CITE_FORMATS) expect(formatCitation(f.id, 'ประกาศ', special)).toMatch(/พิเศษ/)
  })
  it('drops what the record does not have instead of inventing it', () => {
    expect(formatCitation('coords', 'ประกาศ', { volume: 141, part: null, page: null, date: null })).toBe(
      'เล่ม 141',
    )
    expect(formatCitation('apa', 'ประกาศ', { volume: null, part: null, page: null, date: null })).toBe(
      'ประกาศ. (ม.ป.ป.). ราชกิจจานุเบกษา, .',
    )
  })
  it('builds a permalink that the hash router can parse back', () => {
    expect(permalink('2024-004135', '2024-03', 'ratchakitcha')).toContain(
      '#/ratchakitcha/doc/2024-004135?m=2024-03',
    )
  })
})
