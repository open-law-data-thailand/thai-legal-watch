import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { useCountUp } from '../lib/motion'
import { highlight } from '../lib/highlight'
import { familyColor, tint } from '../lib/family'
import { DataError } from '../data/client'
import { useClient, useHref } from '../data/context'
import type { RecentDoc, SlimDoc, Taxonomy } from '../data/types'
import { thaiDate } from '../lib/thai'

export function Kicker({ children }: { children: ComponentChildren }) {
  return <div class="kicker">{children}</div>
}

export function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  const n = useCountUp(typeof value === 'number' ? value : 0)
  return (
    <div class="metric">
      <div class="label">{label}</div>
      <div class={`value${typeof value === 'string' && value.length > 6 ? ' text' : ''}`}>
        {typeof value === 'number' ? <span class="count">{n.toLocaleString('th-TH')}</span> : value}
      </div>
      {hint && <div class="hint">{hint}</div>}
    </div>
  )
}

export function ErrorBox({ error, what }: { error: unknown; what?: string }) {
  const href = useHref()
  const msg = error instanceof Error ? error.message : 'ข้อผิดพลาดที่ไม่รู้จัก'
  // A 404 is not a failure, it is an answer: that thing does not exist. Saying "โหลดไม่สำเร็จ"
  // and printing an internal path sends the reader looking for a problem that is not theirs.
  const missing = error instanceof DataError && error.status === 404
  // A failed fetch is usually the network, not the site, and a dead end with no way forward is the
  // worst thing to leave someone with. Reloading re-runs the request with a cold client cache.
  return (
    <div class="error" role="alert">
      <p style="margin:0 0 8px">
        {missing
          ? `ไม่พบ${what ?? 'หน้านี้'}ในคลัง — อาจพิมพ์ผิด หรือยังไม่มีในชุดข้อมูล`
          : `โหลดข้อมูลไม่สำเร็จ — ${msg}`}
      </p>
      <p style="margin:0;display:flex;gap:8px;flex-wrap:wrap">
        {!missing && (
          <button
            onClick={() => {
              location.reload()
            }}
          >
            ลองใหม่
          </button>
        )}
        <a class="btn" href={href.home()}>
          กลับหน้าแรก
        </a>
      </p>
    </div>
  )
}

/** How old the data is allowed to get before the site says so. The pipeline runs nightly; three
 *  days means a weekend of failures is visible to a reader rather than only in a log nobody
 *  reads. Serving stale data silently is the failure this project can least afford. */
const STALE_DAYS = 3

export function StaleNotice({ generatedAt }: { generatedAt: string | undefined }) {
  if (!generatedAt) return null
  const built = Date.parse(generatedAt)
  if (Number.isNaN(built)) return null
  const days = Math.floor((Date.now() - built) / 86_400_000)
  if (days < STALE_DAYS) return null
  return (
    <p class="stale" role="status">
      <b>ข้อมูลยังไม่อัปเดต</b> ชุดข้อมูลบนเว็บนี้สร้างเมื่อ {thaiDate(generatedAt.slice(0, 10))} ({days}{' '}
      วันก่อน) ปกติจะสร้างใหม่ทุกคืน — ระหว่างนี้โปรดตรวจกับ{' '}
      <a href="https://ratchakitcha.soc.go.th/">ราชกิจจานุเบกษา</a> โดยตรง
    </p>
  )
}

export function Loading({ what = 'ข้อมูล' }: { what?: string }) {
  return (
    <p class="skeleton" aria-busy="true">
      กำลังโหลด{what}…
    </p>
  )
}

export function topicName(tax: Taxonomy | undefined, slug: string | null): string {
  if (!slug) return ''
  return tax?.topics[slug]?.thai ?? slug
}
export function actionName(tax: Taxonomy | undefined, slug: string | null): string {
  if (!slug) return ''
  return tax?.actions[slug] ?? slug
}
export function govName(tax: Taxonomy | undefined, slug: string | null): string {
  if (!slug) return ''
  return tax?.govlevels[slug] ?? slug
}

/** Labels of a document as pills; an uncorroborated headline label is shown as a guess. */
// TODO (agreed, not yet built): make การกระทำ / ระดับผู้ออก / จังหวัด / ประเภทเอกสาร filterable.
// Only หมวด and หน่วยงาน are links, because only they have a pre-built facet page to point at —
// an accident of the data's shape, not a hierarchy. The grey does not mean "secondary": หน่วยงาน
// is the same grey and *is* a link. Worse, `.pill:hover` lifts every pill, so three of five
// advertise themselves as clickable and are not.
//
// The archive index removed the reason: a pill can now point at สำรวจ instead of a page, and the
// cube answers `govlevel=central` over the whole corpus in under a millisecond —
// `href.explore({ scope: 'all', govlevel: d.govlevel })`, no new data files. จังหวัด filters by
// the Thai name, so it needs no slug mapping either.
//
// Decided — **replace, never add**: a pill always goes to สำรวจ scope=all carrying that one
// filter, wherever it was clicked. One meaning everywhere; it matches what the two existing
// linked pills already do; Back returns the reader to the list they built, so nothing is lost;
// and สำรวจ's own chips and dropdowns already do "narrow further" properly, with counts.
//
// Still to settle when this is built:
//  - a "คาดว่า" pill must NOT link: filters count corroborated labels only, so it would land the
//    reader on a list missing the very document they clicked from. Leaving those unlinked is also
//    what finally gives the dashed style a meaning — unconfirmed means not groupable.
//  - stop `.pill:hover` lifting the pills that are not links.
//  - the same two rows in Doc.tsx (การกระทำ, ระดับ) are plain text there too.
//  - ประเภทเอกสาร is a filter now but is not rendered as a pill anywhere yet.
export function LabelPills({
  d,
  tax,
  agencyName,
}: {
  d: RecentDoc | SlimDoc
  tax?: Taxonomy
  agencyName?: string | null
}) {
  const href = useHref()
  const gov = 'gc' in d ? d.gc : true
  return (
    <>
      {d.topic && (
        <a
          class={`pill topic${d.tc ? '' : ' guess'}`}
          style={
            d.tc
              ? `background:${tint(familyColor(d.topic, tax))};color:${familyColor(d.topic, tax)}`
              : undefined
          }
          href={href.topic(d.topic)}
          title={d.tc ? 'ยืนยันแล้ว' : 'คาดว่า — ยังไม่มีหลักฐานที่สอง'}
        >
          {topicName(tax, d.topic)}
          {d.tc ? ' ✓' : ' · คาดว่า'}
        </a>
      )}
      {d.action && (
        <span class={`pill action${d.ac ? '' : ' guess'}`}>
          {actionName(tax, d.action)}
          {d.ac ? ' ✓' : ' · คาดว่า'}
        </span>
      )}
      {d.govlevel && <span class={`pill${gov ? '' : ' guess'}`}>{govName(tax, d.govlevel)}</span>}
      {d.pr && <span class="pill">{d.pr}</span>}
      {agencyName && d.a && (
        <a class="pill" href={href.agency(d.a)}>
          {agencyName}
        </a>
      )}
    </>
  )
}

