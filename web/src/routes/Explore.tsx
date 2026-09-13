import { useMemo, useState } from 'preact/hooks'
import { useLoad } from '../data/context'
import type { SlimDoc, Taxonomy } from '../data/types'
import { beYear } from '../lib/thai'
import { href } from '../router'
import { Bars, DocRow, ErrorBox, Kicker, Loading, actionName, govName, topicName } from '../ui/bits'

const PAGE = 50

export type Scope = 'month' | 'year' | 'all'
export interface Filters {
  topic?: string
  action?: string
  govlevel?: string
  province?: string
  agency?: string
  q?: string
  scope?: Scope
  month?: string
  year?: string
}

export function filtersFrom(q: URLSearchParams): Filters {
  const pick = (k: keyof Filters) => q.get(k) ?? undefined
  const scope = pick('scope')
  return {
    topic: pick('topic'),
    action: pick('action'),
    govlevel: pick('govlevel'),
    province: pick('province'),
    agency: pick('agency'),
    q: pick('q'),
    month: pick('month'),
    year: pick('year'),
    scope: scope === 'year' || scope === 'all' ? scope : 'month',
  }
}

/** Topic filter matches by ancestry: a waste rule is an environment document too. */
export function topicMatches(docTopic: string | null, wanted: string, tax: Taxonomy | undefined): boolean {
  for (let cur: string | null = docTopic; cur; cur = tax?.topics[cur]?.parent ?? null)
    if (cur === wanted) return true
  return false
}

/** Pure, testable filter; `except` leaves one dimension unfiltered so its option counts can be shown. */
export function matches(d: SlimDoc, f: Filters, tax: Taxonomy | undefined, except?: keyof Filters): boolean {
  if (f.topic && except !== 'topic' && !topicMatches(d.topic, f.topic, tax)) return false
  if (f.action && except !== 'action' && d.action !== f.action) return false
  if (f.govlevel && except !== 'govlevel' && d.govlevel !== f.govlevel) return false
  if (f.province && except !== 'province' && d.pr !== f.province) return false
  if (f.agency && except !== 'agency' && d.a !== f.agency) return false
  if (f.q && except !== 'q' && !d.t.replace(/\s+/g, '').includes(f.q.replace(/\s+/g, ''))) return false
  return true
}

