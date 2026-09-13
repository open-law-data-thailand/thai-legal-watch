import { useState } from 'preact/hooks'
import { docIdOk } from '../data/client'
import { useLoad } from '../data/context'
import { citation, coordinates, thaiDate } from '../lib/thai'
import { href } from '../router'
import { ErrorBox, Kicker, Loading, actionName, govName, topicName } from '../ui/bits'

const XKEY: Record<string, string> = {
  stage: 'ขั้นตอนคดี',
  court: 'ศาล',
  case_number: 'หมายเลขคดี',
  case_book: 'เล่มคดี',
}
export const STAGE: Record<string, string> = {
  absolute_receivership: 'พิทักษ์ทรัพย์เด็ดขาด',
  interim_receivership: 'พิทักษ์ทรัพย์ชั่วคราว',
  adjudicated: 'พิพากษาให้ล้มละลาย',
  annulled: 'ยกเลิกการล้มละลาย',
  discharged: 'ปลดจากล้มละลาย',
  reorganisation: 'ฟื้นฟูกิจการ',
}
export const xLabel = (k: string) => XKEY[k] ?? k
export const xValue = (k: string, v: string) => (k === 'stage' ? (STAGE[v] ?? v) : v)
const EVIDENCE: Record<string, string> = {
  auth: 'ผู้ออก',
  title: 'ชื่อเรื่อง',
  head: 'ข้อความต้น',
  dtype: 'ประเภทเอกสาร',
  partclass: 'ตอนของราชกิจจาฯ',
  prov: 'จังหวัด',
}
export const evidenceLabel = (m: string) => EVIDENCE[m] ?? `กฎ ${m.replace(/^\^/, '')}`
const HF = 'https://huggingface.co/datasets/open-law-data-thailand/soc-ratchakitcha'

/** Where the PDF is: modern ids resolve at the source; legacy years live in the dataset's monthly zips. */
export function pdfLink(id: string, month: string | undefined): { href: string; label: string } {
  const modern = /^\d{4}-\d{2}-\d{2}-(\d{8})$/.exec(id)
  if (modern)
    return {
      href: `https://ratchakitcha.soc.go.th/documents/${modern[1].replace(/^0+/, '')}.pdf`,
      label: 'PDF ต้นทาง (ราชกิจจานุเบกษา)',
    }
  const m = month ?? `${id.slice(0, 4)}-01`
  return {
    href: `${HF}/resolve/main/zip/${id.slice(0, 4)}/${m}.zip`,
    label: `PDF ใน zip รายเดือน ${m} (OpenLawData)`,
  }
}

