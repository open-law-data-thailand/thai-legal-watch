/** The full text of one document, fetched straight from the dataset.
 *
 *  The text layer is ~40 MB per month and about 10 GB for the archive, so it can neither be
 *  shipped with the site nor indexed by the build. But it is one JSON object per line, sorted by
 *  `doc_id`, and Hugging Face answers HTTP range requests with CORS open — which makes the file a
 *  sorted array on a disk we are allowed to seek in. No new build artefact, no offset index, no
 *  server: the sort order the publisher already maintains is the index.
 *
 *  Measured against the real files: a request costs about a second, because `resolve/` redirects
 *  to a CDN. So what matters is rounds, not bytes. Bisecting halves the bracket once per round
 *  trip — fourteen of them over a 20 MB file. Probing several places at once divides it by
 *  `WAYS + 1` per round instead, and three rounds bring 20 MB under a hundred kilobytes.
 *
 *  Two things were tried and removed. Interpolating from the document's position among its
 *  month's documents does not work: records run from 800 to 90,000 characters, so rank does not
 *  map to a byte offset, and legacy ids sort by number where the month file sorts by date. And
 *  eight-way probing, which was fast, asked Hugging Face for thirty-odd ranges per document and
 *  earned a connection reset — so this is deliberately gentler than it could be, and the result
 *  is fetched only when a reader asks for it and then kept.
 *
 *  The honest fix is upstream: a per-month `doc_id -> (offset, length)` index published beside
 *  the layer would turn all of this into one 10 KB request. See docs/HANDOFF.md.
 *
 *  Everything here degrades to "no text available". A document is fully usable without it.
 */

/** Records average 7 KB, so this finds a complete line most of the time. A probe that finds none
 *  is simply skipped — there are seven others in the same round. */
const PROBE = 16 * 1024
/** Probes per round: six brackets from five cuts. Enough to converge in three rounds over a
 *  60 MB file, few enough that one document view is a polite number of requests. */
const WAYS = 5
/** Three rounds take 20 MB to about 90 KB; a fourth is there for the largest files. */
const MAX_ROUNDS = 4
/** Once the bracket is this small, read it and be done. */
const WINDOW = 96 * 1024
/** A record can be far larger than a probe; reading one whole widens until the line ends. */
const WIDER = [32 * 1024, 192 * 1024, 768 * 1024]

export interface DocText {
  id: string
  text: string
  /** how the text was got: `direct` is the PDF's own text layer, anything else is OCR */
  method: string | null
  /** the publisher's own confidence, 0–1 */
  score: number | null
  pages: number | null
  /** who signed it, as printed */
  signatories: { name: string; position: string }[]
  /** the date the document itself carries, which is not the date it was published */
  announcementDate: string | null
  /** documents this one names */
  references: string[]
  docType: string | null
  issuer: string | null
  subject: string | null
}

export class TextError extends Error {
  readonly kind: 'missing' | 'network'
  constructor(message: string, kind: 'missing' | 'network' = 'network') {
    super(message)
    this.name = 'TextError'
    this.kind = kind
  }
}

type Fetch = typeof fetch

/** `Content-Range: bytes a-b/total` — the only way to learn a file's size through a redirect that
 *  a HEAD would not survive. */
export function totalFromContentRange(header: string | null): number | null {
  const m = /\/(\d+)\s*$/.exec(header ?? '')
  return m?.[1] ? Number(m[1]) : null
}

async function slice(f: Fetch, url: string, from: number, length: number): Promise<Uint8Array> {
  if (length <= 0) return new Uint8Array(0)
  const r = await f(url, { headers: { Range: `bytes=${from}-${from + length - 1}` } })
  if (r.status === 416) return new Uint8Array(0)
  if (!r.ok) throw new TextError(`${r.status} for the text layer`, r.status === 404 ? 'missing' : 'network')
  return new Uint8Array(await r.arrayBuffer())
}

const NL = 10
const dec = new TextDecoder()

/** The id of a JSONL record without parsing the rest of it — the records carry several kilobytes
 *  of text and a search only ever needs the key. */
export function idOf(line: string): string | null {
  return /"doc_id"\s*:\s*"([^"]+)"/.exec(line)?.[1] ?? null
}

interface Found {
  /** byte offset of the line's first character */
  offset: number
  /** byte length of the line, not its character count: the text is real UTF-8, not \\u escapes,
   *  so those two differ by a factor of three and confusing them walks the search backwards */
  bytes: number
  id: string
  line: string
}

/** Every complete line in a window, with byte offsets. */
function linesIn(buf: Uint8Array, at: number): Found[] {
  const out: Found[] = []
  // at 0 the file starts on a record; anywhere else, skip the partial line we landed in
  let start = at === 0 ? 0 : buf.indexOf(NL) + 1
  if (at !== 0 && start === 0) return out
  for (;;) {
    const end = buf.indexOf(NL, start)
    if (end === -1) break
    const line = dec.decode(buf.subarray(start, end))
    const id = idOf(line)
    if (id) out.push({ offset: at + start, bytes: end - start, id, line })
    start = end + 1
  }
  return out
}

/** The first complete line starting at or after `at`, widening when one record fills the window. */
async function lineAtOrAfter(f: Fetch, url: string, size: number, at: number): Promise<Found | null> {
  if (at >= size) return null
  for (const want of WIDER) {
    const buf = await slice(f, url, at, Math.min(want, size - at))
    if (!buf.length) return null
    const hit = linesIn(buf, at)[0]
    if (hit) return hit
    if (at + want >= size) return null
  }
  return null
}

export interface Probe {
  /** how many requests it took, so a caller can measure rather than assume */
  requests: number
  line: string | null
}

