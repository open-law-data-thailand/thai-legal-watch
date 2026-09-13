import { describe, expect, it, vi } from 'vitest'
import {
  fetchDocText,
  findRecord,
  forgetSizes,
  idOf,
  parseRecord,
  TextError,
  textUrl,
  totalFromContentRange,
} from './ocr'
import { clamp, paragraphs, PREVIEW } from '../ui/FullText'

/** A JSONL file in memory, served the way Hugging Face serves one: range requests only, and a
 *  `Content-Range` that reports the total. */
function server(records: { doc_id: string; text: string; pad?: number }[]) {
  const lines = records.map((r) => {
    const body = JSON.stringify({ doc_id: r.doc_id, text: r.text, method: 'direct', score: 1 })
    // padding makes a record big enough to straddle a probe, which is the case that broke the
    // first version of this search
    return r.pad ? body.slice(0, -1) + `,"pad":"${'x'.repeat(r.pad)}"}` : body
  })
  const file = new TextEncoder().encode(lines.join('\n') + '\n')
  const ranges: [number, number][] = []
  const f = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const header = (init?.headers as Record<string, string> | undefined)?.['Range'] ?? ''
    const m = /bytes=(\d+)-(\d+)/.exec(header)
    if (!m) return Promise.resolve(new Response('', { status: 400 }))
    const from = Number(m[1])
    const to = Math.min(Number(m[2]), file.length - 1)
    ranges.push([from, to])
    if (from >= file.length) return Promise.resolve(new Response('', { status: 416 }))
    return Promise.resolve(
      new Response(file.slice(from, to + 1), {
        status: 206,
        headers: { 'content-range': `bytes ${from}-${to}/${file.length}` },
      }),
    )
  }) as unknown as typeof fetch
  return { f, size: file.length, ranges, lines }
}

const many = (n: number, pad = 0) =>
  Array.from({ length: n }, (_, i) => ({
    doc_id: `2026-09-01-${String(1000 + i).padStart(8, '0')}`,
    text: `เอกสารลำดับที่ ${i}`,
    pad,
  }))

describe('totalFromContentRange', () => {
  it('reads the total off the header', () => {
    expect(totalFromContentRange('bytes 0-0/20774956')).toBe(20774956)
    expect(totalFromContentRange('bytes 100-200/512')).toBe(512)
  })
  it('returns nothing when the header is absent or unparseable', () => {
    expect(totalFromContentRange(null)).toBe(null)
    expect(totalFromContentRange('bytes */*')).toBe(null)
  })
})

describe('idOf', () => {
  it('finds the key without parsing several kilobytes of text around it', () => {
    expect(idOf('{"pdf_file": "x.pdf", "doc_id": "2026-09-01-00121899", "text": "…"}')).toBe(
      '2026-09-01-00121899',
    )
    expect(idOf('{"doc_id":"2005-006257"}')).toBe('2005-006257')
    expect(idOf('{"text": "no id here"}')).toBe(null)
  })
})

