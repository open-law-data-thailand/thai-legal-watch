/** The numbers a reader of the gazette actually asks for: is this year busier, what subject is
 *  growing, when in the year does the work land, and who is issuing the rules. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { useLoad } from '../data/context'
import type { Taxonomy, Trends } from '../data/types'
import { completeYears, monthProfile, movers, sumAt, yearToDate, type Move } from '../lib/trends'
import { beYear, percent, thaiDate } from '../lib/thai'
import { useHref } from '../data/context'
import { Bars, ErrorBox, Kicker, Loading, Metric, actionName, govName, topicName } from '../ui/bits'
import { STAGE } from './Doc'

const RULE_ACTIONS = ['rulemaking', 'amendment', 'repeal']
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

export function Dashboard() {
  const href = useHref()
  const st = useLoad(async (c) => {
    const [years, tax, bk, trends, meta] = await Promise.all([
      c.years(),
      c.taxonomy(),
      c.get_bankruptcy(),
      c.trends(),
      c.meta(),
    ])
    return { years, tax, bk, trends, meta }
  }, [])
  const [year, setYear] = useState<string | null>(null)
  const yearsRef = useRef<HTMLDivElement>(null)

  // The chart is created once and then only re-styled. Re-running echarts.init on the same
  // element — which is what happens if the effect depends on `year` — leaves the previous
  // instance undisposed and its listeners attached, and the second instance renders unreliably.
  const chartRef = useRef<{
    setOption: (o: unknown) => void
    resize: () => void
    dispose: () => void
  } | null>(null)
  const ok = st.state === 'ok'
  const byYear = ok ? st.data.years.by_year : null
  useEffect(() => {
    if (!byYear) return
    let disposed = false
    const el = yearsRef.current
    void import('echarts').then((echarts) => {
      if (disposed || !el) return
      const ys = Object.keys(byYear).sort()
      const chart = echarts.init(el, undefined, { renderer: 'svg' })
      chartRef.current = chart
      chart.setOption({
        backgroundColor: 'transparent',
        textStyle: { fontFamily: 'Anuphan, sans-serif' },
        grid: { left: 58, right: 12, top: 14, bottom: 30 },
        xAxis: { type: 'category', data: ys.map((k) => beYear(k)) },
        yAxis: { type: 'value' },
        tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v.toLocaleString('th-TH')} ฉบับ` },
        series: [{ type: 'bar', data: ys.map((k) => byYear[k]), animationDelay: (i: number) => i * 25 }],
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

  // highlight the selected year without rebuilding the chart
  useEffect(() => {
    if (!byYear) return
    const ys = Object.keys(byYear).sort()
    chartRef.current?.setOption({
      series: [
        {
          data: ys.map((k) => ({
            value: byYear[k],
            itemStyle: { color: k === year ? '#c9502a' : '#6b4fd8', borderRadius: [3, 3, 0, 0] },
          })),
        },
      ],
    })
  }, [year, byYear])

  if (st.state === 'loading') return <Loading what="แดชบอร์ด" />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  const { years, tax, bk, trends, meta } = st.data

  const complete = completeYears(trends.years, meta.latest_date)
  const lastComplete = complete[complete.length - 1] ?? trends.years[trends.years.length - 1] ?? ''
  const focus = year ?? lastComplete
  const ytd = yearToDate(years, meta.latest_date)
  const topicMoves = movers(trends.topics, trends.years, complete)
  const rising = topicMoves.filter((m) => m.change > 0).slice(0, 6)
  const falling = topicMoves.filter((m) => m.change < 0).slice(0, 6)
  const months = monthProfile(years)
  const busiest = months.reduce((a, b) => (b.n > a.n ? b : a), months[0] ?? { month: 1, n: 0 })
  const rules = sumAt(trends, 'actions', RULE_ACTIONS, focus)
  const window = complete.slice(-3)

  return (
    <>
      <Kicker>
        แดชบอร์ด · {meta.docs.toLocaleString('th-TH')} ฉบับ · พ.ศ. {beYear(trends.years[0] ?? '')}–
        {beYear(trends.years[trends.years.length - 1] ?? '')}
      </Kicker>
      <h1 style="margin:6px 0 6px">ราชกิจจานุเบกษาในตัวเลข</h1>
      <p class="muted" style="margin-bottom:18px">
        ตัวเลขทั้งหมดนับเฉพาะหมวดที่ยืนยันแล้ว · ปี {beYear(trends.years[trends.years.length - 1] ?? '')}{' '}
        ยังไม่จบปี จึงไม่ถูกนำไปเทียบแนวโน้ม
      </p>

      <div class="grid metrics" style="margin-bottom:26px">
        {ytd && (
          <Metric
            label={`ปี ${beYear(ytd.year)} ถึงวันนี้`}
            value={ytd.now}
            hint={
              ytd.then
                ? `${pct(ytd.now, ytd.then)} เทียบ ${ytd.months} เดือนแรกของปี ${beYear(String(Number(ytd.year) - 1))}`
                : undefined
            }
          />
        )}
        <Metric
          label={`กฎ ระเบียบ ข้อบังคับ ปี ${beYear(focus)}`}
          value={rules}
          hint="ออกกฎ แก้ไข หรือยกเลิก"
        />
        <Metric
          label="ยืนยันหมวดได้"
          value={percent(meta.corroborated_any, meta.docs)}
          hint={`${meta.corroborated_any.toLocaleString('th-TH')} ฉบับมีหลักฐานรองรับ`}
        />
        <Metric
          label="เดือนที่ออกมากที่สุด"
          value={TH_MONTH_SHORT[busiest.month - 1] ?? '—'}
          hint={`${busiest.n.toLocaleString('th-TH')} ฉบับ รวมทุกปี`}
        />
      </div>

      <div class="two">
        <section>
          <h2 class="sec">ฉบับต่อปี</h2>
          <p class="muted" style="font-size:.85rem;margin-bottom:8px">
            คลิกแท่งเพื่อเจาะดูปีนั้นในตารางด้านขวา
            {year && (
              <>
                {' · '}
                <button
                  class="chip"
                  onClick={() => {
                    setYear(null)
                  }}
                >
                  ล้างการเลือก ({beYear(year)}) ×
                </button>
              </>
            )}
          </p>
          <div
            ref={yearsRef}
            style="height:260px"
            data-testid="chart-years"
            role="img"
            aria-label={`ฉบับต่อปี พ.ศ. ${beYear(trends.years[0] ?? '')} ถึง ${beYear(
              trends.years[trends.years.length - 1] ?? '',
            )}`}
          />
          {/* the chart is mouse-only; this is the same choice, reachable by keyboard */}
          <p class="chips" style="margin-top:10px" aria-label="เลือกปี">
            {[...Object.keys(years.by_year)].sort().map((y) => (
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

          <h2 class="sec" style="margin-top:28px">
            ช่วงเวลาในรอบปี
          </h2>
          <p class="muted" style="font-size:.85rem;margin-bottom:10px">
            รวมทุกปีเข้าด้วยกัน เห็นจังหวะของงานราชการ — สิ้นปีงบประมาณและปลายปีปฏิทินหนาแน่นที่สุด
          </p>
          <Bars
            rows={months.map((m) => [String(m.month), m.n] as [string, number])}
            nameOf={(k) => TH_MONTH_SHORT[Number(k) - 1] ?? k}
          />

          <h2 class="sec" style="margin-top:28px">
            คดีล้มละลายตามขั้นตอน
          </h2>
          <StageBars bk={bk} />
        </section>

        <section>
          <h2 class="sec">
            หมวดที่มาแรง
            <span class="muted" style="font-weight:400;font-size:.85rem">
              {' '}
              · {beYear(window[0] ?? '')}–{beYear(window[window.length - 1] ?? '')} เทียบสามปีก่อนหน้า
              เรียงตามจำนวนฉบับที่เปลี่ยนไป
            </span>
          </h2>
          <MoveTable moves={rising} tax={tax} />
          <h2 class="sec" style="margin-top:26px">
            หมวดที่เงียบลง
          </h2>
          <MoveTable moves={falling} tax={tax} />

          <h2 class="sec" style="margin-top:26px">
            หมวดหลักของปี {beYear(focus)}
          </h2>
          <TopicsOfYear trends={trends} tax={tax} year={focus} />

          <h2 class="sec" style="margin-top:26px">
            สิ่งที่เอกสารทำ · ปี {beYear(focus)}
          </h2>
          <Series trends={trends} group="actions" tax={tax} year={focus} nameOf={actionName} />

          <h2 class="sec" style="margin-top:26px">
            ระดับผู้ออก · ปี {beYear(focus)}
          </h2>
          <Series trends={trends} group="govlevels" tax={tax} year={focus} nameOf={govName} />

          <p class="muted" style="margin-top:22px;font-size:.9rem">
            อยากดูรายจังหวัด? <a href={href.provinces()}>ท้องถิ่นฉัน →</a> · อยากดูว่าหมวดไหนมาคู่กัน?{' '}
            <a href={href.graph()}>ความสัมพันธ์ของหมวด →</a>
          </p>
          {meta.latest_date && (
            <p class="muted" style="font-size:.8rem">
              ข้อมูลถึงวันที่ {thaiDate(meta.latest_date)}
            </p>
          )}
        </section>
      </div>
    </>
  )
}

const pct = (now: number, then: number) => {
  const d = Math.round((100 * (now - then)) / then)
  return d >= 0 ? `มากขึ้น ${d}%` : `น้อยลง ${Math.abs(d)}%`
}

function MoveTable({ moves, tax }: { moves: Move[]; tax: Taxonomy }) {
  const href = useHref()
  if (!moves.length) return <p class="muted">ยังเทียบไม่ได้ — ต้องมีอย่างน้อยหกปีที่จบแล้ว</p>
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

function TopicsOfYear({ trends, tax, year }: { trends: Trends; tax: Taxonomy; year: string }) {
  const href = useHref()
  const i = trends.years.indexOf(year)
  const rows = Object.entries(trends.topics)
    .filter(([slug]) => !tax.topics[slug]?.parent)
    .map(([slug, xs]) => [slug, xs[i] ?? 0] as [string, number])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  if (!rows.length) return <p class="muted">ยังไม่มีข้อมูลของปีนี้</p>
  return <Bars rows={rows} nameOf={(k) => topicName(tax, k)} hrefOf={(k) => href.topic(k)} />
}

function Series({
  trends,
  group,
  tax,
  year,
  nameOf,
}: {
  trends: Trends
  group: 'actions' | 'govlevels'
  tax: Taxonomy
  year: string
  nameOf: (t: Taxonomy | undefined, slug: string | null) => string
}) {
  const i = trends.years.indexOf(year)
  const rows = Object.entries(trends[group])
    .map(([slug, xs]) => [slug, xs[i] ?? 0] as [string, number])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  const total = rows.reduce((s, [, n]) => s + n, 0)
  if (!rows.length) return <p class="muted">ยังไม่มีข้อมูลของปีนี้</p>
  return <Bars rows={rows} total={total} nameOf={(k) => nameOf(tax, k)} />
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
        นับจากข้อมูลที่สกัดได้ในตัวประกาศ {bk.by_court_stage.length.toLocaleString('th-TH')}{' '}
        คู่ของศาลกับขั้นตอน · ประกาศหนึ่งฉบับคือหนึ่งเหตุการณ์ ไม่ใช่หนึ่งคดี
      </p>
    </>
  )
}