export function Doc({ id, month }: { id: string; month?: string }) {
  const st = useLoad(
    async (c) => {
      if (!docIdOk(id)) throw new Error(`รหัสเอกสารไม่ถูกต้อง: ${id}`)
      const [hit, tax, agencies] = await Promise.all([c.doc(id, month), c.taxonomy(), c.agencies()])
      if (!hit) throw new Error(`ไม่พบเอกสาร ${id}`)
      const siblings = (await c.month(id.slice(0, 4), hit.month))
        .filter((d) => d.v === hit.doc.v && d.p === hit.doc.p && d.id !== id)
        .sort((a, b) => (a.pg ?? 0) - (b.pg ?? 0))
      return { ...hit, tax, agency: agencies.find((a) => a.id === hit.doc.a) ?? null, siblings }
    },
    [id, month],
  )
  const [copied, setCopied] = useState(false)
  if (st.state === 'loading') return <Loading what="เอกสาร" />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  const { doc: d, tax, agency, siblings } = st.data
  const coords = { volume: d.v, part: d.p, page: d.pg, date: d.d }
  const cite = citation(d.t, coords)
  const pdf = pdfLink(d.id, st.data.month)
  const copy = () => {
    void navigator.clipboard?.writeText(cite).then(() => {
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 1500)
    })
  }
  const before = siblings.filter((s) => (s.pg ?? 0) < (d.pg ?? 0)).slice(-1)[0]
  const after = siblings.find((s) => (s.pg ?? 0) > (d.pg ?? 0))
  return (
    <article>
      <Kicker>
        {d.dt ?? 'เอกสาร'} · ราชกิจจานุเบกษา {coordinates(coords)} · {thaiDate(d.d)}
      </Kicker>
      <h1 style="margin:8px 0 18px;font-size:1.6rem" data-testid="doc-title">
        {d.t}
      </h1>
      <div class="two">
        <section>
          <div class="card">
            <table>
              <tbody>
                <tr>
                  <th>รหัส</th>
                  <td>
                    <code>{d.id}</code>
                  </td>
                </tr>
                <tr>
                  <th>ผู้ออก</th>
                  <td>
                    {agency ? (
                      <a href={href.agency(agency.id)}>{agency.name}</a>
                    ) : (
                      <span class="muted">ไม่ระบุ</span>
                    )}
                  </td>
                </tr>
                {d.pr && (
                  <tr>
                    <th>จังหวัด</th>
                    <td>
                      <a href={href.province(d.pr)}>{d.pr}</a>
                    </td>
                  </tr>
                )}
                <tr>
                  <th>หมวด</th>
                  <td>
                    {d.topic ? <a href={href.topic(d.topic)}>{topicName(tax, d.topic)}</a> : '—'}{' '}
                    {d.topic && (d.tc ? '✓' : <span class="pill guess">คาดว่า</span>)}
                  </td>
                </tr>
                <tr>
                  <th>การกระทำ</th>
                  <td>
                    {actionName(tax, d.action) || '—'}{' '}
                    {d.action && (d.ac ? '✓' : <span class="pill guess">คาดว่า</span>)}
                  </td>
                </tr>
                <tr>
                  <th>ระดับ</th>
                  <td>
                    {govName(tax, d.govlevel) || '—'}{' '}
                    {d.govlevel && (d.gc ? '✓' : <span class="pill guess">คาดว่า</span>)}
                  </td>
                </tr>
                {d.x &&
                  Object.entries(d.x).map(([k, v]) => (
                    <tr key={k}>
                      <th>{xLabel(k)}</th>
                      <td>{xValue(k, v)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p style="margin:14px 0 0;display:flex;gap:8px;flex-wrap:wrap">
              <a class="btn" href={pdf.href} target="_blank" rel="noopener">
                {pdf.label} ↗
              </a>
              <button onClick={copy} data-testid="cite">
                {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกการอ้างอิง'}
              </button>
            </p>
          </div>
          <p
            class="muted"
            style="font-size:.85rem;margin-top:10px;font-family:var(--serif)"
            data-testid="citation"
          >
            {cite}
          </p>
        </section>
        <section>
          <h2 style="font-size:1.05rem;margin-bottom:8px">ระบบจำแนกหมวดนี้จากอะไร</h2>
          <div class="evidence" data-testid="evidence">
            {d.labels.length === 0 && (
              <p class="muted">ยังจำแนกไม่ได้ — เอกสารนี้ไม่เข้ากับหมวดใดที่ rule รู้จัก</p>
            )}
            {d.labels.map((l) => (
              <div class="lab" key={`${l.x}-${l.s}`}>
                <span>
                  {l.x === 'topic'
                    ? topicName(tax, l.s)
                    : l.x === 'action'
                      ? actionName(tax, l.s)
                      : govName(tax, l.s)}{' '}
                  <span class="muted">({l.x})</span>
                </span>
                <span class="muted">
                  {l.m.map(evidenceLabel).join(' + ')} · น้ำหนัก {l.w.toFixed(2)} {l.c ? '· ยืนยัน ✓' : ''}
                </span>
              </div>
            ))}
          </div>
          <p class="muted" style="font-size:.85rem">
            ป้ายมาจาก rule (ไม่ใช่ ML): "ยืนยัน" = มีหลักฐานเชิงโครงสร้างหรือสองแหล่งอิสระ
            ความแม่นของหมวดที่ยืนยัน ≈ 98–100% · <a href={href.about()}>วิธีวัด</a>
          </p>
          {(before || after) && (
            <>
              <h2 style="font-size:1.05rem;margin:22px 0 8px">ในตอนเดียวกัน</h2>
              <div class="doclist">
                {before && (
                  <div class="doc">
                    <span class="muted">← หน้า {before.pg}</span>
                    <br />
                    <a href={href.doc(before.id, st.data.month)}>{before.t}</a>
                  </div>
                )}
                {after && (
                  <div class="doc">
                    <span class="muted">หน้า {after.pg} →</span>
                    <br />
                    <a href={href.doc(after.id, st.data.month)}>{after.t}</a>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </article>
  )
}