describe('findRecord', () => {
  it('finds the first, a middle and the last record', async () => {
    const { f, size } = server(many(400))
    for (const i of [0, 199, 399]) {
      const id = `2026-09-01-${String(1000 + i).padStart(8, '0')}`
      const r = await findRecord(f, '/x.jsonl', size, id)
      expect(idOf(r.line ?? ''), `record ${i}`).toBe(id)
    }
  })

  it('reports nothing for an id the file does not carry, rather than a neighbour', async () => {
    // extraction does not succeed for every document, so absence is a normal answer and must
    // never be answered with the record next to it
    const { f, size } = server(many(200))
    expect((await findRecord(f, '/x.jsonl', size, '2026-09-01-00009999')).line).toBe(null)
    expect((await findRecord(f, '/x.jsonl', size, '1900-01-01-00000001')).line).toBe(null)
    expect((await findRecord(f, '/x.jsonl', size, '2999-01-01-00000001')).line).toBe(null)
  })

  it('finds a record far bigger than one probe, and its neighbours', async () => {
    // a hundred-page notice is ninety thousand characters; a probe that lands inside one sees no
    // line at all, and the first version of this search gave up there
    const recs = many(40)
    const huge = { doc_id: recs[20].doc_id, text: recs[20].text, pad: 300_000 }
    recs[20] = huge
    const { f, size } = server(recs)
    const got = await findRecord(f, '/x.jsonl', size, huge.doc_id)
    expect(idOf(got.line ?? '')).toBe(huge.doc_id)
    expect(got.line).toContain('"pad"')
    for (const i of [19, 21]) {
      const near = recs[i]
      const r = await findRecord(f, '/x.jsonl', size, near.doc_id)
      expect(idOf(r.line ?? ''), `neighbour ${i}`).toBe(near.doc_id)
    }
  })

  it('asks for a polite number of ranges', async () => {
    // every request is a second of somebody else's server; a regression here is what earned a
    // connection reset from the publisher the first time round
    const { f, size, ranges } = server(many(3000))
    const r = await findRecord(f, '/x.jsonl', size, '2026-09-01-00002500')
    expect(idOf(r.line ?? '')).toBe('2026-09-01-00002500')
    expect(ranges.length).toBeLessThanOrEqual(25)
    expect(r.requests).toBe(ranges.length)
  })

  it('reads bytes, not characters: Thai text is three bytes a character', async () => {
    // the search advances past a record by its byte length. Using the string length instead walks
    // backwards through a Thai file and never converges — which is exactly what it did.
    const recs = Array.from({ length: 300 }, (_, i) => ({
      doc_id: `2026-09-01-${String(1000 + i).padStart(8, '0')}`,
      text: 'ประกาศกระทรวงอุตสาหกรรม เรื่อง กำหนดมาตรฐานผลิตภัณฑ์อุตสาหกรรม '.repeat(20),
    }))
    const { f, size } = server(recs)
    const target = recs[250]
    const r = await findRecord(f, '/x.jsonl', size, target.doc_id)
    expect(idOf(r.line ?? '')).toBe(target.doc_id)
  })
})

describe('fetchDocText', () => {
  const src = (f: typeof fetch) => ({ base: 'https://h/ocr', fetchImpl: f })

  it('learns the file size from a one-byte range, then finds the record', async () => {
    forgetSizes()
    const { f, ranges } = server(many(200))
    const r = await fetchDocText(src(f), '2026-09-01-00001100', '2026-09')
    expect(r.doc?.id).toBe('2026-09-01-00001100')
    expect(ranges[0]).toEqual([0, 0])
  })

  it('asks for the size of a month once, however many documents are read from it', async () => {
    forgetSizes()
    const { f, ranges } = server(many(200))
    await fetchDocText(src(f), '2026-09-01-00001100', '2026-09')
    const after = ranges.length
    await fetchDocText(src(f), '2026-09-01-00001150', '2026-09')
    expect(ranges.slice(after).filter(([a, b]) => a === 0 && b === 0)).toEqual([])
  })

  it('says the month is missing rather than failing on its bytes', async () => {
    forgetSizes()
    const f = vi.fn(() => Promise.resolve(new Response('', { status: 404 }))) as unknown as typeof fetch
    await expect(fetchDocText(src(f), 'x', '1900-01')).rejects.toThrow(TextError)
    await expect(fetchDocText(src(f), 'x', '1900-01')).rejects.toMatchObject({ kind: 'missing' })
  })

  it('says so when the host will not answer a range at all', async () => {
    forgetSizes()
    const f = vi.fn(() =>
      Promise.resolve(new Response('whole file', { status: 200 })),
    ) as unknown as typeof fetch
    await expect(fetchDocText(src(f), 'x', '2026-09')).rejects.toThrow(/size/)
  })

  it('returns nothing, not an error, for a document the layer skipped', async () => {
    forgetSizes()
    const { f } = server(many(120))
    const r = await fetchDocText(src(f), '2026-09-01-00009999', '2026-09')
    expect(r.doc).toBe(null)
  })
})

