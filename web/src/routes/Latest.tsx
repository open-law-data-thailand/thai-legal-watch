/** The last 90 days, raw and in order, for somebody who opens this every morning to see what came
 *  out. No facets, no charts: a dated list with a filter that narrows as you type. */
import { useEffect, useMemo, useState } from 'preact/hooks'
import { useHref, useLoad } from '../data/context'
import type { SlimDoc, Taxonomy } from '../data/types'
import { highlight } from '../lib/highlight'
import { coordinates, thaiDate } from '../lib/thai'
import { displayTitle, Empty, ErrorBox, Kicker, LabelPills, Loading } from '../ui/bits'

/** Fourteen thousand rows is not a list any browser should render at once. */
const PAGE = 150
const EMPTY: SlimDoc[] = []

/** Exact substring, spaces ignored — Thai is written without them, and somebody pasting a phrase
 *  out of a document should not have to match its whitespace. */
export function matchesText(d: SlimDoc, needle: string, agency: string | undefined): boolean {
  if (!needle) return true
  const hay = `${d.t} ${d.id} ${agency ?? ''} ${d.pr ?? ''} ${d.dt ?? ''}`
  return hay.replace(/\s+/g, '').includes(needle)
}

export interface Day {
  date: string
  docs: SlimDoc[]
  /** How many that date has in total — not how many are on screen. */
  total: number
}

/** Runs of documents sharing a date. The list already arrives newest first. */
export function byDay(docs: SlimDoc[]): Day[] {
  const out: Day[] = []
  for (const d of docs) {
    const date = d.d ?? ''
    const last = out[out.length - 1]
    if (last && last.date === date) {
      last.docs.push(d)
      last.total++
    } else out.push({ date, docs: [d], total: 1 })
  }
  return out
}

/** Only `limit` documents are rendered, but each date still reports its own full count — the
 *  number beside a date is a fact about that day, not about how far the page has been scrolled. */
export function visibleDays(days: Day[], limit: number): Day[] {
  const out: Day[] = []
  let left = limit
  for (const g of days) {
    if (left <= 0) break
    out.push({ date: g.date, docs: g.docs.slice(0, left), total: g.total })
    left -= g.docs.length
  }
  return out
}