/** The first complete line at or after `at`, within one fixed probe. Null when the record
 *  straddling that point is bigger than the probe — the round has other probes. */
async function probeAt(f: Fetch, url: string, size: number, at: number): Promise<Found | null> {
  if (at >= size) return null
  const buf = await slice(f, url, at, Math.min(PROBE, size - at))
  return linesIn(buf, at)[0] ?? null
}

/**
 * The record for `id`, by parallel k-way search over the sorted file.
 *
 * Each round reads `WAYS` evenly spaced points at once and keeps the tightest bracket any of them
 * proves. Where bisecting divides by two per round trip, this divides by `WAYS + 1`.
 */
export async function findRecord(f: Fetch, url: string, size: number, id: string): Promise<Probe> {
  let lo = 0
  let hi = size
  let requests = 0
  for (let round = 0; round < MAX_ROUNDS && hi - lo > WINDOW; round++) {
    const span = hi - lo
    const at = Array.from({ length: WAYS }, (_, i) => lo + Math.floor((span * (i + 1)) / (WAYS + 1)))
    const found = await Promise.all(at.map((p) => probeAt(f, url, size, p)))
    requests += WAYS
    const exact = found.find((r) => r?.id === id)
    if (exact) return { requests, line: exact.line }
    let nextLo = lo
    let nextHi = hi
    for (const r of found) {
      if (!r) continue
      if (r.id < id) nextLo = Math.max(nextLo, r.offset + r.bytes + 1)
      else nextHi = Math.min(nextHi, r.offset)
    }
    // no probe told us anything (every one straddled a huge record): stop narrowing
    if (nextHi <= nextLo || (nextLo === lo && nextHi === hi)) break
    lo = nextLo
    hi = nextHi
  }
  // the bracket is small; read it and look
  requests++
  const buf = await slice(f, url, lo, Math.min(Math.max(hi - lo, PROBE) + PROBE, size - lo))
  const lines = linesIn(buf, lo)
  const hit = lines.find((l) => l.id === id)
  if (hit) return { requests, line: hit.line }
  // the record may start inside the bracket and run past what we read
  const last = lines[lines.length - 1]
  const partial = !last || last.id < id
  if (partial) {
    const rec = await lineAtOrAfter(f, url, size, last?.offset ?? lo)
    requests++
    if (rec?.id === id) return { requests, line: rec.line }
  }
  return { requests, line: null }
}

/** Shape of one line of the text layer; every field is optional because it is somebody else's
 *  data and a missing field must narrow the page, not break it. */
interface RawRecord {
  doc_id?: string
  text?: string
  method?: string
  score?: number
  n_pages?: number
  signatories?: { name?: string; position?: string }[]
  announcement_date?: string
  reference_numbers?: string[]
  doc_type?: string
  issuer?: string
  subject?: string
}

export function parseRecord(line: string): DocText | null {
  let raw: RawRecord
  try {
    raw = JSON.parse(line) as RawRecord
  } catch {
    return null
  }
  if (!raw.doc_id || typeof raw.text !== 'string') return null
  return {
    id: raw.doc_id,
    text: raw.text,
    method: raw.method ?? null,
    score: typeof raw.score === 'number' ? raw.score : null,
    pages: typeof raw.n_pages === 'number' ? raw.n_pages : null,
    signatories: (raw.signatories ?? [])
      .map((s) => ({ name: s.name ?? '', position: s.position ?? '' }))
      .filter((s) => s.name || s.position),
    announcementDate: raw.announcement_date ?? null,
    references: (raw.reference_numbers ?? []).filter((r) => typeof r === 'string'),
    docType: raw.doc_type ?? null,
    issuer: raw.issuer ?? null,
    subject: raw.subject ?? null,
  }
}

export interface TextSource {
  /** e.g. https://huggingface.co/datasets/<repo>/resolve/main/ocr/openlawdata-ocr */
  base: string
  fetchImpl?: Fetch
}

/** File sizes are per month and never change once a month is complete; a reader who opens three
 *  documents from one month should pay for that lookup once. */
const sizes = new Map<string, Promise<number | null>>()

export function textUrl(base: string, month: string): string {
  return `${base.replace(/\/$/, '')}/${month.slice(0, 4)}/${month}.jsonl`
}

async function sizeOf(f: Fetch, url: string): Promise<number | null> {
  const hit = sizes.get(url)
  if (hit) return hit
  const p = (async () => {
    const r = await f(url, { headers: { Range: 'bytes=0-0' } })
    if (r.status === 404) throw new TextError('the text layer has no file for this month', 'missing')
    if (!r.ok && r.status !== 206) throw new TextError(`${r.status} for the text layer`, 'network')
    return totalFromContentRange(r.headers.get('content-range'))
  })()
  sizes.set(url, p)
  p.catch(() => {
    sizes.delete(url)
  })
  return p
}

export interface TextResult {
  doc: DocText | null
  requests: number
}

/**
 * The text of one document, or null when the layer does not have it.
 *
 * `month` is the file the document is published in (`2026-09`), not the month of its publication
 * date — 160 of 732,143 documents disagree about that, and the file layout decides which file
 * holds a record.
 */
export async function fetchDocText(src: TextSource, id: string, month: string): Promise<TextResult> {
  const f = src.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  const url = textUrl(src.base, month)
  const size = await sizeOf(f, url)
  if (!size) throw new TextError('the text layer did not report a size (no range support)', 'network')
  const { line, requests } = await findRecord(f, url, size, id)
  return { doc: line ? parseRecord(line) : null, requests }
}

/** Tests and long sessions should not inherit a stale size table. */
export function forgetSizes(): void {
  sizes.clear()
}
