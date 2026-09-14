import { useState } from 'preact/hooks'
import { docIdOk } from '../data/client'
import { useLoad } from '../data/context'
import type { AgencyPage, SlimDoc, Taxonomy } from '../data/types'
import { CITE_FORMATS, formatCitation, permalink, type CiteFormat } from '../lib/cite'
import { onJump } from '../lib/jump'
import { coordinates, thaiDate } from '../lib/thai'
import { lastExplore, useTitle } from '../lib/title'
import { useClient, useHref } from '../data/context'
import { displayTitle, ErrorBox, Kicker, Loading, actionName, govName, topicName } from '../ui/bits'
import { Crumbs } from '../ui/Crumbs'
import { FullText } from '../ui/FullText'

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
  auth: 'ชื่อผู้ออก',
  title: 'ชื่อเรื่อง',
  head: 'ข้อความขึ้นต้น',
  dtype: 'ประเภทเอกสาร',
  partclass: 'ประเภทตอน (ก ข ค ง)',
  prov: 'ชื่อจังหวัด',
}
export const evidenceLabel = (m: string) => EVIDENCE[m] ?? `เกณฑ์ ${m.replace(/^\^/, '')}`
const HF = 'https://huggingface.co/datasets/open-law-data-thailand/soc-ratchakitcha'

/** The province route takes a file name, which is not the province name — they happen to match
 *  in the current build, and that is not something to build a link on. */
const provinceFile = (name: string, list: { name: string; file: string }[]) =>
  list.find((p) => p.name === name)?.file ?? name

const GAZETTE = 'https://ratchakitcha.soc.go.th'

/** Whether the published text layer reaches this document.
 *
 *  Two tests, both about not promising text that is not there — offering the button costs the
 *  reader seventeen requests and about seven seconds before it can say "nothing".
 *
 *  The layer starts part-way through the archive and only grows forward, so the year it starts
 *  at rules out everything before it. And within a year whose position index the build read, a
 *  document with no position is a document the layer does not have: the index accounts for every
 *  byte of every month file it describes, so a search would read the file and find the ids step
 *  straight over the one it wants. 21,152 documents are in exactly that state — classified
 *  upstream after the text layer was last built. */
export function hasFullText(
  text: { base?: string; from?: string; indexed?: string[] } | undefined,
  month: string | undefined,
  id: string,
  at?: [number, number],
): boolean {
  if (!text?.base) return false
  const year = (month ?? id).slice(0, 4)
  if (text.from && year < text.from) return false
  if (at) return true
  return !text.indexed?.includes(year)
}

export interface DocLinks {
  primary: { href: string; label: string }
  secondary?: { href: string; label: string }
  fromSource: boolean
}

/** Turn a slim record's `u` back into a URL. The dataset is someone else's text, so a string is
 *  honoured only when it really is a gazette document link — another host, or a `javascript:`
 *  scheme, is discarded rather than written into an href. */
export function sourceHref(u: number | string | null | undefined): string | null {
  if (typeof u === 'number') return Number.isSafeInteger(u) && u > 0 ? `${GAZETTE}/documents/${u}.pdf` : null
  if (typeof u !== 'string' || !u.trim()) return null
  try {
    const url = new URL(u.trim())
    return url.origin === GAZETTE ? url.href : null
  } catch {
    return null
  }
}

/** Where to send someone who wants the actual document, best first.
 *
 *  The dataset's own `source_url` wins when it is there. Failing that, a modern id *contains* the
 *  gazette's document number, so the same link can be built without the field — verified against
 *  the publisher: the PDF at the derived URL is byte-identical to the one in the dataset.
 *
 *  The years with neither — 2013 to 2024-11, which upstream is still backfilling — have only a
 *  per-year sequence number, and the sole copy sits inside a monthly archive of several hundred
 *  megabytes, far too big to hand someone who wants one page. Those get sent to the gazette's own
 *  site to look the citation up, with the dataset's file *page* (not the download) as a fallback. */
export function docLinks(id: string, month: string | undefined, u?: number | string | null): DocLinks {
  const modern = /^\d{4}-\d{2}-\d{2}-(\d{8})$/.exec(id)
  const href = sourceHref(u) ?? (modern ? `${GAZETTE}/documents/${modern[1].replace(/^0+/, '')}.pdf` : null)
  if (href) return { primary: { href, label: 'เปิด PDF ต้นฉบับ' }, fromSource: true }
  const m = month ?? `${id.slice(0, 4)}-01`
  return {
    primary: { href: `${GAZETTE}/`, label: 'ค้นฉบับนี้ที่เว็บราชกิจจานุเบกษา' },
    secondary: {
      href: `${HF}/blob/main/zip/${id.slice(0, 4)}/${m}.zip`,
      label: `ไฟล์รวมเดือน ${m} ที่ OpenLawData`,
    },
    fromSource: false,
  }
}

