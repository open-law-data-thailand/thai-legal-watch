/** สถิติ — the numbers a reader of the gazette actually asks for.
 *
 *  The page has one control: the year. Everything below it answers for that year, and every
 *  comparison says out loud what it is a comparison against — a page that prints "มากขึ้น 12%"
 *  without naming the baseline is not a statistic, it is a decoration.
 *
 *  The breakdowns come from the archive index rather than from pre-built files, which is why a
 *  year can be broken down by province, agency and document type at all: nobody built a
 *  `year × province` file, and with 22 years and 77 provinces nobody sensibly could.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useHref, useLoad } from '../data/context'
import type { Taxonomy } from '../data/types'
import { crossFilter, descendantCodes } from '../lib/cubequery'
import { completeYears, movers, yearOverYear, type Move } from '../lib/trends'
import { reducedMotion } from '../lib/motion'
import { beYear, percent, thaiDate } from '../lib/thai'
import { Bars, ErrorBox, Kicker, Loading, Metric, actionName, govName, topicName } from '../ui/bits'
import { STAGE } from './Doc'

const RULE_ACTIONS = ['rulemaking', 'amendment', 'repeal']

/** What the reader has narrowed to, beyond the year. One value per dimension: this page is for
 *  reading a shape, and a multi-select per axis turns every number on it into a question about
 *  which combination produced it. สำรวจ is where a complicated query belongs. */
export interface Picks {
  topic?: string
  action?: string
  gov?: string
  prov?: string
  dtype?: string
  agency?: string
}

/** Which URL parameter สำรวจ knows each pick by, so "ไปสำรวจ" arrives with the same filter. */
const AS_PARAM: Record<keyof Picks, string> = {
  topic: 'topic',
  action: 'action',
  gov: 'govlevel',
  prov: 'province',
  dtype: 'dtype',
  agency: 'agency',
}

/** Which sections a reader has folded away. localStorage throws outright where site data is
 *  blocked, so every access is guarded and a failure just means everything opens. */
const FOLD_KEY = 'tlw.stats.folded'
function foldedSet(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? (raw as string[]) : [])
  } catch {
    return new Set()
  }
}
function remember(id: string, open: boolean) {
  try {
    const s = foldedSet()
    if (open) s.delete(id)
    else s.add(id)
    localStorage.setItem(FOLD_KEY, JSON.stringify([...s]))
  } catch {
    // a reader who blocks site data still gets a page that folds, just not one that remembers
  }
}
const TH_MONTH_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

/** The month files a year covers, or the whole archive when no year is chosen. Shards rather
 *  than a date range, so these numbers are the ones สำรวจ will show when the reader clicks
 *  through, and so the scan touches one year of rows instead of all twenty-two. */
const range = (byMonth: Record<string, number>, year: string | null) =>
  year ? { shards: Object.keys(byMonth).filter((m) => m.startsWith(year)) } : {}