/** Every list on the site can legitimately be empty; none of them should render as a blank gap
 *  under a heading that promised something. */
export function Empty({ children }: { children: ComponentChildren }) {
  return (
    <p class="muted empty" role="status">
      {children}
    </p>
  )
}

export function DocRow({
  d,
  tax,
  month,
  agencyName,
  q,
}: {
  d: RecentDoc | SlimDoc
  tax?: Taxonomy
  month?: string
  agencyName?: string | null
  q?: string
}) {
  const href = useHref()
  return (
    <article class="doc">
      <a class="title" href={href.doc(d.id, month ?? d.d?.slice(0, 7))}>
        {highlight(d.t, q).map((s, i) =>
          s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>,
        )}
      </a>
      <div class="meta">
        <LabelPills d={d} tax={tax} agencyName={agencyName} />
        <span>{thaiDate(d.d, { short: true })}</span>
        {'v' in d && d.v && (
          <span>
            เล่ม {d.v}
            {d.p ? ` ${d.p}` : ''}
            {d.pg ? ` หน้า ${d.pg}` : ''}
          </span>
        )}
      </div>
    </article>
  )
}

export function Bars({
  rows,
  total,
  nameOf,
  hrefOf,
}: {
  rows: [string, number][]
  total?: number
  nameOf: (k: string) => string
  hrefOf?: (k: string) => string
}) {
  // the largest value, not the first one: `rows` is sorted for most callers but the month-of-year
  // profile is in calendar order, and normalising against January clipped seven bars to 100% and
  // hid the very ranking the chart exists to show
  const max = Math.max(1, ...rows.map(([, n]) => n))
  return (
    <div class="grid" style="gap:8px">
      {rows.map(([k, n]) => (
        <div key={k}>
          <div class="row">
            {hrefOf ? <a href={hrefOf(k)}>{nameOf(k)}</a> : <span>{nameOf(k)}</span>}
            <span class="muted">
              {n.toLocaleString('th-TH')}
              {total ? ` · ${Math.round((100 * n) / total)}%` : ''}
            </span>
          </div>
          <div class="bar">
            <i style={`width:${Math.max(1, Math.round((100 * n) / max))}%`} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** One bar per day. Each bar is a link into สำรวจ filtered to that day, so "what came out on
 *  the 3rd?" is one click rather than a date-picker hunt. */
export function Sparkline({ points }: { points: { d: string; n: number }[] }) {
  const href = useHref()
  const max = Math.max(1, ...points.map((p) => p.n))
  const [at, setAt] = useState<number | null>(null)
  const shown = at !== null ? points[at] : null
  return (
    <div class="sparkwrap">
      <div class="spark" role="group" aria-label={`จำนวนฉบับต่อวัน ${points.length} วันล่าสุด`}>
        {points.map((p, i) => (
          <a
            key={p.d}
            class={`sparkbar${at === i ? ' on' : ''}`}
            href={href.explore({ scope: 'month', month: p.d.slice(0, 7), day: p.d })}
            aria-label={`${thaiDate(p.d)} ${p.n.toLocaleString('th-TH')} ฉบับ`}
            onMouseEnter={() => {
              setAt(i)
            }}
            onMouseLeave={() => {
              setAt(null)
            }}
            onFocus={() => {
              setAt(i)
            }}
            onBlur={() => {
              setAt(null)
            }}
          >
            <i style={`height:${Math.max(2, Math.round((100 * p.n) / max))}%`} />
          </a>
        ))}
      </div>
      <div class="sparkhint" role="status">
        {shown ? (
          <>
            {thaiDate(shown.d, { short: true })} · <b>{shown.n.toLocaleString('th-TH')}</b> ฉบับ —
            คลิกเพื่อดูรายฉบับ
          </>
        ) : (
          'ฉบับต่อวัน 30 วันล่าสุด — ชี้ที่แท่งเพื่อดูวันที่ คลิกเพื่อเปิดรายการของวันนั้น'
        )}
      </div>
    </div>
  )
}

export function FeedLink({ path }: { path: string }) {
  const client = useClient()
  return (
    <a class="btn" href={client.feedUrl(path)} title="ติดตามด้วย RSS reader">
      <span aria-hidden="true">◌ </span>RSS
    </a>
  )
}