export function Doc({ id, month }: { id: string; month?: string }) {
  const href = useHref()
  const client = useClient()
  const st = useLoad(
    async (c) => {
      if (!docIdOk(id)) throw new Error(`รหัสเอกสารไม่ถูกต้อง: ${id}`)
      const [hit, tax, agencies, provinces, meta] = await Promise.all([
        c.doc(id, month),
        c.taxonomy(),
        c.agencies(),
        c.provinces(),
        c.meta(),
      ])
      if (!hit) throw new Error(`ไม่พบเอกสาร ${id}`)
      const siblings = (await c.month(id.slice(0, 4), hit.month))
        .filter((d) => d.v === hit.doc.v && d.p === hit.doc.p && d.id !== id)
        .sort((a, b) => (a.pg ?? 0) - (b.pg ?? 0))
      const agency = agencies.find((a) => a.id === hit.doc.a) ?? null
      // The agency's own page already counts its documents per topic and per province, so the
      // precise "where do I go from here" numbers cost one small file rather than the whole
      // archive index — which matters, because a shared link lands here first.
      const facet = agency ? await c.agency(agency.id).catch(() => null) : null
      return { ...hit, tax, provinces, meta, agency, facet, siblings }
    },
    [id, month],
  )
  // read once, outside render: sessionStorage throws in a storage-blocked context, and three
  // synchronous reads per render would take the whole route down with it
  const [back] = useState(lastExplore)
  const [copied, setCopied] = useState('')
  const [fmt, setFmt] = useState<CiteFormat>('standard')
  useTitle(st.state === 'ok' ? st.data.doc.t : null, st.state === 'ok' ? st.data.doc.id : undefined)
  if (st.state === 'loading') return <Loading what="เอกสาร" />
  if (st.state === 'error') return <ErrorBox error={st.error} what="เอกสารฉบับนี้" />
  const { doc: d, tax, agency, facet, siblings, provinces } = st.data
  const title = displayTitle(d, agency?.name)
  const coords = { volume: d.v, part: d.p, page: d.pg, date: d.d }
  const cite = formatCitation(fmt, d.t, coords)
  const links = docLinks(d.id, st.data.month, d.u)
  const readable = hasFullText(st.data.meta.text, st.data.month, d.id, d.tx)
  // Clipboard access needs a secure context and can be refused; the optional chain used to mean
  // the button simply did nothing, forever, with no explanation. These buttons are the page's
  // whole point for a lawyer, so a failure has to say so and leave the text selectable.
  const copy = (what: string, text: string) => {
    const done = () => {
      setCopied(what)
      setTimeout(() => {
        setCopied('')
      }, 1500)
    }
    const clip = navigator.clipboard
    if (!clip) {
      setCopied('fail')
      return
    }
    clip.writeText(text).then(done, () => {
      setCopied('fail')
    })
  }
  const before = siblings.filter((s) => (s.pg ?? 0) < (d.pg ?? 0)).slice(-1)[0]
  const after = siblings.find((s) => (s.pg ?? 0) > (d.pg ?? 0))
  return (
    <article>
      <Crumbs
        items={[
          { label: 'สำรวจ', to: back ?? href.explore() },
          ...(d.topic ? [{ label: topicName(tax, d.topic), to: href.topic(d.topic) }] : []),
          { label: d.id },
        ]}
      />
      {back && (
        <p style="margin:0 0 8px">
          <a class="btn" href={back}>
            ← กลับไปผลการค้นหา
          </a>
        </p>
      )}
      <Kicker>
        {d.dt ?? 'เอกสาร'} · ราชกิจจานุเบกษา {coordinates(coords)} · {thaiDate(d.d)}
      </Kicker>
      <h1 style="margin:8px 0 18px;font-size:1.6rem" data-testid="doc-title">
        {title.text}
        {title.missing && (
          <span class="muted notitle">
            {' '}
            · ชุดข้อมูลไม่มีชื่อเรื่องของฉบับนี้ — ดูจาก PDF ต้นฉบับหรือเนื้อหาเต็ม
          </span>
        )}
      </h1>
      {/* on paper there is no address bar, so the printout carries its own way back */}
      <p class="printback">
        {permalink(d.id, st.data.month, client.source)} · พิมพ์เมื่อ {new Date().toLocaleDateString('th-TH')}
      </p>
      <div class="two">
        <section>
          <div class="card">
            <table>
              <tbody>
                <tr>
                  <th scope="row">รหัส</th>
                  <td>
                    <code>{d.id}</code>
                  </td>
                </tr>
                <tr>
                  <th scope="row">ผู้ออก</th>
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
                    <th scope="row">จังหวัด</th>
                    <td>
                      <a href={href.province(provinceFile(d.pr, provinces))}>{d.pr}</a>
                    </td>
                  </tr>
                )}
                <tr>
                  <th scope="row">หมวด</th>
                  <td>
                    {d.topic ? <a href={href.topic(d.topic)}>{topicName(tax, d.topic)}</a> : '—'}{' '}
                    {d.topic && (d.tc ? '✓' : <span class="pill guess">คาดว่า</span>)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">การกระทำ</th>
                  <td>
                    {d.action && d.ac ? (
                      <a href={href.explore({ scope: 'all', action: d.action })}>
                        {actionName(tax, d.action)}
                      </a>
                    ) : (
                      actionName(tax, d.action) || '—'
                    )}{' '}
                    {d.action && (d.ac ? '✓' : <span class="pill guess">คาดว่า</span>)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">ระดับ</th>
                  <td>
                    {d.govlevel && d.gc ? (
                      <a href={href.explore({ scope: 'all', govlevel: d.govlevel })}>
                        {govName(tax, d.govlevel)}
                      </a>
                    ) : (
                      govName(tax, d.govlevel) || '—'
                    )}{' '}
                    {d.govlevel && (d.gc ? '✓' : <span class="pill guess">คาดว่า</span>)}
                  </td>
                </tr>
                {d.x &&
                  Object.entries(d.x).map(([k, v]) => (
                    <tr key={k}>
                      <th scope="row">{xLabel(k)}</th>
                      <td>{xValue(k, v)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p class="doclinks">
              <a class="btn primary big" href={links.primary.href} target="_blank" rel="noopener">
                <span aria-hidden="true">↗</span> {links.primary.label}
              </a>
              {links.secondary && (
                <a class="btn" href={links.secondary.href} target="_blank" rel="noopener">
                  {links.secondary.label} ↗
                </a>
              )}
            </p>
            {!links.fromSource && (
              <p class="muted" style="font-size:.8rem;margin:10px 0 0">
                {readable ? (
                  <>
                    <b>อ่านเนื้อหาเต็มของฉบับนี้ได้ที่ด้านล่าง</b> —{' '}
                    <a href="#fulltext" onClick={onJump('fulltext')}>
                      ข้ามไปอ่านเลย
                    </a>{' '}
                    · ส่วนไฟล์ PDF ต้นฉบับ ชุดข้อมูลยังไม่มีลิงก์ของปีนี้ (กำลังทยอยเพิ่มอยู่){' '}
                  </>
                ) : (
                  <>ชุดข้อมูลยังไม่มีลิงก์ตรงของฉบับนี้ (กำลังทยอยเพิ่มอยู่) </>
                )}
                ระหว่างนี้ถ้าต้องการตัวไฟล์ ให้ค้นด้วยเล่ม ตอน และหน้า ด้านบน — กดคัดลอกการอ้างอิงไปวางได้เลย
                · สำเนาในชุดข้อมูลเปิดอยู่รวมกันทั้งเดือน จึงมีขนาดใหญ่มาก
                และของปีเก่าบางส่วนยังจับคู่กับเลขที่เอกสารผิดฉบับ <a href={href.about()}>(ดูข้อจำกัด)</a>
              </p>
            )}
          </div>
          <div class="card citebox" style="margin-top:12px">
            <div class="toolbar" style="gap:8px">
              <label class="check">
                <span>รูปแบบการอ้างอิง</span>
                <select
                  value={fmt}
                  aria-label="รูปแบบการอ้างอิง"
                  onChange={(e) => {
                    setFmt((e.target as HTMLSelectElement).value as CiteFormat)
                  }}
                >
                  {CITE_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => {
                  copy('cite', cite)
                }}
                data-testid="cite"
              >
                {copied === 'cite' ? 'คัดลอกแล้ว ✓' : 'คัดลอกการอ้างอิง'}
              </button>
              <button
                onClick={() => {
                  copy('link', permalink(d.id, st.data.month, client.source))
                }}
                data-testid="copy-link"
              >
                {copied === 'link' ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
              </button>
            </div>
            {copied === 'fail' && (
              <p class="muted" style="font-size:.85rem;margin:10px 0 0" role="status">
                คัดลอกอัตโนมัติไม่ได้ในเบราว์เซอร์นี้ — เลือกข้อความด้านล่างแล้วคัดลอกเองได้เลย
              </p>
            )}
            <p
              style="font-size:.9rem;margin:10px 0 0;font-family:var(--serif);user-select:all"
              data-testid="citation"
            >
              {cite}
            </p>
          </div>
        </section>
        <section>
          <h2 style="font-size:1.05rem;margin-bottom:8px">จำแนกหมวดนี้จากอะไร</h2>
          <div class="evidence" data-testid="evidence">
            {d.labels.length === 0 && (
              <p class="muted">ฉบับนี้ยังจำแนกหมวดไม่ได้ — ไม่เข้าเกณฑ์ของหมวดใดเลย</p>
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
                  ดูจาก{l.m.map(evidenceLabel).join(' + ')} · น้ำหนัก {l.w.toFixed(2)}{' '}
                  {l.c ? '· ยืนยันแล้ว ✓' : '· ยังไม่ยืนยัน'}
                </span>
              </div>
            ))}
          </div>
          <p class="muted" style="font-size:.85rem">
            การจำแนกใช้เกณฑ์ที่เขียนไว้ชัดเจน ไม่ได้ใช้ปัญญาประดิษฐ์ · "ยืนยันแล้ว"
            คือหมวดที่มีหลักฐานจากโครงสร้างเอกสาร หรือจากข้อมูลสองแหล่งที่เป็นอิสระต่อกัน
            ซึ่งวัดความแม่นยำได้ราว 98–100% · <a href={href.about()}>ดูวิธีวัด</a>
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
      {readable && st.data.meta.text?.base && (
        <FullText base={st.data.meta.text.base} id={d.id} month={st.data.month} at={d.tx} />
      )}
      <Next d={d} tax={tax} agency={agency} facet={facet} provinces={provinces} />
    </article>
  )
}

/** Where to go from one document. A reader who arrived from a search engine has no context at
 *  all, and "this issuer has published 412 more in this subject" is a better next step than a
 *  bare link, because it says whether the step is worth taking. Every number comes from the
 *  agency's own page, which is a small file — the archive index would be the wrong price to pay
 *  on the page people reach from a shared link. */
function Next({
  d,
  tax,
  agency,
  facet,
  provinces,
}: {
  d: SlimDoc
  tax: Taxonomy
  agency: { id: string; name: string } | null
  facet: AgencyPage | null
  provinces: { name: string; file: string }[]
}) {
  const href = useHref()
  const topicN = d.topic && d.tc ? (facet?.by_topic[d.topic] ?? 0) : 0
  const provN = d.pr ? (facet?.provinces[d.pr] ?? 0) : 0
  const steps: { to: string; label: string; n?: number; why: string }[] = []
  if (agency && d.topic && topicN > 1)
    steps.push({
      to: href.explore({ scope: 'all', agency: agency.id, topic: d.topic }),
      label: `${agency.name} · ${topicName(tax, d.topic)}`,
      n: topicN,
      why: 'หน่วยงานเดียวกัน หมวดเดียวกัน',
    })
  if (agency && facet)
    steps.push({
      to: href.agency(agency.id),
      label: agency.name,
      n: facet.total,
      why: 'ทุกฉบับของหน่วยงานนี้',
    })
  if (d.topic && d.tc)
    steps.push({
      to: href.topic(d.topic),
      label: topicName(tax, d.topic),
      n: tax.topics[d.topic]?.n,
      why: 'ทั้งคลัง',
    })
  if (d.pr && provN > 0)
    steps.push({
      to: href.province(provinces.find((p) => p.name === d.pr)?.file ?? d.pr),
      label: d.pr,
      n: provN,
      why: 'จังหวัดนี้ จากหน่วยงานนี้',
    })
  // A royal command carries no agency and often no confirmed subject, so every step above can be
  // absent and the block would simply vanish. The day it was published always exists, and "what
  // else came out that day" is a real place to go — so it is the floor, not a filler.
  if (d.d)
    steps.push({
      to: href.explore({ scope: 'month', month: d.d.slice(0, 7), day: d.d }),
      label: thaiDate(d.d),
      why: 'ฉบับอื่นที่ประกาศวันเดียวกัน',
    })
  if (!steps.length) return null
  return (
    <section class="nextsteps">
      <h2 class="sec">ไปต่อจากฉบับนี้</h2>
      <div class="doors">
        {steps.map((s) => (
          <a key={s.to} class="door" href={s.to}>
            <span class="nm">{s.label}</span>
            <span class="muted">
              {s.why}
              {s.n ? ` · ${s.n.toLocaleString('th-TH')} ฉบับ` : ''}
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}
