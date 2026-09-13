/** The document itself, read one record at a time out of the dataset's text layer.
 *
 *  This is the thing a lawyer actually came for, and until now the site could only point at a PDF
 *  somewhere else. It is not built into the site — the layer is about 12 GB — so it is fetched
 *  live with range requests (see `lib/ocr.ts`). That makes it the one part of the page that
 *  depends on somebody else's server being up, so it loads after everything else and every
 *  failure ends in "the text is not available", never in a broken page.
 *
 *  The text is OCR or PDF extraction of scanned pages. It is rendered as text and never as markup,
 *  and it is labelled as a reading copy: the gazette is the authority, not this.
 */
import { useEffect, useState } from 'preact/hooks'
import { keep, readKept } from '../lib/cubestore'
import { type DocText, fetchDocText, TextError } from '../lib/ocr'
import { thaiDate } from '../lib/thai'

type State =
  | { s: 'idle' }
  | { s: 'loading' }
  | { s: 'ok'; doc: DocText; ms: number }
  | { s: 'none' }
  | { s: 'error'; why: string }

/** Blank lines separate what the page prints as paragraphs; single newlines are line breaks
 *  inside one. Collapsing them all would run a signature block into the body. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** How much to show before asking. A long notice can be ninety thousand characters and the text
 *  as extracted has no blank lines at all, so a paragraph count is no guide — measure characters
 *  and cut on a line break so a sentence is never halved. */
export const PREVIEW = 1800

export function clamp(paras: string[], budget = PREVIEW): { shown: string[]; hidden: number } {
  const total = paras.reduce((n, p) => n + p.length, 0)
  if (total <= budget) return { shown: paras, hidden: 0 }
  const shown: string[] = []
  let used = 0
  for (const p of paras) {
    if (used + p.length <= budget) {
      shown.push(p)
      used += p.length
      continue
    }
    const room = budget - used
    if (room > 200) {
      // cut at the last line break that fits, so a line is never halved
      const cut = p.lastIndexOf('\n', room)
      shown.push(p.slice(0, cut > 200 ? cut : room))
      used += cut > 200 ? cut : room
    }
    break
  }
  return { shown, hidden: total - used }
}

/** Kept per document. The text is small; finding it is not. */
const cacheKey = (id: string) => `text:${id}`
interface Kept {
  doc: DocText | null
}