export function Explore({ q }: { q: URLSearchParams }) {
  const f = filtersFrom(q)
  const base = useLoad(async (c) => {
    const [tax, years, agencies] = await Promise.all([c.taxonomy(), c.years(), c.agencies()])
    return { tax, years, agencies: new Map(agencies.map((a) => [a.id, a.name])) }
  }, [])
  const months = base.state === 'ok' ? Object.keys(base.data.years.by_month).sort().reverse() : []
  const years = base.state === 'ok' ? Object.keys(base.data.years.by_year).sort().reverse() : []
  const month = f.month ?? months[0]
  const year = f.year ?? month?.slice(0, 4) ?? years[0]
  const scope: Scope = f.scope ?? 'month'
  // what gets loaded: one month, every month of a year, or nothing (aggregate mode)
  const wanted =
    scope === 'month'
      ? month
        ? [month]
        : []
      : scope === 'year'
        ? months.filter((m) => m.startsWith(year ?? ''))
        : []
  const docs = useLoad(
    async (c) => (await Promise.all(wanted.map((m) => c.month(m.slice(0, 4), m)))).flat(),
    [wanted.join(',')],
  )
  const agg = useLoad(async (c) => (scope === 'all' && f.topic ? c.topic(f.topic) : null), [scope, f.topic])
  const [page, setPage] = useState(0)
  const tax = base.state === 'ok' ? base.data.tax : undefined
  const loaded = docs.state === 'ok' ? docs.data : []
  const hits = useMemo(
    () => loaded.filter((d) => matches(d, f, tax)).reverse(),
    [loaded, f.topic, f.action, f.govlevel, f.province, f.agency, f.q, tax],
  )
  // option counts with that one dimension left open, so the UI can say "(n)" per choice
  const countsFor = (key: keyof Filters, pick: (d: SlimDoc) => string | null) => {
    const m = new Map<string, number>()
    for (const d of loaded)
      if (matches(d, f, tax, key)) {
        const k = pick(d)
        if (k) m.set(k, (m.get(k) ?? 0) + 1)
      }
    return m
  }
  const topicCounts = useMemo(() => {
    const m = new Map<string, number>()
    if (scope === 'all') {
      for (const [s, t] of Object.entries(tax?.topics ?? {})) m.set(s, t.n)
      return m
    }
    for (const d of loaded)
      if (matches(d, f, tax, 'topic') && d.topic && d.tc)
        for (let cur: string | null = d.topic; cur; cur = tax?.topics[cur]?.parent ?? null)
          m.set(cur, (m.get(cur) ?? 0) + 1)
    return m
  }, [loaded, f, tax, scope])
  const actionCounts = useMemo(
    () =>
      scope === 'all'
        ? new Map(Object.entries(tax?.action_counts ?? {}))
        : countsFor('action', (d) => (d.ac ? d.action : null)),
    [loaded, f, tax, scope],
  )
  const govCounts = useMemo(
    () =>
      scope === 'all'
        ? new Map(Object.entries(tax?.govlevel_counts ?? {}))
        : countsFor('govlevel', (d) => (d.gc ? d.govlevel : null)),
    [loaded, f, tax, scope],
  )
  if (base.state === 'loading') return <Loading />
  if (base.state === 'error') return <ErrorBox error={base.error} />
  const set = (patch: Partial<Record<keyof Filters, string>>) => {
    const cur = Object.fromEntries(Object.entries(f).filter(([, x]) => x)) as Record<string, string>
    location.hash = href.explore({ ...cur, ...patch })
    setPage(0)
  }
  const roots = Object.entries(tax?.topics ?? {})
    .filter(([, t]) => !t.parent)
    .map(([s]) => s)
    .sort((a, b) => (topicCounts.get(b) ?? 0) - (topicCounts.get(a) ?? 0))
  const fmt = (n: number | undefined) =>
    n ? ` (${n.toLocaleString('th-TH')})` : scope === 'all' ? '' : ' (0)'
  const total =
    scope === 'all'
      ? f.topic
        ? agg.state === 'ok'
          ? (agg.data?.total ?? 0)
          : 0
        : Object.values(base.data.years.by_year).reduce((s, n) => s + n, 0)
      : hits.length
  const scopeLabel =
    scope === 'month' ? `เดือน ${month}` : scope === 'year' ? `ปี ${year ? beYear(year) : ''}` : 'ทั้งคลัง'
  const list = scope === 'all' ? (agg.state === 'ok' && agg.data ? agg.data.recent : []) : hits
  return (
    <>
      <Kicker>
        สำรวจ · {total.toLocaleString('th-TH')} ฉบับตรงเงื่อนไขใน{scopeLabel}
      </Kicker>
      <h1 style="margin:6px 0 16px">สำรวจตามหมวด การกระทำ ระดับ และพื้นที่</h1>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
        <div class="scope" role="group" aria-label="ช่วงเวลา">
          {(['month', 'year', 'all'] as Scope[]).map((s) => (
            <button key={s} aria-pressed={scope === s} onClick={() => set({ scope: s })}>
              {s === 'month' ? 'รายเดือน' : s === 'year' ? 'รายปี' : 'ทั้งหมด'}
            </button>
          ))}
        </div>
        {scope === 'month' && (
          <select
            aria-label="เดือน"
            value={month}
            onChange={(e) => set({ month: (e.target as HTMLSelectElement).value })}
            style="padding:8px"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m} ({(base.data.years.by_month[m] ?? 0).toLocaleString('th-TH')})
              </option>
            ))}
          </select>
        )}
        {scope === 'year' && (
          <select
            aria-label="ปี"
            value={year}
            onChange={(e) => set({ year: (e.target as HTMLSelectElement).value })}
            style="padding:8px"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {beYear(y)} ({(base.data.years.by_year[y] ?? 0).toLocaleString('th-TH')})
              </option>
            ))}
          </select>
        )}
        {scope === 'all' && (
          <span class="muted" style="font-size:.85rem">
            โหมดภาพรวม: ตัวเลขจากทั้งคลัง รายการแสดง 30 ฉบับล่าสุดของหมวดที่เลือก
          </span>
        )}
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:16px">
        <label>
          การกระทำ
          <br />
          <select
            value={f.action ?? ''}
            onChange={(e) => set({ action: (e.target as HTMLSelectElement).value })}
            style="width:100%;padding:8px"
          >
            <option value="">ทั้งหมด</option>
            {Object.entries(tax?.actions ?? {}).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
                {fmt(actionCounts.get(k))}
              </option>
            ))}
          </select>
        </label>
        <label>
          ระดับผู้ออก
          <br />
          <select
            value={f.govlevel ?? ''}
            onChange={(e) => set({ govlevel: (e.target as HTMLSelectElement).value })}
            style="width:100%;padding:8px"
          >
            <option value="">ทั้งหมด</option>
            {Object.entries(tax?.govlevels ?? {}).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
                {fmt(govCounts.get(k))}
              </option>
            ))}
          </select>
        </label>
        <label>
          ค้นในชื่อเรื่อง
          <br />
          <input
            type="search"
            value={f.q ?? ''}
            placeholder="ขยะ, พิทักษ์ทรัพย์, แต่งตั้ง…"
            disabled={scope === 'all'}
            onInput={(e) => set({ q: (e.target as HTMLInputElement).value })}
          />
        </label>
      </div>
      <div class="chips" style="margin-bottom:20px" aria-label="หมวดหลัก">
        <button class="chip" aria-pressed={!f.topic} onClick={() => set({ topic: '' })}>
          ทุกหมวด{fmt(scope === 'all' ? undefined : loaded.filter((d) => matches(d, f, tax, 'topic')).length)}
        </button>
        {roots.map((s) => (
          <button key={s} class="chip" aria-pressed={f.topic === s} onClick={() => set({ topic: s })}>
            {topicName(tax, s)}
            {fmt(topicCounts.get(s))}
          </button>
        ))}
      </div>
      {f.topic && (tax?.topics[f.topic]?.children.length ?? 0) > 0 && (
        <div class="chips" style="margin:-10px 0 20px" aria-label="หมวดย่อย">
          {tax?.topics[f.topic]?.children.map((s) => (
            <button key={s} class="chip" aria-pressed={false} onClick={() => set({ topic: s })}>
              ↳ {topicName(tax, s)}
              {fmt(topicCounts.get(s))}
            </button>
          ))}
        </div>
      )}
      {f.topic && tax?.topics[f.topic]?.parent && (
        <p class="muted" style="margin:-8px 0 16px">
          หมวดย่อยของ{' '}
          <a
            href={href.explore({
              ...(Object.fromEntries(Object.entries(f).filter(([, x]) => x)) as Record<string, string>),
              topic: tax.topics[f.topic]?.parent ?? '',
            })}
          >
            {topicName(tax, tax.topics[f.topic]?.parent ?? null)}
          </a>{' '}
          · <a href={href.topic(f.topic)}>หน้าหมวด →</a>
        </p>
      )}
      {(f.province || f.agency) && (
        <p class="muted">
          กรองเพิ่ม:{' '}
          {f.province && (
            <span class="pill">
              {f.province}{' '}
              <button class="chip" onClick={() => set({ province: '' })} aria-label="ลบตัวกรองจังหวัด">
                ×
              </button>
            </span>
          )}{' '}
          {f.agency && (
            <span class="pill">
              {base.data.agencies.get(f.agency) ?? f.agency}{' '}
              <button class="chip" onClick={() => set({ agency: '' })} aria-label="ลบตัวกรองหน่วยงาน">
                ×
              </button>
            </span>
          )}
        </p>
      )}
      <div class="two">
        <section>
          <h2 style="font-size:1rem;margin-bottom:10px">ในผลลัพธ์นี้</h2>
          {scope === 'all' ? (
            <Bars
              rows={[...topicCounts.entries()]
                .filter(([s]) => !tax?.topics[s]?.parent)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)}
              nameOf={(k) => topicName(tax, k)}
              hrefOf={(k) => href.topic(k)}
            />
          ) : (
            <Bars
              rows={count(hits, (d) => (d.tc ? d.topic : null)).slice(0, 8)}
              nameOf={(k) => topicName(tax, k)}
              hrefOf={(k) => href.topic(k)}
            />
          )}
          <h3 style="font-size:.95rem;margin:18px 0 8px">การกระทำ</h3>
          <Bars
            rows={
              scope === 'all'
                ? [...actionCounts.entries()].sort((a, b) => b[1] - a[1])
                : count(hits, (d) => (d.ac ? d.action : null))
            }
            nameOf={(k) => actionName(tax, k)}
          />
          <h3 style="font-size:.95rem;margin:18px 0 8px">ระดับ</h3>
          <Bars
            rows={
              scope === 'all'
                ? [...govCounts.entries()].sort((a, b) => b[1] - a[1])
                : count(hits, (d) => (d.gc ? d.govlevel : null))
            }
            nameOf={(k) => govName(tax, k)}
          />
          {scope !== 'all' && (
            <p style="margin-top:16px">
              <button
                onClick={() => downloadCsv(hits, scope === 'month' ? month : year)}
                disabled={!hits.length}
              >
                ดาวน์โหลด CSV ({hits.length.toLocaleString('th-TH')})
              </button>
            </p>
          )}
        </section>
        <section aria-live="polite">
          {docs.state === 'loading' && <Loading what={scopeLabel} />}
          {docs.state === 'error' && <ErrorBox error={docs.error} />}
          {scope === 'all' && !f.topic && (
            <p class="muted">
              เลือกหมวดเพื่อดูฉบับล่าสุดของหมวดนั้น หรือสลับเป็นรายปี/รายเดือนเพื่อไล่ดูทุกฉบับ
            </p>
          )}
          <div class="doclist" data-testid="results">
            {list.slice(page * PAGE, (page + 1) * PAGE).map((d) => (
              <DocRow
                key={d.id}
                d={d}
                tax={tax}
                month={d.d?.slice(0, 7)}
                q={f.q}
                agencyName={d.a ? base.data.agencies.get(d.a) : null}
              />
            ))}
          </div>
          {list.length > PAGE && (
            <div class="pager">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                ← ก่อนหน้า
              </button>
              <span class="muted">
                หน้า {page + 1} / {Math.ceil(list.length / PAGE)}
              </span>
              <button disabled={(page + 1) * PAGE >= list.length} onClick={() => setPage(page + 1)}>
                ถัดไป →
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function count(docs: SlimDoc[], key: (d: SlimDoc) => string | null): [string, number][] {
  const m = new Map<string, number>()
  for (const d of docs) {
    const k = key(d)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export function toCsv(docs: SlimDoc[]): string {
  const esc = (v: string | number | boolean | null) => `"${(v ?? '').toString().replace(/"/g, '""')}"`
  const head = [
    'id',
    'title',
    'date',
    'volume',
    'part',
    'page',
    'doc_type',
    'topic',
    'topic_corroborated',
    'action',
    'action_corroborated',
    'govlevel',
    'province',
  ]
  const rows = docs.map((d) =>
    [d.id, d.t, d.d, d.v, d.p, d.pg, d.dt, d.topic, d.tc, d.action, d.ac, d.govlevel, d.pr]
      .map(esc)
      .join(','),
  )
  return `\uFEFF${head.join(',')}\n${rows.join('\n')}\n`
}

function downloadCsv(docs: SlimDoc[], label: string | undefined) {
  const blob = new Blob([toCsv(docs)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `thai-legal-watch-${label ?? 'export'}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
