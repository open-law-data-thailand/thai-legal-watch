import { useEffect, useMemo, useState } from 'preact/hooks'
import { useLoad } from '../data/context'
import type { SlimDoc, Taxonomy } from '../data/types'
import { type CubeFilter, planFetch, rowLocation } from '../lib/cube'
import { crossFilter, descendantCodes } from '../lib/cubequery'
import { beMonth, beYear, thaiDate } from '../lib/thai'
import { rememberExplore } from '../lib/title'
import { useHref } from '../data/context'
import { DEFAULT_SOURCE, hrefFor } from '../router'
import { Bars, DocRow, Empty, ErrorBox, Kicker, Loading, actionName, govName, topicName } from '../ui/bits'

const PAGE = 50
/** How many matching rows the whole-archive scan keeps. Beyond this nobody is browsing any more,
 *  they are exporting — and the count above the list is exact regardless of this number. */
const CUBE_ROWS = 600
/** Titles are not in the cube; they come from month shards — measured at 130-235 KB over the wire
 *  and 2.7 MB parsed, so a handful is affordable and the whole 261 of them is not. A filter narrow
 *  enough to spread its matches thinly (one topic in one province can be eighty documents across
 *  eighty months) would otherwise pull the archive down a page at a time. Each round reads this
 *  many, which is also what the data client keeps cached, and then offers to continue. */
const BATCH_SHARDS = 6
const MAX_BATCHES = 4
/** a stable empty array, so a memo keyed on `loaded` is not invalidated every render */
const EMPTY: SlimDoc[] = []
const NO_ROWS: number[] = []

export type Scope = 'month' | 'year' | 'all'
export interface Filters {
  topic?: string
  action?: string
  govlevel?: string
  province?: string
  agency?: string
  /** ประเภทเอกสาร — ประกาศ, กฎกระทรวง, พระราชกฤษฎีกา… as the gazette itself labels them */
  dtype?: string
  q?: string
  scope?: Scope
  month?: string
  year?: string
  /** a single publication date, YYYY-MM-DD — how a click on the home sparkline arrives */
  day?: string
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
    dtype: pick('dtype'),
    q: pick('q'),
    month: pick('month'),
    year: pick('year'),
    day: /^\d{4}-\d{2}-\d{2}$/.test(pick('day') ?? '') ? pick('day') : undefined,
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
  // The three labelled dimensions match only when the label is corroborated — the same rule the
  // pipeline uses to build the topic, agency and province pages and every count on this one.
  // Without it a chip read "(120)" and then listed 150 documents, because the count applied the
  // rule and the filter did not.
  if (f.topic && except !== 'topic' && !(d.tc && topicMatches(d.topic, f.topic, tax))) return false
  if (f.action && except !== 'action' && !(d.ac && d.action === f.action)) return false
  if (f.govlevel && except !== 'govlevel' && !(d.gc && d.govlevel === f.govlevel)) return false
  if (f.province && except !== 'province' && d.pr !== f.province) return false
  if (f.agency && except !== 'agency' && d.a !== f.agency) return false
  if (f.dtype && except !== 'dtype' && d.dt !== f.dtype) return false
  if (f.q && except !== 'q' && !d.t.replace(/\s+/g, '').includes(f.q.replace(/\s+/g, ''))) return false
  if (f.day && except !== 'day' && d.d !== f.day) return false
  return true
}

