import { expect, it } from 'vitest'
import { search } from './QuickSearch'

const idx = {
  topics: [
    { slug: 'pollution_waste', thai: 'ของเสีย ขยะ และสารอันตราย', n: 1316 },
    { slug: 'health', thai: 'สาธารณสุข', n: 9 },
  ],
  provinces: [{ name: 'ตรัง', file: 'ตรัง', n: 40 }],
  agencies: [
    { id: 'a1', name: 'องค์การบริหารส่วนตำบลนาโยงเหนือ', n: 12, page: true },
    { id: 'a2', name: 'อบต.เล็ก', n: 1, page: false },
  ],
}

it('finds topics by Thai or slug ignoring spaces, provinces, agencies by size, and document ids', () => {
  expect(search('ขยะ', idx)[0]).toMatchObject({ kind: 'หมวด', to: '#/ratchakitcha/topic/pollution_waste' })
  expect(search('waste', idx)[0]?.kind).toBe('หมวด')
  expect(search('ตรัง', idx)[0]).toMatchObject({ kind: 'จังหวัด' })
  expect(search('นาโยง', idx)[0]).toMatchObject({ kind: 'หน่วยงาน', to: '#/ratchakitcha/agency/a1' })
  expect(search('อบต.เล็ก', idx)[0]?.to).toMatch(/explore\?agency=a2/)
  expect(search('2026-09-10-00125805', idx)[0]).toMatchObject({ kind: 'เอกสาร' })
  expect(search('   ', idx)).toEqual([])
})

it('recognises a gazette citation as a resolvable hit', () => {
  const h = search('เล่ม 143 ตอนพิเศษ 219 ง หน้า 23', idx)[0]
  expect(h?.kind).toBe('อ้างอิง')
  expect(h?.citation).toEqual({ volume: 143, part: '219 ง พิเศษ', page: 23 })
})