export function Latest({ q }: { q: URLSearchParams }) {
  const href = useHref()
  const st = useLoad(async (c) => {
    const [latest, tax, agencies] = await Promise.all([c.latest(), c.taxonomy(), c.agencies()])
    return { latest, tax, agencies: new Map(agencies.map((a) => [a.id, a.name])) }
  }, [])
  const [text, setText] = useState(q.get('q') ?? '')
  const [shown, setShown] = useState(PAGE)

  // the filter is worth keeping in the URL so a search can be shared, but typing must not fill
  // the history with one entry per character
  useEffect(() => {
    const to = href.latest(text)
    if (location.hash !== to) location.replace(to)
  }, [text, href])

  const needle = text.replace(/\s+/g, '')
  // a fresh [] every render would invalidate the filter memo on every keystroke and re-scan
  // fourteen thousand records for nothing
  const all = useMemo(() => (st.state === 'ok' ? st.data.latest.docs : EMPTY), [st])
  const agencies = st.state === 'ok' ? st.data.agencies : undefined
  const hits = useMemo(
    () => all.filter((d) => matchesText(d, needle, agencies?.get(d.a ?? ''))),
    [all, needle, agencies],
  )
  useEffect(() => {
    setShown(PAGE)
  }, [needle])

  if (st.state === 'loading') return <Loading what="รายการล่าสุด" />
  if (st.state === 'error') return <ErrorBox error={st.error} what="รายการล่าสุด" />
  const { latest, tax } = st.data
  const groups = visibleDays(byDay(hits), shown)

  return (
    <>
      <Kicker>
        ล่าสุด {latest.days} วัน · {latest.from ? thaiDate(latest.from) : '—'} ถึง{' '}
        {latest.to ? thaiDate(latest.to) : '—'}
      </Kicker>
      <h1 style="margin:6px 0 10px">ราชกิจจานุเบกษาล่าสุด</h1>
      <p class="muted" style="max-width:70ch;margin-bottom:16px">
        ทุกฉบับที่ประกาศใน {latest.days} วันล่าสุด เรียงจากใหม่ไปเก่า ไม่ได้คัดอะไรออก พิมพ์เพื่อกรองทันที —
        ค้นในชื่อเรื่อง ผู้ออก จังหวัด ประเภทเอกสาร และรหัส
      </p>

      <div class="latestbar">
        <label class="check" style="flex:1">
          <span class="sr-only">กรองรายการล่าสุด</span>
          <input
            type="search"
            value={text}
            placeholder="พิมพ์คำที่ต้องการ เช่น ผังเมือง · เทศบาล · พิทักษ์ทรัพย์"
            class="latestfilter"
            onInput={(e) => {
              setText((e.target as HTMLInputElement).value)
            }}
          />
        </label>
        <span class="muted" role="status">
          {needle ? (
            <>
              ตรงกัน <b>{hits.length.toLocaleString('th-TH')}</b> จาก {all.length.toLocaleString('th-TH')}{' '}
              ฉบับ
            </>
          ) : (
            <>ทั้งหมด {all.length.toLocaleString('th-TH')} ฉบับ</>
          )}
        </span>
      </div>

      {hits.length === 0 && (
        <Empty>
          ไม่พบฉบับที่มีคำว่า "{text}" ใน {latest.days} วันล่าสุด —{' '}
          <a href={href.explore({ scope: 'month', q: needle })}>ค้นย้อนหลังทั้งเดือนในหน้าสำรวจ →</a>
        </Empty>
      )}
      {needle !== '' && hits.length > 0 && (
        <p class="muted" style="font-size:.85rem;margin:-4px 0 14px">
          หน้านี้ดูเฉพาะ {latest.days} วันล่าสุด · ต้องการย้อนหลังกว่านี้{' '}
          <a href={href.explore({ scope: 'month', q: needle })}>ค้นคำเดิมในหน้าสำรวจ →</a>
        </p>
      )}

      <div data-testid="latest">
        {groups.map((g) => (
          <section key={g.date}>
            <h2 class="daybar">
              <span>{g.date ? thaiDate(g.date) : 'ไม่ระบุวันที่'}</span>
              <span class="n">
                {g.total.toLocaleString('th-TH')} ฉบับ
                {g.docs.length < g.total && ` · แสดง ${g.docs.length.toLocaleString('th-TH')}`}
              </span>
            </h2>
            <div class="doclist">
              {g.docs.map((d) => (
                <Row key={d.id} d={d} tax={tax} q={needle} agency={st.data.agencies.get(d.a ?? '')} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {shown < hits.length && (
        <p style="margin-top:20px">
          <button
            class="btn"
            onClick={() => {
              setShown((n) => n + PAGE * 2)
            }}
          >
            แสดงเพิ่ม — เหลืออีก {(hits.length - shown).toLocaleString('th-TH')} ฉบับ
          </button>
        </p>
      )}
    </>
  )
}

function Row({ d, tax, q, agency }: { d: SlimDoc; tax: Taxonomy; q: string; agency: string | undefined }) {
  const href = useHref()
  const title = displayTitle(d, agency)
  return (
    <article class="doc">
      <a class="title" href={href.doc(d.id, d.d?.slice(0, 7))}>
        {highlight(title.text, q).map((s, i) =>
          s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>,
        )}
        {title.missing && <span class="muted notitle"> · ชุดข้อมูลไม่มีชื่อเรื่องของฉบับนี้</span>}
      </a>
      <div class="meta">
        <LabelPills d={d} tax={tax} agencyName={agency} />
        {d.dt && <span>{d.dt}</span>}
        <span>{coordinates({ volume: d.v, part: d.p, page: d.pg, date: d.d })}</span>
        <span class="muted">
          <code>{d.id}</code>
        </span>
      </div>
    </article>
  )
}