describe('parseRecord', () => {
  it('keeps the fields a reader needs and tolerates the ones that are absent', () => {
    const d = parseRecord(
      JSON.stringify({
        doc_id: 'x',
        text: 'เนื้อหา',
        method: 'direct',
        score: 1,
        n_pages: 2,
        signatories: [{ name: 'ก', position: 'ข' }, { name: '' }, {}],
        announcement_date: '2026-06-11',
        reference_numbers: ['ป. 1/2569'],
      }),
    )
    expect(d?.text).toBe('เนื้อหา')
    expect(d?.signatories).toEqual([{ name: 'ก', position: 'ข' }])
    expect(d?.announcementDate).toBe('2026-06-11')
    expect(d?.references).toEqual(['ป. 1/2569'])
  })

  it('refuses a record with no text rather than rendering an empty document', () => {
    expect(parseRecord('{"doc_id":"x"}')).toBe(null)
    expect(parseRecord('not json')).toBe(null)
    expect(parseRecord('{"text":"orphan"}')).toBe(null)
  })

  it('defaults every optional field instead of trusting the shape', () => {
    const d = parseRecord('{"doc_id":"x","text":"t"}')
    expect(d).toEqual({
      id: 'x',
      text: 't',
      method: null,
      score: null,
      pages: null,
      signatories: [],
      announcementDate: null,
      references: [],
      docType: null,
      issuer: null,
      subject: null,
    })
  })
})

describe('textUrl', () => {
  it('addresses the month file by its year folder', () => {
    expect(textUrl('https://h/ocr', '2026-09')).toBe('https://h/ocr/2026/2026-09.jsonl')
    expect(textUrl('https://h/ocr/', '2005-03')).toBe('https://h/ocr/2005/2005-03.jsonl')
  })
})

describe('forgetSizes', () => {
  it('exists so a test or a long session does not inherit a stale table', () => {
    expect(() => {
      forgetSizes()
    }).not.toThrow()
  })
})

describe('how much of a document to show first', () => {
  it('keeps blank-line paragraphs apart', () => {
    expect(paragraphs('หนึ่ง\n\nสอง\n\n\nสาม')).toEqual(['หนึ่ง', 'สอง', 'สาม'])
    expect(paragraphs('  \n\n  ')).toEqual([])
  })

  it('treats a line break inside a paragraph as part of it', () => {
    // the extracted text keeps the page's own line breaks; collapsing them would run a signature
    // block into the body
    expect(paragraphs('บรรทัดหนึ่ง\nบรรทัดสอง')).toEqual(['บรรทัดหนึ่ง\nบรรทัดสอง'])
  })

  it('shows a short document whole', () => {
    const { shown, hidden } = clamp(['สั้น'])
    expect(shown).toEqual(['สั้น'])
    expect(hidden).toBe(0)
  })

  it('measures characters, not paragraphs: the text often has no blank lines at all', () => {
    // a ninety-thousand-character notice arrives as one paragraph, and a paragraph count would
    // put the whole of it on screen
    const one = 'ก'.repeat(90_000)
    const { shown, hidden } = clamp([one])
    expect(shown.join('').length).toBeLessThanOrEqual(PREVIEW)
    expect(hidden).toBeGreaterThan(80_000)
  })

  it('cuts on a line break so a line is never halved', () => {
    const body = Array.from({ length: 400 }, (_, i) => `บรรทัดที่ ${i} ของเอกสาร`).join('\n')
    const { shown } = clamp([body])
    expect(shown[0]?.endsWith('\n')).toBe(false)
    expect(body.startsWith(shown[0] ?? '')).toBe(true)
    expect(shown[0]).toBe(body.slice(0, body.lastIndexOf('\n', PREVIEW)))
  })

  it('stops at a paragraph boundary when the paragraphs are small', () => {
    const paras = Array.from({ length: 50 }, (_, i) => `ย่อหน้า ${i} `.repeat(10))
    const { shown, hidden } = clamp(paras)
    expect(shown.length).toBeLessThan(paras.length)
    expect(shown.every((p) => paras.includes(p))).toBe(true)
    expect(hidden).toBeGreaterThan(0)
  })
})
