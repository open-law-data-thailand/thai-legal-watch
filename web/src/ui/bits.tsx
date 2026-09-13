import type { ComponentChildren } from 'preact'
import { useCountUp } from '../lib/motion'
import { highlight } from '../lib/highlight'
import type { RecentDoc, SlimDoc, Taxonomy } from '../data/types'
import { thaiDate } from '../lib/thai'
import { href } from '../router'

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

export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div class="error" role="alert">
      โหลดข้อมูลไม่สำเร็จ — {msg}
    </div>
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
export function LabelPills({
  d,
  tax,
  agencyName,
}: {
  d: RecentDoc | SlimDoc
  tax?: Taxonomy
  agencyName?: string | null
}) {
  const gov = 'gc' in d ? d.gc : true
  return (
    <>
      {d.topic && (
        <a
          class={`pill topic${d.tc ? '' : ' guess'}`}
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
  const max = rows[0]?.[1] ?? 1
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

export function Sparkline({ points }: { points: { d: string; n: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.n))
  return (
    <div class="spark" role="img" aria-label={`จำนวนฉบับต่อวัน ${points.length} วันล่าสุด`}>
      {points.map((p) => (
        <i
          key={p.d}
          style={`height:${Math.round((100 * p.n) / max)}%`}
          title={`${thaiDate(p.d, { short: true })}: ${p.n}`}
        />
      ))}
    </div>
  )
}

export function FeedLink({ path }: { path: string }) {
  return (
    <a class="btn" href={`/data/feeds/${path}.xml`} title="ติดตามด้วย RSS reader">
      <span aria-hidden="true">◌ </span>RSS
    </a>
  )
}
