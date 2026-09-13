import { useMemo, useState } from 'preact/hooks'
import { useLoad } from '../data/context'
import type { SlimDoc, Taxonomy } from '../data/types'
import { href } from '../router'
import { Bars, DocRow, ErrorBox, Kicker, Loading, actionName, govName, topicName } from '../ui/bits'

const PAGE = 50

export interface Filters {
  topic?: string
  action?: string
  govlevel?: string
  province?: string
  agency?: string
  q?: string
  month?: string
}

export function filtersFrom(q: URLSearchParams): Filters {
  const pick = (k: keyof Filters) => q.get(k) ?? undefined
  return {
    topic: pick('topic'),
    action: pick('action'),
    govlevel: pick('govlevel'),
    province: pick('province'),
    agency: pick('agency'),
    q: pick('q'),
    month: pick('month'),
  }
}

/** Pure, testable filter: a document matches when every set filter matches (topic matches by ancestry). */
export function matches(d: SlimDoc, f: Filters, tax: Taxonomy | undefined): boolean {
  if (f.topic) {
    let cur: string | null = d.topic
    let ok = false
    while (cur) {
      if (cur === f.topic) {
        ok = true
        break
      }
      cur = tax?.topics[cur]?.parent ?? null
    }
    if (!ok) return false
  }
  if (f.action && d.action !== f.action) return false
  if (f.govlevel && d.govlevel !== f.govlevel) return false
  if (f.province && d.pr !== f.province) return false
  if (f.agency && d.a !== f.agency) return false
  if (f.q && !d.t.replace(/\s+/g, '').includes(f.q.replace(/\s+/g, ''))) return false
  return true
}

export function Explore({ q }: { q: URLSearchParams }) {
  const f = filtersFrom(q)
  const base = useLoad(async (c) => {
    const [tax, years, agencies] = await Promise.all([c.taxonomy(), c.years(), c.agencies()])
    return { tax, years, agencies: new Map(agencies.map((a) => [a.id, a.name])) }
  }, [])
  const months = base.state === 'ok' ? Object.keys(base.data.years.by_month).sort().reverse() : []
  const month = f.month ?? months[0]
  const docs = useLoad(async (c) => (month ? c.month(month.slice(0, 4), month) : []), [month])
  const [page, setPage] = useState(0)
  const tax = base.state === 'ok' ? base.data.tax : undefined
  const hits = useMemo(
    () => (docs.state === 'ok' ? docs.data.filter((d) => matches(d, f, tax)).reverse() : []),
    [docs, f.topic, f.action, f.govlevel, f.province, f.agency, f.q, tax],
  )
  if (base.state === 'loading') return <Loading />
  if (base.state === 'error') return <ErrorBox error={base.error} />
  const set = (k: keyof Filters, v: string) => {
    location.hash = href.explore({
      ...(Object.fromEntries(Object.entries(f).filter(([, x]) => x)) as Record<string, string>),
      [k]: v,
    })
    setPage(0)
  }
  const topicRows = Object.entries(tax?.topics ?? {})
    .filter(([, t]) => !t.parent)
    .map(([s, t]) => [s, t.n] as [string, number])
    .sort((a, b) => b[1] - a[1])
  return (
    <>
      <Kicker>
        สำรวจ · {hits.length.toLocaleString('th-TH')} ฉบับตรงเงื่อนไขในเดือน {month}
      </Kicker>
      <h1 style="margin:6px 0 16px">สำรวจตามหมวด การกระทำ ระดับ และพื้นที่</h1>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:16px">
        <label>
          เดือน
          <br />
          <select
            value={month}
            onChange={(e) => set('month', (e.target as HTMLSelectElement).value)}
            style="width:100%;padding:8px"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          การกระทำ
          <br />
          <select
            value={f.action ?? ''}
            onChange={(e) => set('action', (e.target as HTMLSelectElement).value)}
            style="width:100%;padding:8px"
          >
            <option value="">ทั้งหมด</option>
            {Object.entries(tax?.actions ?? {}).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          ระดับผู้ออก
          <br />
          <select
            value={f.govlevel ?? ''}
            onChange={(e) => set('govlevel', (e.target as HTMLSelectElement).value)}
            style="width:100%;padding:8px"
          >
            <option value="">ทั้งหมด</option>
            {Object.entries(tax?.govlevels ?? {}).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
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
            onInput={(e) => set('q', (e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <div class="chips" style="margin-bottom:20px" aria-label="หมวดหลัก">
        <button class="chip" aria-pressed={!f.topic} onClick={() => set('topic', '')}>
          ทุกหมวด
        </button>
        {topicRows.map(([s]) => (
          <button key={s} class="chip" aria-pressed={f.topic === s} onClick={() => set('topic', s)}>
            {topicName(tax, s)}
          </button>
        ))}
      </div>
      {(f.province || f.agency) && (
        <p class="muted">
          กรองเพิ่ม:{' '}
          {f.province && (
            <span class="pill">
              {f.province}{' '}
              <button class="chip" onClick={() => set('province', '')} aria-label="ลบตัวกรองจังหวัด">
                ×
              </button>
            </span>
          )}{' '}
          {f.agency && (
            <span class="pill">
              {base.data.agencies.get(f.agency) ?? f.agency}{' '}
              <button class="chip" onClick={() => set('agency', '')} aria-label="ลบตัวกรองหน่วยงาน">
                ×
              </button>
            </span>
          )}
        </p>
      )}
      <div class="two">
        <section>
          <h2 style="font-size:1rem;margin-bottom:10px">ในผลลัพธ์นี้</h2>
          <Bars
            rows={count(hits, (d) => (d.tc ? d.topic : null)).slice(0, 8)}
            nameOf={(k) => topicName(tax, k)}
          />
          <h3 style="font-size:.95rem;margin:18px 0 8px">การกระทำ</h3>
          <Bars rows={count(hits, (d) => (d.ac ? d.action : null))} nameOf={(k) => actionName(tax, k)} />
          <h3 style="font-size:.95rem;margin:18px 0 8px">ระดับ</h3>
          <Bars rows={count(hits, (d) => (d.gc ? d.govlevel : null))} nameOf={(k) => govName(tax, k)} />
          <p style="margin-top:16px">
            <button onClick={() => downloadCsv(hits, month)} disabled={!hits.length}>
              ดาวน์โหลด CSV ({hits.length})
            </button>
          </p>
        </section>
        <section aria-live="polite">
          {docs.state === 'loading' && <Loading what={`เดือน ${month}`} />}
          {docs.state === 'error' && <ErrorBox error={docs.error} />}
          <div class="doclist" data-testid="results">
            {hits.slice(page * PAGE, (page + 1) * PAGE).map((d) => (
              <DocRow
                key={d.id}
                d={d}
                tax={tax}
                month={month}
                agencyName={d.a ? base.data.agencies.get(d.a) : null}
              />
            ))}
          </div>
          {hits.length > PAGE && (
            <div class="pager">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                ← ก่อนหน้า
              </button>
              <span class="muted">
                หน้า {page + 1} / {Math.ceil(hits.length / PAGE)}
              </span>
              <button disabled={(page + 1) * PAGE >= hits.length} onClick={() => setPage(page + 1)}>
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

function downloadCsv(docs: SlimDoc[], month: string | undefined) {
  const blob = new Blob([toCsv(docs)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `thai-legal-watch-${month ?? 'export'}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