export function FullText({ base, id, month }: { base: string; id: string; month: string }) {
  const [st, setSt] = useState<State>({ s: 'idle' })
  const [all, setAll] = useState(false)
  const [copied, setCopied] = useState(false)

  // A copy fetched before is free, so it is shown without being asked for. A copy that is not
  // there costs a dozen range requests against somebody else's server, which is not something to
  // spend on every page view — so that one waits for the reader to ask.
  useEffect(() => {
    let live = true
    setAll(false)
    setSt({ s: 'idle' })
    void readKept<Kept>(cacheKey(id)).then((hit) => {
      if (!live || !hit) return
      setSt(hit.doc ? { s: 'ok', doc: hit.doc, ms: 0 } : { s: 'none' })
    })
    return () => {
      live = false
    }
  }, [id])

  const load = () => {
    setSt({ s: 'loading' })
    const t0 = performance.now()
    fetchDocText({ base }, id, month).then(
      ({ doc }) => {
        setSt(doc ? { s: 'ok', doc, ms: Math.round(performance.now() - t0) } : { s: 'none' })
        void keep(cacheKey(id), { doc } satisfies Kept)
      },
      (e: unknown) => {
        // a month the layer does not carry is not a failure; it is an absence
        if (e instanceof TextError && e.kind === 'missing') setSt({ s: 'none' })
        else setSt({ s: 'error', why: e instanceof Error ? e.message : String(e) })
      },
    )
  }

  if (st.s === 'idle')
    return (
      <section class="fulltext">
        <h2 class="sec">เนื้อหาเต็ม</h2>
        <p class="muted fulltext-note" style="max-width:70ch">
          อ่านตัวเอกสารได้จากชุดข้อมูลต้นทางโดยตรง — ใช้เวลาสักครู่ (ราว 5 วินาที)
          เพราะต้องไล่หาในไฟล์ข้อความขนาดใหญ่ของเดือนนั้น เมื่อโหลดแล้วจะเก็บไว้ในเครื่อง
          ครั้งต่อไปจะขึ้นทันที
        </p>
        <p>
          <button class="btn primary" onClick={load} data-testid="load-fulltext">
            อ่านเนื้อหาเต็มของฉบับนี้
          </button>
        </p>
      </section>
    )

  if (st.s === 'loading')
    return (
      <section class="fulltext" aria-busy="true">
        <h2 class="sec">เนื้อหาเต็ม</h2>
        <p class="muted" role="status">
          กำลังไล่หาในไฟล์ข้อความของเดือน {month} … ปกติใช้เวลาไม่เกินสิบวินาที
        </p>
        <div class="skeleton" style="height:9rem" />
      </section>
    )
  if (st.s === 'none')
    return (
      <section class="fulltext">
        <h2 class="sec">เนื้อหาเต็ม</h2>
        <p class="muted">
          ชุดข้อมูลยังไม่มีเนื้อหาของฉบับนี้ — การสกัดข้อความไม่ได้สำเร็จทุกฉบับ เปิดไฟล์ PDF
          ต้นฉบับได้จากปุ่มด้านบน
        </p>
      </section>
    )
  if (st.s === 'error')
    return (
      <section class="fulltext">
        <h2 class="sec">เนื้อหาเต็ม</h2>
        <p class="muted">
          อ่านเนื้อหาจากชุดข้อมูลต้นทางไม่สำเร็จ ({st.why}) — เปิด PDF ต้นฉบับได้จากปุ่มด้านบน
        </p>
        <p>
          <button class="btn" onClick={load}>
            ลองอีกครั้ง
          </button>
        </p>
      </section>
    )

  const { doc } = st
  const paras = paragraphs(doc.text)
  const copyAll = () => {
    navigator.clipboard?.writeText(doc.text).then(
      () => {
        setCopied(true)
        setTimeout(() => {
          setCopied(false)
        }, 2000)
      },
      () => {
        setCopied(false)
      },
    )
  }
  const { shown, hidden } = all ? { shown: paras, hidden: 0 } : clamp(paras)
  const ocr = doc.method !== null && doc.method !== 'direct'
  return (
    <section class="fulltext" data-testid="fulltext">
      <div class="fulltext-head">
        <h2 class="sec" style="margin:0">
          เนื้อหาเต็ม
        </h2>
        <button class="btn" onClick={copyAll} data-testid="copy-text">
          {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกข้อความทั้งหมด'}
        </button>
      </div>
      <p class="muted fulltext-note">
        {ocr ? 'อ่านจากภาพสแกนด้วย OCR' : 'ข้อความจากไฟล์ PDF โดยตรง'}
        {doc.pages ? ` · ${doc.pages.toLocaleString('th-TH')} หน้า` : ''}
        {doc.score !== null ? ` · ความมั่นใจ ${Math.round(doc.score * 100)}%` : ''} ·{' '}
        <b>เป็นสำเนาเพื่ออ่าน ไม่ใช่ต้นฉบับ</b> — อ้างอิงทางกฎหมายต้องใช้ราชกิจจานุเบกษา
      </p>

      {(doc.announcementDate || doc.signatories.length > 0 || doc.references.length > 0) && (
        <dl class="docfacts">
          {doc.announcementDate && (
            <>
              <dt>วันที่ในเอกสาร</dt>
              <dd>
                {thaiDate(doc.announcementDate)}{' '}
                <span class="muted">(วันที่ลงนาม ไม่ใช่วันที่ประกาศในราชกิจจานุเบกษา)</span>
              </dd>
            </>
          )}
          {doc.signatories.length > 0 && (
            <>
              <dt>ผู้ลงนาม</dt>
              <dd>
                {doc.signatories.map((s, i) => (
                  <span key={i}>
                    {i > 0 && ' · '}
                    {s.name}
                    {s.position && <span class="muted"> — {s.position}</span>}
                  </span>
                ))}
              </dd>
            </>
          )}
          {doc.references.length > 0 && (
            <>
              <dt>อ้างถึง</dt>
              <dd>{doc.references.join(' · ')}</dd>
            </>
          )}
        </dl>
      )}

      <div class="doctext">
        {shown.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {hidden > 0 && (
        <p style="margin-top:10px">
          <button
            class="btn morebtn"
            onClick={() => {
              setAll(true)
            }}
          >
            อ่านต่อ — อีก {hidden.toLocaleString('th-TH')} ตัวอักษร
          </button>
        </p>
      )}
    </section>
  )
}
