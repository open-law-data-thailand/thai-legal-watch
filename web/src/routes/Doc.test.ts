import { expect, it } from 'vitest'
import { pdfLink } from './Doc'

it('links modern ids to the source and legacy ids to the dataset zip', () => {
  expect(pdfLink('2026-09-10-00125805', '2026-09').href).toBe(
    'https://ratchakitcha.soc.go.th/documents/125805.pdf',
  )
  expect(pdfLink('2024-001232', '2024-03').href).toMatch(/zip\/2024\/2024-03\.zip$/)
  expect(pdfLink('2014-009286', '2014-06').href).toMatch(/zip\/2014\/2014-06\.zip$/)
  expect(pdfLink('2014-009286', undefined).href).toMatch(/2014-01\.zip$/)
})

it('names bankruptcy stages in Thai and passes unknown keys through', async () => {
  const { xLabel, xValue } = await import('./Doc')
  expect(xValue('stage', 'absolute_receivership')).toBe('พิทักษ์ทรัพย์เด็ดขาด')
  expect(xValue('court', 'ศาลแพ่ง')).toBe('ศาลแพ่ง')
  expect(xLabel('case_number')).toBe('หมายเลขคดี')
  expect(xLabel('other')).toBe('other')
})

it('turns a raw rule name into a readable evidence label', async () => {
  const { evidenceLabel } = await import('./Doc')
  expect(evidenceLabel('auth')).toBe('ผู้ออก')
  expect(evidenceLabel('^profession')).toBe('กฎ profession')
})
