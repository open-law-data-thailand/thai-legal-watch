import { describe, expect, it } from 'vitest'
import { docLinks, sourceHref } from './Doc'

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

describe("the publisher's own link, once upstream backfills it", () => {
  it('prefers the dataset url over anything derived, for a year that could not derive one', () => {
    // 1885: no modern id to read a number out of — before source_url there was no link at all
    const l = docLinks('1885-000092', '1885-01', 1010467)
    expect(l.primary.href).toBe('https://ratchakitcha.soc.go.th/documents/1010467.pdf')
    expect(l.fromSource).toBe(true)
    expect(l.secondary).toBeUndefined()
  })

  it('agrees with the id-derived link when both exist', () => {
    // verified against the publisher: the PDF at this URL is byte-identical to the dataset's own
    const derived = docLinks('2026-09-01-00121899', '2026-09').primary.href
    const given = docLinks('2026-09-01-00121899', '2026-09', 121899).primary.href
    expect(given).toBe(derived)
    expect(given).toBe('https://ratchakitcha.soc.go.th/documents/121899.pdf')
  })

  it('still falls back when the field is missing, so the gap years keep working', () => {
    for (const u of [undefined, null, 0, '', '   '] as const) {
      const l = docLinks('2014-009286', '2014-06', u)
      expect(l.fromSource).toBe(false)
      expect(l.primary.href).toBe('https://ratchakitcha.soc.go.th/')
    }
  })

  it('refuses a url that is not the gazette, rather than putting it in an href', () => {
    // the dataset is a third party's text; a link built from it is a link built from input
    for (const bad of [
      'javascript:alert(1)',
      'http://ratchakitcha.soc.go.th/documents/1.pdf', // not https
      'https://evil.example/documents/1.pdf',
      'https://ratchakitcha.soc.go.th.evil.example/x.pdf',
      'https://ratchakitcha.soc.go.th@evil.example/x.pdf',
      'not a url',
    ]) {
      expect(sourceHref(bad)).toBeNull()
      expect(docLinks('1885-000092', '1885-01', bad).fromSource).toBe(false)
    }
  })

  it('accepts a gazette url whose shape is not the one we compress', () => {
    // the integer form is an observation about today's data, not a promise — a url that does not
    // match it is carried whole, and must still work
    const odd = 'https://ratchakitcha.soc.go.th/api/v1/documents/1010467/download'
    expect(sourceHref(odd)).toBe(odd)
    expect(docLinks('1885-000092', '1885-01', odd).primary.href).toBe(odd)
  })

  it('handles the eighteen-digit document ids as a url, not a rounded number', () => {
    // real and fetchable: meta/2001/2001-01.jsonl carries this one. It is past
    // Number.MAX_SAFE_INTEGER, so the pipeline sends the url whole rather than a number that
    // would come back rounded — a link to the *wrong* document is worse than no link.
    const big = 'https://ratchakitcha.soc.go.th/documents/544639616062325576.pdf'
    expect(sourceHref(big)).toBe(big)
    expect(docLinks('2001-008331', '2001-01', big).primary.href).toBe(big)
    // and if one ever did arrive as a number, it is refused rather than silently wrong.
    // Written through Number() because eslint rejects the literal outright — no-loss-of-precision
    // is the very thing being guarded here.
    expect(sourceHref(Number('544639616062325576'))).toBeNull()
  })

  it('rejects a number that could not be a document id', () => {
    for (const n of [0, -5, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) expect(sourceHref(n)).toBeNull()
  })
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