export function Explore({ q }: { q: URLSearchParams }) {
  const href = useHref()
  // one object per navigation, not per render: every memo below keys off it
  const f = useMemo(() => filtersFrom(q), [q])
  const base = useLoad(async (c) => {
    const [tax, years, agencies, provinces] = await Promise.all([
      c.taxonomy(),
      c.years(),
      c.agencies(),
      c.provinces(),
    ])
    return { tax, years, agencies: new Map(agencies.map((a) => [a.id, a.name])), provinces }
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
  // Every number on this page comes from the archive index — in every scope, not just "ทั้งหมด".
  // Before, the period dropdowns counted from `years.json`, which knows nothing about the other
  // filters: choosing จังหวัดตรัง still offered "กันยายน 2569 (2,097)", the whole month. Now each
  // option says what *this* filter would find there, so the dropdowns double as the statistic.
  const cubeSt = useLoad(async (c) => await c.cube(), [])
  const cube = cubeSt.state === 'ok' ? cubeSt.data : null
  const [page, setPage] = useState(0)
  // so a document page can offer "back to the list you came from" — the key was read in three
  // places and written in none, which made that button unreachable since it was written
  useEffect(() => {
    rememberExplore(location.hash)
  }, [q])
  const tax = base.state === 'ok' ? base.data.tax : undefined
  const loaded = useMemo(() => (docs.state === 'ok' ? docs.data : EMPTY), [docs])
  // The scope is a date range like any other filter, which is what lets one code path answer
  // "this month", "this year" and "everything".
  const period = useMemo(
    () =>
      scope === 'month' && month
        ? { from: `${month}-01`, to: `${month}-31` }
        : scope === 'year' && year
          ? { from: `${year}-01-01`, to: `${year}-12-31` }
          : {},
    [scope, month, year],
  )
  const cubeFilter = useMemo<CubeFilter | null>(
    () =>
      cube && tax
        ? {
            topics: f.topic ? descendantCodes(cube, tax, f.topic) : undefined,
            action: f.action,
            gov: f.govlevel,
            prov: f.province,
            dtype: f.dtype,
            agency: f.agency,
            day: f.day,
            ...period,
          }
        : null,
    [cube, tax, f, period],
  )
  const across = useMemo(
    () => (cube && cubeFilter ? crossFilter(cube, tax, cubeFilter, CUBE_ROWS) : null),
    [cube, cubeFilter, tax],
  )
  // Rows are not documents: a row says which month shard holds the record and where in it. Shards
  // are big, so they are fetched a few at a time and the reader is told what is still unread
  // rather than being shown a short list as if it were the whole answer.
  const [batches, setBatches] = useState(1)
  useEffect(() => {
    setBatches(1)
  }, [cubeFilter])
  const plan = useMemo(
    () => (cube ? planFetch(cube, across?.rows ?? NO_ROWS, BATCH_SHARDS * batches) : null),
    [cube, across, batches],
  )
  const want = plan?.months.join(',') ?? ''
  const shards = useLoad(
    async (c) =>
      new Map(
        await Promise.all(
          (want ? want.split(',') : []).map(async (m) => [m, await c.month(m.slice(0, 4), m)] as const),
        ),
      ),
    [want],
  )
  // The resolved documents are kept, not the shards they came from: a shard is megabytes and the
  // records are not, so holding these lets the data client evict shards freely — and lets the list
  // stay on screen while the next batch loads instead of blinking out and losing the scroll.
  const filterKey = useMemo(() => JSON.stringify(cubeFilter), [cubeFilter])
  const [got, setGot] = useState<{ key: string; docs: SlimDoc[] }>({ key: '', docs: EMPTY })
  useEffect(() => {
    if (!cube || !plan || shards.state !== 'ok') return
    const out: SlimDoc[] = []
    for (const r of plan.rows) {
      const loc = rowLocation(cube, r)
      const d = loc ? shards.data.get(loc.month)?.[loc.offset] : undefined
      if (d) out.push(d)
    }
    setGot({ key: filterKey, docs: out })
  }, [cube, plan, shards, filterKey])
  const cubeDocs = got.key === filterKey ? got.docs : EMPTY
  // `f` rather than a hand-written list of its fields: the list forgot `f.day`, so choosing a day
  // changed the heading and the count while the list below kept showing the whole month.
  // The list in a month or a year still comes from the shards, because only they carry titles and
  // so only they can answer the title search. The *numbers* never do.
  const hits = useMemo(() => loaded.filter((d) => matches(d, f, tax)).reverse(), [loaded, f, tax])
  const EMPTY_COUNTS = useMemo(() => new Map<string, number>(), [])
  const topicCounts = across?.topics ?? EMPTY_COUNTS
  const actionCounts = across?.actions ?? EMPTY_COUNTS
  const govCounts = across?.govs ?? EMPTY_COUNTS
  const provinceCounts = across?.provinces ?? EMPTY_COUNTS
  const dtypeCounts = across?.dtypes ?? EMPTY_COUNTS
  const dayCounts = useMemo(
    () => [...(across?.days ?? EMPTY_COUNTS).entries()].sort(([a], [b]) => a.localeCompare(b)),
    [across, EMPTY_COUNTS],
  )
  // A dropdown of 77 provinces is something you scan, not something you rank: alphabetical by
  // Thai collation is the only order in which a reader can find ตรัง without reading all of them.
  const provinceOptions = useMemo(() => {
    const all = base.state === 'ok' ? base.data.provinces : []
    return [...all].sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [base])
  if (base.state === 'loading') return <Loading />
  if (base.state === 'error') return <ErrorBox error={base.error} />
  const set = (patch: Partial<Record<keyof Filters, string>>, replace = false) => {
    const cur = Object.fromEntries(Object.entries(f).filter(([, x]) => x)) as Record<string, string>
    // a day belongs to one month; changing the month or the scope must not leave a stale one
    // behind, which looks exactly like "the search is broken, it finds nothing"
    if (('month' in patch || 'scope' in patch || 'year' in patch) && !('day' in patch)) delete cur.day
    const to = href.explore({ ...cur, ...patch })
    // typing in the title box used to push a history entry per keystroke, so Back stopped being
    // a way out of the page
    if (replace) location.replace(to)
    else location.hash = to
    setPage(0)
  }
  const roots = Object.entries(tax?.topics ?? {})
    .filter(([, t]) => !t.parent)
    .map(([s]) => s)
    .sort((a, b) => (topicCounts.get(b) ?? 0) - (topicCounts.get(a) ?? 0))
  // While the data a count is made from is still arriving there is no honest number to put beside
  // an option, and "(0)" beside every one of them reads as "nothing matches" — which is what this
  // page showed for a second on every month change.
  const countsReady = across !== null
  const fmt = (n: number | undefined) => (countsReady ? ` (${(n ?? 0).toLocaleString('th-TH')})` : '')
  // In a month or a year the list is the answer, so its length is the headline — the two agree
  // unless a title search is narrowing the list, which the index cannot see.
  const total = scope === 'all' ? (across?.total ?? 0) : f.q ? hits.length : (across?.total ?? 0)
  const scopeLabel = f.day
    ? thaiDate(f.day)
    : scope === 'month'
      ? `เดือน ${month ? beMonth(month) : ''}`
      : scope === 'year'
        ? `ปี ${year ? beYear(year) : ''}`
        : 'ทั้งคลัง'
  // A filter that matches nothing here but plenty elsewhere used to read as "the search is
  // broken". The index already knows where the matches are, so offer the nearest period instead.
  const elsewhere = (() => {
    if (!across || total > 0 || scope === 'all') return null
    const pick = scope === 'month' ? across.months : across.years
    const best = [...pick.entries()].filter(([, n]) => n > 0).sort(([a], [b]) => b.localeCompare(a))[0]
    if (!best) return null
    const [key, n] = best
    return scope === 'month'
      ? { label: `เดือน ${beMonth(key)}`, n, patch: { month: key } }
      : { label: `ปี ${beYear(key)}`, n, patch: { year: key } }
  })()
  const list = scope === 'all' ? cubeDocs : hits
  // only a genuinely empty list waits: once something is on screen, a further batch loads under it
  const listing =
    scope === 'all'
      ? (cubeSt.state !== 'ok' || shards.state === 'loading') && cubeDocs.length === 0
      : docs.state === 'loading'
  const listError = scope === 'all' ? (cubeSt.state === 'error' ? cubeSt.error : null) : null
  return (
    <>
      <Kicker>
        <span role="status">
          {countsReady ? (
            <>
              สำรวจ · ตรงเงื่อนไข {total.toLocaleString('th-TH')} ฉบับ ใน{scopeLabel}
            </>
          ) : (
            <>สำรวจ · กำลังนับใน{scopeLabel}</>
          )}
        </span>
      </Kicker>
      <h1 style="margin:6px 0 16px">สำรวจตามหมวด สิ่งที่ทำ ระดับผู้ออก และพื้นที่</h1>
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
                {beMonth(m)}
                {fmt(across?.months.get(m))}
              </option>
            ))}
          </select>
        )}
        {scope === 'month' && dayCounts.length > 0 && (
          <select
            aria-label="วันที่"
            value={f.day ?? ''}
            onChange={(e) => set({ day: (e.target as HTMLSelectElement).value })}
            style="padding:8px"
          >
            <option value="">ทุกวันในเดือนนี้</option>
            {dayCounts.map(([d, n]) => (
              <option key={d} value={d}>
                {thaiDate(d)} ({n.toLocaleString('th-TH')})
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
                {beYear(y)}
                {fmt(across?.years.get(y))}
              </option>
            ))}
          </select>
        )}
        {scope === 'all' && (
          <span class="muted" style="font-size:.85rem">
            {countsReady
              ? `มุมมองทั้งคลัง${years.length ? ` ${beYear(years[years.length - 1] ?? '')}–${beYear(years[0] ?? '')}` : ''} · ตัวกรองทุกอันใช้ร่วมกันได้ ตัวเลขในวงเล็บคิดจากตัวกรองอื่นที่เลือกไว้แล้ว`
              : 'กำลังโหลดดัชนีทั้งคลัง (ครั้งแรกประมาณครึ่งเมกะไบต์ หลังจากนั้นเก็บไว้ในเครื่อง)'}
          </span>
        )}
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:16px">
        <label>
          สิ่งที่เอกสารทำ
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
          จังหวัด
          <br />
          <select
            value={f.province ?? ''}
            onChange={(e) => set({ province: (e.target as HTMLSelectElement).value })}
            style="width:100%;padding:8px"
          >
            <option value="">ทุกจังหวัด</option>
            {provinceOptions.map((p) => (
              <option key={p.file} value={p.name}>
                {p.name}
                {fmt(provinceCounts.get(p.name))}
              </option>
            ))}
          </select>
        </label>
        <label>
          ประเภทเอกสาร
          <br />
          <select
            value={f.dtype ?? ''}
            onChange={(e) => set({ dtype: (e.target as HTMLSelectElement).value })}
            style="width:100%;padding:8px"
          >
            <option value="">ทุกประเภท</option>
            {[...dtypeCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <option key={k} value={k}>
                  {k}
                  {fmt(n)}
                </option>
              ))}
            {f.dtype && !dtypeCounts.has(f.dtype) && (
              <option key={f.dtype} value={f.dtype}>
                {f.dtype}
                {fmt(0)}
              </option>
            )}
          </select>
        </label>
        <label>
          ค้นในชื่อเรื่อง
          <br />
          <input
            type="search"
            value={f.q ?? ''}
            placeholder={
              scope === 'all' ? 'เลือกช่วงเวลาก่อนจึงค้นชื่อเรื่องได้' : 'ขยะ, พิทักษ์ทรัพย์, แต่งตั้ง…'
            }
            disabled={scope === 'all'}
            title={
              scope === 'all'
                ? 'ชื่อเรื่องไม่ได้อยู่ในดัชนีทั้งคลัง — สลับเป็นรายปีหรือรายเดือนเพื่อค้นในชื่อเรื่อง'
                : undefined
            }
            onInput={(e) => {
              set({ q: (e.target as HTMLInputElement).value }, true)
            }}
          />
        </label>
      </div>
      <p class="muted" style="font-size:.85rem;margin:-6px 0 16px">
        ตัวเลขในวงเล็บคือจำนวนฉบับที่จะได้ <b>ถ้าเลือกตัวเลือกนั้น</b> โดยยังคงตัวกรองอื่นไว้ —
        เลือกจังหวัดแล้ว รายการเดือนและปีก็จะนับเฉพาะจังหวัดนั้น
        {f.q && ' · ยกเว้นคำค้นในชื่อเรื่อง ซึ่งกรองเฉพาะรายการด้านล่าง ไม่ได้กรองตัวเลขเหล่านี้'}
      </p>
      {elsewhere && (
        <p class="emptyhint" style="margin:-8px 0 16px">
          ไม่มีฉบับที่ตรงเงื่อนไขใน{scopeLabel} — ช่วงล่าสุดที่มีคือ{' '}
          <button
            class="chip"
            onClick={() => {
              set(elsewhere.patch)
            }}
          >
            {elsewhere.label} ({elsewhere.n.toLocaleString('th-TH')})
          </button>
        </p>
      )}
      <div class="chips" style="margin-bottom:20px" aria-label="หมวดหลัก">
        <button class="chip" aria-pressed={!f.topic} onClick={() => set({ topic: '' })}>
          {/* the chips below count corroborated topics only, so this has to count the same
              population — otherwise the parts add up to more than the whole */}
          ทุกหมวด
          {fmt(
            scope === 'all'
              ? across?.topicTotal
              : loaded.filter((d) => d.topic && d.tc && matches(d, f, tax, 'topic')).length,
          )}
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
            <button key={s} class="chip" aria-pressed={f.topic === s} onClick={() => set({ topic: s })}>
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
      {(f.province || f.agency || f.day || f.dtype) && (
        <p class="muted">
          กรองเพิ่ม:{' '}
          {f.day && (
            <span class="pill">
              เฉพาะวันที่ {thaiDate(f.day)}{' '}
              <button class="chip" onClick={() => set({ day: '' })} aria-label="ลบตัวกรองวันที่">
                ×
              </button>
            </span>
          )}{' '}
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
          )}{' '}
          {f.dtype && (
            <span class="pill">
              {f.dtype}{' '}
              <button class="chip" onClick={() => set({ dtype: '' })} aria-label="ลบตัวกรองประเภทเอกสาร">
                ×
              </button>
            </span>
          )}
        </p>
      )}
      <div class="two">
        <section>
          <h2 style="font-size:1rem;margin-bottom:10px">สรุปผลที่ได้</h2>
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
          <h3 style="font-size:.95rem;margin:18px 0 8px">สิ่งที่เอกสารทำ</h3>
          <Bars
            rows={
              scope === 'all'
                ? [...actionCounts.entries()].sort((a, b) => b[1] - a[1])
                : count(hits, (d) => (d.ac ? d.action : null))
            }
            nameOf={(k) => actionName(tax, k)}
          />
          <h3 style="font-size:.95rem;margin:18px 0 8px">ระดับผู้ออก</h3>
          <Bars
            rows={
              scope === 'all'
                ? [...govCounts.entries()].sort((a, b) => b[1] - a[1])
                : count(hits, (d) => (d.gc ? d.govlevel : null))
            }
            nameOf={(k) => govName(tax, k)}
          />
          <p style="margin-top:16px">
            <button
              onClick={() => {
                downloadCsv(
                  list,
                  scope === 'month' ? month : scope === 'year' ? year : 'ทั้งคลัง',
                  tax,
                  href.doc,
                )
              }}
              disabled={!list.length}
            >
              ดาวน์โหลด CSV ({list.length.toLocaleString('th-TH')})
            </button>
            {scope === 'all' && list.length < total && (
              <span class="muted" style="display:block;font-size:.85rem;margin-top:6px">
                ไฟล์จะได้เฉพาะ {list.length.toLocaleString('th-TH')} ฉบับที่โหลดรายละเอียดมาแล้ว จาก{' '}
                {total.toLocaleString('th-TH')} ฉบับที่ตรงเงื่อนไข — กด "โหลดเพิ่ม"
                ด้านล่างก่อนถ้าต้องการมากกว่านี้
              </span>
            )}
          </p>
        </section>
        <section>
          {/* A filter can be exact and still be unlistable: eighty documents spread over eighty
              months is eighty shards. The count above is right either way, and the year it came
              from is already in the archive index — so offer the years instead of a dead end. */}
          {scope === 'all' && across && total > list.length && (
            <div class="chips" style="margin-bottom:14px" aria-label="แยกดูรายปี">
              <span class="muted" style="align-self:center;font-size:.85rem">
                ดูให้ครบทีละปี:
              </span>
              {[...across.years.entries()]
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([y, n]) => (
                  <button key={y} class="chip" onClick={() => set({ scope: 'year', year: y })}>
                    {beYear(y)} ({n.toLocaleString('th-TH')})
                  </button>
                ))}
            </div>
          )}
          {listing && <Loading what={scope === 'all' ? 'ดัชนีทั้งคลัง' : scopeLabel} />}
          {docs.state === 'error' && <ErrorBox error={docs.error} />}
          {shards.state === 'error' && <ErrorBox error={shards.error} />}
          {listError !== null && <ErrorBox error={listError} what="ดัชนีทั้งคลัง" />}
          {!listing && !listError && list.length === 0 && (
            <Empty>
              ไม่พบฉบับที่ตรงเงื่อนไขใน{scopeLabel} — ลองลบตัวกรองบางอัน
              {scope === 'all' ? ' หรือเลือกหมวดที่กว้างขึ้น' : ' ขยายช่วงเวลา หรือเปลี่ยนคำค้นในชื่อเรื่อง'}
            </Empty>
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
          {/* The count above the list is exact; this list is only as long as the shards fetched so
              far allow. Saying which is which is the difference between a partial list and a
              wrong one. */}
          {scope === 'all' && (plan?.rest.length ?? 0) > 0 && batches < MAX_BATCHES && (
            <p style="margin-top:14px">
              <button
                class="btn"
                disabled={shards.state === 'loading'}
                onClick={() => {
                  setBatches((n) => n + 1)
                }}
              >
                {shards.state === 'loading' ? 'กำลังโหลด…' : 'โหลดเพิ่ม'}
              </button>
              <span class="muted" style="display:block;font-size:.85rem;margin-top:6px">
                แสดงรายละเอียดแล้ว {list.length.toLocaleString('th-TH')} จาก {total.toLocaleString('th-TH')}{' '}
                ฉบับ — ที่เหลืออยู่คนละเดือนกัน จึงต้องโหลดข้อมูลรายเดือนเพิ่มทีละชุด
              </span>
            </p>
          )}
          {scope === 'all' &&
            total > list.length &&
            (batches >= MAX_BATCHES || (plan?.rest.length ?? 0) === 0) && (
              <p class="muted" style="font-size:.85rem;margin-top:14px">
                แสดง {list.length.toLocaleString('th-TH')} ฉบับล่าสุด จาก {total.toLocaleString('th-TH')}{' '}
                ฉบับที่ตรงเงื่อนไข — ตัวเลขด้านบนนับครบทั้งคลังแล้ว ถ้าต้องการไล่ดูให้ครบ
                ให้แคบตัวกรองลงหรือสลับเป็นรายปี
              </p>
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

/** The BOM is not decoration: without it Excel on Windows reads the Thai as mojibake.
 *  Slugs stay for anyone processing the file; the Thai names and the link are for the far more
 *  common case of somebody reading it in a spreadsheet. */
export function toCsv(
  docs: SlimDoc[],
  tax?: Taxonomy,
  origin = '',
  link: (id: string, month?: string) => string = hrefFor(DEFAULT_SOURCE).doc,
): string {
  const esc = (v: string | number | boolean | null | undefined) =>
    `"${(v ?? '').toString().replace(/"/g, '""')}"`
  const head = [
    'id',
    'url',
    'title',
    'date',
    'volume',
    'part',
    'page',
    'doc_type',
    'topic',
    'topic_thai',
    'topic_corroborated',
    'action',
    'action_thai',
    'action_corroborated',
    'govlevel',
    'govlevel_thai',
    'province',
  ]
  const rows = docs.map((d) =>
    [
      d.id,
      `${origin}${link(d.id, d.d?.slice(0, 7))}`,
      d.t,
      d.d,
      d.v,
      d.p,
      d.pg,
      d.dt,
      d.topic,
      topicName(tax, d.topic),
      d.tc,
      d.action,
      actionName(tax, d.action),
      d.ac,
      d.govlevel,
      govName(tax, d.govlevel),
      d.pr,
    ]
      .map(esc)
      .join(','),
  )
  return `\uFEFF${head.join(',')}\n${rows.join('\n')}\n`
}

function downloadCsv(
  docs: SlimDoc[],
  label: string | undefined,
  tax: Taxonomy | undefined,
  link: (id: string, month?: string) => string,
) {
  const origin = typeof location === 'undefined' ? '' : `${location.origin}${location.pathname}`
  const blob = new Blob([toCsv(docs, tax, origin, link)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `thai-legal-watch-${label ?? 'export'}.csv`
  // Firefox will not follow a click on an anchor that is not in the document, and revoking the
  // object URL in the same tick can cancel the download before it starts.
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 10_000)
}
