import { expect, it } from 'vitest'
import { docLinks } from './Doc'

it('opens modern ids straight at the gazette', () => {
  const l = docLinks('2026-09-10-00125805', '2026-09')
  expect(l.primary.href).toBe('https://ratchakitcha.soc.go.th/documents/125805.pdf')
  expect(l.fromSource).toBe(true)
  expect(l.secondary).toBeUndefined()
})

it('never hands a legacy id a hundred-megabyte download', () => {
  for (const [id, month] of [
    ['2024-001232', '2024-03'],
    ['2014-009286', '2014-06'],
    ['2014-009286', undefined],
  ] as const) {
    const l = docLinks(id, month)
    expect(l.fromSource).toBe(false)
    expect(l.primary.href).toBe('https://ratchakitcha.soc.go.th/')
    // the second-best link is the file's page on Hugging Face, not the file itself
    expect(l.secondary?.href).toMatch(/\/blob\/main\/zip\//)
    expect(l.secondary?.href).not.toMatch(/\/resolve\//)
  }
  expect(docLinks('2014-009286', undefined).secondary?.href).toMatch(/2014-01\.zip$/)
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
  expect(evidenceLabel('auth')).toBe('ชื่อผู้ออก')
  expect(evidenceLabel('^profession')).toBe('เกณฑ์ profession')
})
