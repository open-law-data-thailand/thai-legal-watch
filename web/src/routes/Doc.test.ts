import { expect, it } from 'vitest'
import { pdfLink } from './Doc'

it('links modern ids to the source and legacy ids to the dataset zip', () => {
  expect(pdfLink('2024-001232', '2024-03').href).toBe('https://ratchakitcha.soc.go.th/documents/1232.pdf')
  expect(pdfLink('2014-009286', '2014-06').href).toMatch(/zip\/2014\/2014-06\.zip$/)
  expect(pdfLink('2014-009286', undefined).href).toMatch(/2014-01\.zip$/)
})