export function Dashboard() {
  const href = useHref()
  const st = useLoad(async (c) => {
    const [years, tax, bk, trends, meta, cube, agencies] = await Promise.all([
      c.years(),
      c.taxonomy(),
      c.get_bankruptcy(),
      c.trends(),
      c.meta(),
      c.cube(),
      c.agencies(),
    ])
    return { years, tax, bk, trends, meta, cube, agencyName: new Map(agencies.map((a) => [a.id, a.name])) }
  }, [])
  const [year, setYear] = useState<string | null>(null)
  const [pick, setPick] = useState<Picks>({})
  const toggle = (axis: keyof Picks, k: string) => {
    setPick((p) => ({ ...p, [axis]: p[axis] === k ? undefined : k }))
  }
  const yearsRef = useRef<HTMLDivElement>(null)

  const ok = st.state === 'ok'
  const byYear = ok ? st.data.years.by_year : null
  const cube = ok ? st.data.cube : null
  const tax = ok ? st.data.tax : undefined
  const allYears = useMemo(() => (byYear ? Object.keys(byYear).sort() : []), [byYear])
  // the year before the focused one, so every comparison on the page has a named baseline
  const prevYear = year ? (allYears[allYears.indexOf(year) - 1] ?? null) : null

  const byMonth = ok ? st.data.years.by_month : null
  // Everything the reader has narrowed to except the year, which is a shard filter and so is
  // added per query. A topic carries its descendants, the way it does everywhere else here.
  const narrowed = useMemo(
    () =>
      cube
        ? {
            ...(pick.topic ? { topics: descendantCodes(cube, tax, pick.topic) } : {}),
            action: pick.action,
            gov: pick.gov,
            prov: pick.prov,
            dtype: pick.dtype,
            agency: pick.agency,
          }
        : {},
    [cube, tax, pick],
  )
  const now = useMemo(
    () => (cube && byMonth ? crossFilter(cube, tax, { ...range(byMonth, year), ...narrowed }, 0) : null),
    [cube, tax, year, byMonth, narrowed],
  )
  // The comparison carries the same narrowing: with a topic picked, "เทียบปีก่อน" has to mean
  // that topic last year, not the whole year last year.
  const before = useMemo(
    () =>
      cube && byMonth && prevYear
        ? crossFilter(cube, tax, { ...range(byMonth, prevYear), ...narrowed }, 0)
        : null,
    [cube, tax, prevYear, byMonth, narrowed],
  )

  // The chart is created once and then only re-styled. Re-running echarts.init on the same
  // element leaves the previous instance undisposed and its listeners attached.
  const chartRef = useRef<{
    setOption: (o: unknown) => void
    resize: () => void
    dispose: () => void
  } | null>(null)
  useEffect(() => {
    if (!byYear) return
    let disposed = false
    const el = yearsRef.current
    void import('../lib/charts').then(({ init }) => {
      if (disposed || !el) return
      const ys = Object.keys(byYear).sort()
      const chart = init(el, undefined, { renderer: 'svg' })
      chartRef.current = chart
      chart.setOption({
        backgroundColor: 'transparent',
        animation: !reducedMotion(),
        textStyle: { fontFamily: 'Anuphan, sans-serif' },
        grid: { left: 58, right: 12, top: 14, bottom: 30 },
        xAxis: { type: 'category', data: ys.map((k) => beYear(k)) },
        yAxis: { type: 'value' },
        tooltip: {
          trigger: 'axis',
          valueFormatter: (v: number) => `${v.toLocaleString('th-TH')} ฉบับ`,
        },
        series: [
          {
            type: 'bar',
            data: ys.map((k) => byYear[k]),
            animationDelay: (i: number) => (reducedMotion() ? 0 : i * 25),
          },
        ],
      })
      chart.on('click', (p: { dataIndex: number }) => {
        const clicked = ys[p.dataIndex] ?? null
        setYear((cur) => (cur === clicked ? null : clicked))
      })
      el.dataset.ready = '1'
    })
    const resize = () => {
      chartRef.current?.resize()
    }
    addEventListener('resize', resize)
    return () => {
      disposed = true
      removeEventListener('resize', resize)
      chartRef.current?.dispose()
      chartRef.current = null
      if (el) delete el.dataset.ready
    }
  }, [byYear])

  // highlight the focused year and the one it is compared against, without rebuilding the chart
  useEffect(() => {
    if (!byYear) return
    const ys = Object.keys(byYear).sort()
    chartRef.current?.setOption({
      series: [
        {
          data: ys.map((k) => ({
            value: byYear[k],
            itemStyle: {
              color: k === year ? '#c9502a' : k === prevYear ? '#d8a08c' : '#6b4fd8',
              borderRadius: [3, 3, 0, 0],
            },
          })),
        },
      ],
    })
  }, [year, prevYear, byYear])

  if (st.state === 'loading') return <Loading what="สถิติ" />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  const { bk, trends, meta, agencyName } = st.data

  const complete = completeYears(trends.years, meta.latest_date)
  const partialYear = meta.latest_date?.slice(0, 4) ?? ''
  const focusLabel = year ? `ปี ${beYear(year)}` : 'ทุกปีรวมกัน'
  const focusIsPartial = year !== null && year === partialYear
  const window = complete.slice(-3)
  const prior = complete.slice(-6, -3)

  // Every metric is a pair: the number, and the number it is being compared against.
  const total = now?.total ?? 0
  const prevTotal = before?.total ?? 0
  const ruleNow = RULE_ACTIONS.reduce((s, a) => s + (now?.actions.get(a) ?? 0), 0)
  const rulePrev = RULE_ACTIONS.reduce((s, a) => s + (before?.actions.get(a) ?? 0), 0)
  const agenciesNow = now?.agencies.size ?? 0
  const agenciesPrev = before?.agencies.size ?? 0
  const monthRows: [string, number][] = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, '0')
    const n = year
      ? (now?.months.get(`${year}-${mm}`) ?? 0)
      : [...(now?.months.entries() ?? [])]
          .filter(([k]) => k.endsWith(`-${mm}`))
          .reduce((s, [, v]) => s + v, 0)
    return [String(i + 1), n]
  })
  const busiest = monthRows.reduce((a, b) => (b[1] > a[1] ? b : a), monthRows[0] ?? ['1', 0])

  // "มาแรง" compared against what? A chosen year is compared with the year before it; with no
  // year chosen it is the last three complete years against the three before them.
  const moves = year
    ? yearOverYear(trends.topics, trends.years, year)
    : movers(trends.topics, trends.years, complete)
  const movesAgainst = year
    ? prevYear
      ? `ปี ${beYear(year)} เทียบปี ${beYear(prevYear)}`
      : 'ไม่มีปีก่อนหน้าให้เทียบ'
    : `${beYear(window[0] ?? '')}–${beYear(window[window.length - 1] ?? '')} เทียบ ${beYear(prior[0] ?? '')}–${beYear(prior[prior.length - 1] ?? '')}`

  // A focused year with no year before it has nothing to compare against, and saying "ทั้งคลัง"
  // there would describe the wrong population entirely.
  const baseline = (all: string): string | undefined =>
    year ? (prevYear ? undefined : `ปี ${beYear(year)} เป็นปีแรกของคลัง ไม่มีปีก่อนหน้าให้เทียบ`) : all

  // สำรวจ gets the whole state, not just the one thing clicked: the point of narrowing here is
  // to arrive there with the same population and finally see the documents in it.
  const link = (patch: Record<string, string> = {}) => {
    const q: Record<string, string> = year ? { scope: 'year', year } : { scope: 'all' }
    for (const axis of Object.keys(AS_PARAM) as (keyof Picks)[]) {
      const v = pick[axis]
      if (v) q[AS_PARAM[axis]] = v
    }
    return href.explore({ ...q, ...patch })
  }

  const nameOfPick: Record<keyof Picks, (k: string) => string> = {
    topic: (k) => topicName(st.data.tax, k),
    action: (k) => actionName(st.data.tax, k),
    gov: (k) => govName(st.data.tax, k),
    prov: (k) => k,
    dtype: (k) => k,
    agency: (k) => agencyName.get(k) ?? k,
  }
  const active = (Object.keys(AS_PARAM) as (keyof Picks)[])
    .filter((a) => pick[a])
    .map((a) => ({ axis: a, key: pick[a] as string }))

  return (
    <>
      <Kicker>
        สถิติ · {meta.docs.toLocaleString('th-TH')} ฉบับ · พ.ศ. {beYear(trends.years[0] ?? '')}–
        {beYear(trends.years[trends.years.length - 1] ?? '')}
      </Kicker>
      <h1 style="margin:6px 0 6px">ราชกิจจานุเบกษาในตัวเลข</h1>
      <p class="muted" style="margin-bottom:6px;max-width:78ch">
        เลือกปีจากแท่งด้านล่าง แล้วทั้งหน้านี้จะตอบเฉพาะปีนั้น — ทุกตัวเลขที่เทียบ จะบอกด้วยว่าเทียบกับอะไร ·
        หมวด สิ่งที่ทำ และระดับผู้ออก นับเฉพาะที่ยืนยันแล้ว ส่วนจังหวัด หน่วยงาน และประเภทเอกสาร
        อ่านจากตัวเอกสารโดยตรง
      </p>
      <p class="muted" style="font-size:.85rem;margin-bottom:18px;max-width:78ch">
        <b>อ่านตัวเลขให้ถูก</b> จำนวนฉบับต่อปีต่างกันมากตามจริง ({beYear(allYears[0] ?? '')}:{' '}
        {(byYear?.[allYears[0] ?? ''] ?? 0).toLocaleString('th-TH')} ฉบับ ·{' '}
        {beYear(allYears[allYears.length - 2] ?? '')}:{' '}
        {(byYear?.[allYears[allYears.length - 2] ?? ''] ?? 0).toLocaleString('th-TH')} ฉบับ)
        การเทียบสัดส่วนจึงบอกเรื่องได้ดีกว่าการเทียบจำนวน · ปี {beYear(partialYear)} ยังไม่จบปี
        จึงไม่ถูกนำไปคิดแนวโน้ม
      </p>

      <div class="yearpick">
        <div class="yearpick-head">
          <h2 class="sec" style="margin:0">
            ฉบับต่อปี
          </h2>
          <p class="muted" style="margin:0;font-size:.85rem">
            {year ? (
              <>
                กำลังดู <b>ปี {beYear(year)}</b>
                {prevYear && <> · เทียบกับปี {beYear(prevYear)}</>}{' '}
                <button
                  class="chip"
                  onClick={() => {
                    setYear(null)
                  }}
                >
                  ล้างการเลือก ({beYear(year)}) ×
                </button>
              </>
            ) : (
              'คลิกแท่งหรือกดปีด้านล่างเพื่อให้ทั้งหน้าตอบเฉพาะปีนั้น'
            )}
          </p>
        </div>
        <div
          ref={yearsRef}
          style="height:230px"
          data-testid="chart-years"
          role="img"
          aria-label={`ฉบับต่อปี พ.ศ. ${beYear(trends.years[0] ?? '')} ถึง ${beYear(
            trends.years[trends.years.length - 1] ?? '',
          )}`}
        />
        {/* the chart is mouse-only; this is the same choice, reachable by keyboard */}
        <p class="chips" style="margin-top:10px" aria-label="เลือกปี">
          <button
            class="chip"
            aria-pressed={year === null}
            onClick={() => {
              setYear(null)
            }}
          >
            ทุกปี
          </button>
          {allYears.map((y) => (
            <button
              key={y}
              class="chip"
              aria-pressed={year === y}
              onClick={() => {
                setYear((cur) => (cur === y ? null : y))
              }}
            >
              {beYear(y)}
            </button>
          ))}
        </p>
      </div>

      {focusIsPartial && (
        <p class="emptyhint" style="margin:14px 0">
          ปี {beYear(partialYear)} มีข้อมูลถึง {meta.latest_date ? thaiDate(meta.latest_date) : '—'} เท่านั้น
          — ตัวเลขด้านล่างเป็นของช่วงนั้น ไม่ใช่ทั้งปี
        </p>
      )}

      <div class="grid metrics" style="margin:18px 0 26px">
        <Metric
          label={`ฉบับ · ${focusLabel}`}
          value={total}
          hint={prevYear ? against(total, prevTotal, `ปี ${beYear(prevYear)}`) : baseline('ทั้งคลัง')}
        />
        <Metric
          label={`กฎ ระเบียบ ข้อบังคับ · ${focusLabel}`}
          value={ruleNow}
          hint={
            prevYear
              ? against(ruleNow, rulePrev, `ปี ${beYear(prevYear)}`)
              : baseline('ออกกฎ แก้ไข หรือยกเลิก · ทั้งคลัง')
          }
        />
        <Metric
          label={`หน่วยงานที่ออกเอกสาร · ${focusLabel}`}
          value={agenciesNow}
          hint={
            prevYear ? against(agenciesNow, agenciesPrev, `ปี ${beYear(prevYear)}`) : baseline('ทั้งคลัง')
          }
        />
        <Metric
          label="ยืนยันหมวดได้"
          value={percent(meta.corroborated_any, meta.docs)}
          hint={`${meta.corroborated_any.toLocaleString('th-TH')} ฉบับมีหลักฐานรองรับ · ทั้งคลัง`}
        />
      </div>

      <div class="two">
        <section>
          <Fold id="months" title={`ช่วงเวลาในรอบปี · ${focusLabel}`}>
            <p class="muted" style="font-size:.85rem;margin-bottom:10px">
              {year
                ? `เดือนไหนของปี ${beYear(year)} ที่งานหนาแน่นที่สุด`
                : 'ทุกปีซ้อนกัน เห็นจังหวะของงานราชการ — สิ้นปีงบประมาณและปลายปีปฏิทินหนาแน่นที่สุด'}{' '}
              · เดือนที่มากที่สุดคือ <b>{TH_MONTH_SHORT[Number(busiest[0]) - 1]}</b> (
              {busiest[1].toLocaleString('th-TH')} ฉบับ)
              {active.length > 0 && <> · ตามตัวกรองที่เลือกไว้</>}
            </p>
            <Bars rows={monthRows} nameOf={(k) => TH_MONTH_SHORT[Number(k) - 1] ?? k} />
          </Fold>

          <Fold id="bankruptcy" title="คดีล้มละลายตามขั้นตอน">
            <StageBars bk={bk} />
          </Fold>
        </section>

        <section>
          <Fold id="rising" title="หมวดที่มาแรง" aside={movesAgainst}>
            <MoveTable moves={moves.filter((m) => m.change > 0).slice(0, 6)} tax={st.data.tax} />
          </Fold>
          <Fold id="falling" title="หมวดที่เงียบลง" aside={movesAgainst}>
            <MoveTable moves={moves.filter((m) => m.change < 0).slice(0, 6)} tax={st.data.tax} />
          </Fold>
        </section>
      </div>

      <h2 class="sec" style="margin:30px 0 4px">
        {focusLabel} แยกตามด้านต่าง ๆ
      </h2>
      <p class="muted" style="font-size:.85rem;margin-bottom:10px">
        คลิกแถบใดก็ได้เพื่อ<b>กรองทั้งหน้านี้</b> — ตัวเลขทุกช่องจะขยับตามทันที เลือกได้หลายด้านพร้อมกัน
        กดซ้ำเพื่อเอาออก · พอได้ชุดที่ต้องการแล้ว ค่อยกดไปดูฉบับจริงในหน้าสำรวจ
      </p>

      <div class="pickbar" data-testid="pickbar">
        <div class="pickchips">
          <span class="muted">กำลังดู</span>
          <span class="pickchip fixed">{focusLabel}</span>
          {active.map(({ axis, key }) => (
            <button
              key={`${axis}:${key}`}
              type="button"
              class="pickchip"
              onClick={() => {
                toggle(axis, key)
              }}
            >
              {nameOfPick[axis](key)} <span aria-hidden="true">×</span>
              <span class="sr-only">เอาตัวกรองนี้ออก</span>
            </button>
          ))}
          {active.length === 0 && <span class="muted">ยังไม่ได้กรองด้านใด</span>}
        </div>
        <div class="pickgo">
          <b>{(now?.total ?? 0).toLocaleString('th-TH')}</b> ฉบับ
          {active.length > 0 && (
            <button
              type="button"
              class="chip"
              onClick={() => {
                setPick({})
              }}
            >
              ล้างตัวกรอง ({active.length}) ×
            </button>
          )}
          <a class="btn primary" href={link()}>
            ดูฉบับจริงในหน้าสำรวจ →
          </a>
        </div>
      </div>

      {now && now.total === 0 && (
        <p class="emptyhint" style="margin:12px 0">
          ไม่มีฉบับไหนตรงทุกเงื่อนไขที่เลือกพร้อมกัน — เอาตัวกรองออกสักอย่างแล้วลองใหม่
        </p>
      )}

      <div class="statgrid">
        <Panel id="topic" title="หมวด" total={now?.topicTotal}>
          <Bars
            rows={topRows(now?.topics, (s) => !st.data.tax.topics[s]?.parent)}
            nameOf={(k) => topicName(st.data.tax, k)}
            onPick={(k) => {
              toggle('topic', k)
            }}
            pickedOf={(k) => pick.topic === k}
          />
        </Panel>
        <Panel id="action" title="สิ่งที่เอกสารทำ">
          <Bars
            rows={topRows(now?.actions)}
            nameOf={(k) => actionName(st.data.tax, k)}
            onPick={(k) => {
              toggle('action', k)
            }}
            pickedOf={(k) => pick.action === k}
          />
        </Panel>
        <Panel id="gov" title="ระดับผู้ออก">
          <Bars
            rows={topRows(now?.govs)}
            nameOf={(k) => govName(st.data.tax, k)}
            onPick={(k) => {
              toggle('gov', k)
            }}
            pickedOf={(k) => pick.gov === k}
          />
        </Panel>
        <Panel id="dtype" title="ประเภทเอกสาร">
          <Bars
            rows={topRows(now?.dtypes)}
            nameOf={(k) => k}
            onPick={(k) => {
              toggle('dtype', k)
            }}
            pickedOf={(k) => pick.dtype === k}
          />
        </Panel>
        <Panel id="prov" title="จังหวัด" note="เฉพาะฉบับที่ระบุจังหวัดได้จากชื่อหน่วยงาน">
          <Bars
            rows={topRows(now?.provinces)}
            nameOf={(k) => k}
            onPick={(k) => {
              toggle('prov', k)
            }}
            pickedOf={(k) => pick.prov === k}
          />
        </Panel>
        <Panel id="agency" title="หน่วยงานที่ออกมากที่สุด">
          <Bars
            rows={topRows(now?.agencies)}
            nameOf={(k) => agencyName.get(k) ?? k}
            onPick={(k) => {
              toggle('agency', k)
            }}
            pickedOf={(k) => pick.agency === k}
          />
        </Panel>
      </div>

      <p class="muted" style="margin-top:22px;font-size:.9rem">
        อยากดูรายจังหวัดบนแผนที่? <a href={href.provinces()}>ท้องถิ่น →</a> · อยากดูว่าหมวดไหนมาคู่กัน?{' '}
        <a href={href.graph()}>ความสัมพันธ์ของหมวด →</a> · อยากไล่ดูฉบับจริง?{' '}
        <a href={link({})}>สำรวจ{year ? ` ปี ${beYear(year)}` : ''} →</a>
      </p>
      {meta.latest_date && (
        <p class="muted" style="font-size:.8rem">
          ข้อมูลถึงวันที่ {thaiDate(meta.latest_date)}
        </p>
      )}
    </>
  )
}

