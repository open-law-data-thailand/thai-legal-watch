/** The ways a Thai lawyer writes down a gazette item. The coordinates are the same in every
 *  format; what changes is the order, the punctuation and whether the numerals are Thai. */
import { coordinates, parseISODate, partLabel, thaiDate, thaiDigits, type Coordinates } from './thai'

export type CiteFormat = 'standard' | 'footnote' | 'apa' | 'coords'

export const CITE_FORMATS: { id: CiteFormat; label: string; hint: string }[] = [
  {
    id: 'standard',
    label: 'มาตรฐาน',
    hint: 'ชื่อเรื่อง, ราชกิจจานุเบกษา เล่ม 141 ตอนที่ 17 ก หน้า 4 (29 มีนาคม 2567).',
  },
  {
    id: 'footnote',
    label: 'เชิงอรรถ (เลขไทย)',
    hint: 'ชื่อเรื่อง. ราชกิจจานุเบกษา เล่ม ๑๔๑ ตอนที่ ๑๗ ก หน้า ๔ (๒๙ มีนาคม ๒๕๖๗).',
  },
  { id: 'apa', label: 'APA', hint: 'ชื่อเรื่อง. (2567, 29 มีนาคม). ราชกิจจานุเบกษา, 141(ตอนที่ 17 ก), 4.' },
  { id: 'coords', label: 'พิกัดอย่างเดียว', hint: 'เล่ม 141 ตอนที่ 17 ก หน้า 4' },
]

export function formatCitation(fmt: CiteFormat, title: string, c: Coordinates): string {
  switch (fmt) {
    case 'standard':
      return `${title}, ราชกิจจานุเบกษา ${coordinates(c)} (${thaiDate(c.date)}).`
    case 'footnote':
      return `${title}. ราชกิจจานุเบกษา ${thaiDigits(coordinates(c))} (${thaiDigits(thaiDate(c.date))}).`
    case 'apa': {
      const p = parseISODate(c.date)
      const dayMonth = thaiDate(c.date).replace(/\s\d+$/, '')
      const when = p ? `(${p.y + 543}, ${dayMonth})` : '(ม.ป.ป.)'
      const vol = c.volume ? `${c.volume}` : ''
      const part = c.part ? `(${partLabel(c.part)})` : ''
      const page = c.page ? `, ${c.page}` : ''
      return `${title}. ${when}. ราชกิจจานุเบกษา, ${vol}${part}${page}.`
    }
    case 'coords':
      return coordinates(c)
  }
}

/** An absolute link to this document on this site, for pasting into a memo or an email. */
export function permalink(id: string, month: string | undefined, source: string): string {
  const origin = typeof location === 'undefined' ? '' : `${location.origin}${location.pathname}`
  return `${origin}#/${source}/doc/${encodeURIComponent(id)}${month ? `?m=${month}` : ''}`
}