/** "+12% จากปี 2567 (38,864)" — a change is only a fact when its baseline is on screen. */
function against(now: number, then: number, label: string): string {
  if (!then) return `${label}: ไม่มีข้อมูลให้เทียบ`
  const d = Math.round((100 * (now - then)) / then)
  const dir = d > 0 ? 'มากขึ้น' : d < 0 ? 'น้อยลง' : 'เท่ากับ'
  return `${dir} ${Math.abs(d)}% จาก${label} (${then.toLocaleString('th-TH')})`
}

/** The biggest few of a counted dimension, as Bars wants them. */
function topRows(counts: Map<string, number> | undefined, keep?: (k: string) => boolean): [string, number][] {
  return [...(counts ?? new Map<string, number>()).entries()]
    .filter(([k, n]) => n > 0 && (!keep || keep(k)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
}

/** Open unless this reader folded it away last time, and remember either way. The page is long
 *  on a phone, and the sections a given reader never looks at are not the same ones for everyone. */
function useFold(id: string) {
  const [open, setOpen] = useState(() => !foldedSet().has(id))
  const onToggle = (e: Event) => {
    const next = (e.currentTarget as HTMLDetailsElement).open
    setOpen(next)
    remember(id, next)
  }
  return { open, onToggle }
}

function Panel({
  id,
  title,
  total,
  note,
  children,
}: {
  id: string
  title: string
  total?: number
  note?: string
  children: preact.ComponentChildren
}) {
  const fold = useFold(`panel:${id}`)
  return (
    <details class="statpanel" open={fold.open} onToggle={fold.onToggle}>
      <summary>
        <h3>
          {title}
          {total !== undefined && total > 0 && (
            <span class="muted"> · {total.toLocaleString('th-TH')} ฉบับ</span>
          )}
        </h3>
      </summary>
      {note && (
        <p class="muted" style="font-size:.8rem;margin:-4px 0 8px">
          {note}
        </p>
      )}
      {children}
    </details>
  )
}

/** A foldable block with an h2 — the bigger sections above the breakdown grid. */
function Fold({
  id,
  title,
  aside,
  children,
}: {
  id: string
  title: string
  aside?: preact.ComponentChildren
  children: preact.ComponentChildren
}) {
  const fold = useFold(`fold:${id}`)
  return (
    <details class="fold" open={fold.open} onToggle={fold.onToggle}>
      <summary>
        <h2 class="sec">
          {title}
          {aside && (
            <span class="muted" style="font-weight:400;font-size:.85rem">
              {' '}
              · {aside}
            </span>
          )}
        </h2>
      </summary>
      {children}
    </details>
  )
}

function MoveTable({ moves, tax }: { moves: Move[]; tax: Taxonomy }) {
  const href = useHref()
  if (!moves.length) return <p class="muted">ยังเทียบไม่ได้ — ต้องมีปีก่อนหน้าที่จบแล้วอย่างน้อยหนึ่งปี</p>
  const widest = Math.max(...moves.map((m) => Math.abs(m.change)))
  return (
    <table class="movers">
      <tbody>
        {moves.map((m) => (
          <tr key={m.key}>
            <td>
              <a href={href.topic(m.key)}>{topicName(tax, m.key)}</a>
            </td>
            <td class="num muted">
              {m.before.toLocaleString('th-TH')} → {m.after.toLocaleString('th-TH')}
            </td>
            <td class="num">
              <span class={m.change > 0 ? 'up' : 'down'}>
                {m.ratio === null
                  ? m.change > 0
                    ? 'เกือบไม่เคยมี'
                    : 'แทบหมดไป'
                  : `${m.change > 0 ? '+' : '−'}${Math.abs(Math.round(m.ratio * 100))}%`}
              </span>
            </td>
            <td class="trend">
              <i
                class={m.change > 0 ? 'up' : 'down'}
                style={`width:${Math.max(4, Math.round((100 * Math.abs(m.change)) / widest))}%`}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StageBars({ bk }: { bk: { by_court_stage: { court: string; stage: string; n: number }[] } }) {
  const href = useHref()
  const byStage = new Map<string, number>()
  for (const r of bk.by_court_stage) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + r.n)
  const rows = [...byStage.entries()].sort((a, b) => b[1] - a[1])
  const total = rows.reduce((s, [, n]) => s + n, 0)
  if (!rows.length) return <p class="muted">ยังไม่มีคดีที่สกัดขั้นตอนได้</p>
  return (
    <>
      <Bars
        rows={rows}
        total={total}
        nameOf={(k) => STAGE[k] ?? k}
        hrefOf={() => href.explore({ topic: 'bankruptcy', scope: 'all' })}
      />
      <p class="muted" style="font-size:.85rem;margin-top:10px">
        <b>ทั้งคลัง ไม่แยกตามปี</b> — ขั้นตอนสกัดจากตัวประกาศ ไม่ได้อยู่ในดัชนีรายปี ·{' '}
        {bk.by_court_stage.length.toLocaleString('th-TH')} คู่ของศาลกับขั้นตอน ·
        ประกาศหนึ่งฉบับคือหนึ่งเหตุการณ์ ไม่ใช่หนึ่งคดี
      </p>
    </>
  )
}
