import { useEffect, useRef, useState } from 'preact/hooks'
import { useLoad } from '../data/context'
import { beYear } from '../lib/thai'
import { href } from '../router'
import { ErrorBox, Kicker, Loading, topicName } from '../ui/bits'
import { STAGE } from './Doc'

const TOP = 8

export function Dashboard() {
  const st = useLoad(async (c) => {
    const [years, tax, bk, provinces] = await Promise.all([
      c.years(),
      c.taxonomy(),
      c.get_bankruptcy(),
      c.provinces(),
    ])
    const top = Object.entries(tax.topics)
      .filter(([, t]) => !t.parent && t.n)
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, TOP)
      .map(([s]) => s)
    const pages = await Promise.all(top.map((s) => c.topic(s)))
    return {
      years,
      tax,
      bk,
      provinces,
      top,
      byYear: Object.fromEntries(pages.map((p) => [p.slug, p.by_year])),
    }
  }, [])
  const [year, setYear] = useState<string | null>(null)
  const yearsRef = useRef<HTMLDivElement>(null)
  const topicsRef = useRef<HTMLDivElement>(null)
  const funnelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (st.state !== 'ok') return
    let disposed = false
    const { years, tax, bk, top, byYear } = st.data
    void import('echarts').then((echarts) => {
      if (disposed || !yearsRef.current || !funnelRef.current || !topicsRef.current) return
      const font = { fontFamily: 'Anuphan, sans-serif' }
      const ys = Object.keys(years.by_year).sort()
      const y = echarts.init(yearsRef.current, undefined, { renderer: 'svg' })
      y.setOption({
        backgroundColor: 'transparent',
        textStyle: font,
        grid: { left: 56, right: 12, top: 12, bottom: 28 },
        xAxis: { type: 'category', data: ys.map((k) => beYear(k)) },
        yAxis: { type: 'value' },
        tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v.toLocaleString('th-TH')} ฉบับ` },
        series: [
          {
            type: 'bar',
            data: ys.map((k) => ({
              value: years.by_year[k],
              itemStyle: { color: k === year ? '#d85a30' : '#6b4fd8', borderRadius: [3, 3, 0, 0] },
            })),
            animationDelay: (i: number) => i * 30,
          },
        ],
      })
      y.on('click', (p: { dataIndex?: number }) => {
        const k = ys[p.dataIndex ?? -1]
        if (k) setYear((cur) => (cur === k ? null : k))
      })
      const t = echarts.init(topicsRef.current, undefined, { renderer: 'svg' })
      t.setOption({
        backgroundColor: 'transparent',
        textStyle: font,
        grid: { left: 56, right: 12, top: 40, bottom: 28 },
        legend: { top: 0, type: 'scroll', textStyle: font },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ys.map((k) => beYear(k)) },
        yAxis: { type: 'value' },
        series: top.map((s) => ({
          name: topicName(tax, s),
          type: 'line',
          stack: 'all',
          areaStyle: { opacity: 0.35 },
          smooth: true,
          showSymbol: false,
          emphasis: { focus: 'series' },
          data: ys.map((k) => byYear[s]?.[k] ?? 0),
        })),
      })
      t.on('click', (p: { seriesIndex?: number }) => {
        const s = top[p.seriesIndex ?? -1]
        if (s) location.hash = href.topic(s)
      })
      const f = echarts.init(funnelRef.current, undefined, { renderer: 'svg' })
      const byStage = new Map<string, number>()
      for (const r of bk.by_court_stage) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + r.n)
      f.setOption({
        backgroundColor: 'transparent',
        textStyle: font,
        tooltip: { valueFormatter: (v: number) => `${v.toLocaleString('th-TH')} ฉบับ` },
        series: [
          {
            type: 'funnel',
            sort: 'descending',
            gap: 3,
            left: '2%',
            width: '96%',
            minSize: '12%',
            label: {
              position: 'inside',
              color: '#fff',
              fontSize: 12,
              formatter: (p: { name: string; value: number }) =>
                `${STAGE[p.name] ?? p.name}  ${p.value.toLocaleString('th-TH')}`,
              ...font,
            },
            data: [...byStage.entries()].map(([name, value]) => ({ name, value })),
          },
        ],
      })
      f.on('click', () => {
        location.hash = href.explore({ topic: 'bankruptcy', scope: 'all' })
      })
      const onResize = () => {
        y.resize()
        t.resize()
        f.resize()
      }
      addEventListener('resize', onResize)
      return () => {
        removeEventListener('resize', onResize)
        y.dispose()
        t.dispose()
        f.dispose()
      }
    })
    return () => {
      disposed = true
    }
  }, [st, year])
  if (st.state === 'loading') return <Loading what="แดชบอร์ด" />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  const { years, tax, bk, provinces, top, byYear } = st.data
  const totalAll = Object.values(years.by_year).reduce((s, n) => s + n, 0)
  const topicRows = year
    ? top.map((s) => [s, byYear[s]?.[year] ?? 0] as [string, number]).sort((a, b) => b[1] - a[1])
    : top.map((s) => [s, tax.topics[s]?.n ?? 0] as [string, number])
  return (
    <>
      <Kicker>
        แดชบอร์ด · {totalAll.toLocaleString('th-TH')} ฉบับ{year ? ` · เลือกปี ${beYear(year)}` : ''}
      </Kicker>
      <h1 style="margin:6px 0 6px">ราชกิจจานุเบกษาในตัวเลข</h1>
      <p class="muted" style="margin:0 0 20px">
        คลิกแท่งปีเพื่อดูเฉพาะปีนั้นในตารางด้านขวา · คลิกชื่อหมวดในกราฟเพื่อเปิดหน้าหมวด ·
        คลิกแถบคดีล้มละลายเพื่อไปสำรวจต่อ
      </p>
      <div class="two">
        <section>
          <h2 style="font-size:1.05rem;margin-bottom:8px">
            ฉบับต่อปี{' '}
            {year && (
              <button
                style="font-size:.8rem;padding:2px 10px;margin-left:8px"
                onClick={() => {
                  setYear(null)
                }}
              >
                ล้างการเลือก
              </button>
            )}
          </h2>
          <div ref={yearsRef} style="height:240px" data-testid="chart-years" />
          <h2 style="font-size:1.05rem;margin:22px 0 8px">หมวดหลัก {TOP} หมวดตามปี</h2>
          <div ref={topicsRef} style="height:300px" data-testid="chart-topics" />
        </section>
        <section>
          <h2 style="font-size:1.05rem;margin-bottom:8px">
            หมวดหลัก (ยืนยันแล้ว){year ? ` · ${beYear(year)}` : ''}
          </h2>
          <table data-testid="topic-table">
            <thead>
              <tr>
                <th>หมวด</th>
                <th style="text-align:right">ฉบับ</th>
                <th style="text-align:right">สำรวจ</th>
              </tr>
            </thead>
            <tbody>
              {topicRows.map(([s, n]) => (
                <tr key={s}>
                  <td>
                    <a href={href.topic(s)}>{topicName(tax, s)}</a>
                  </td>
                  <td style="text-align:right">{n.toLocaleString('th-TH')}</td>
                  <td style="text-align:right">
                    <a
                      class="muted"
                      href={
                        year
                          ? href.explore({ topic: s, scope: 'year', year })
                          : href.explore({ topic: s, scope: 'all' })
                      }
                    >
                      →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 style="font-size:1.05rem;margin:22px 0 8px">คดีล้มละลายตามขั้น</h2>
          <div ref={funnelRef} style="height:260px" data-testid="chart-funnel" />
          <p class="muted" style="font-size:.85rem">
            {bk.by_court_stage.length} คู่ของศาลกับขั้นตอนคดี จากข้อมูลที่สกัดได้ในตัวประกาศ
          </p>
          <h2 style="font-size:1.05rem;margin:22px 0 8px">จังหวัดที่มีเอกสารมากที่สุด</h2>
          <table>
            <tbody>
              {provinces.slice(0, 12).map((p) => (
                <tr key={p.name}>
                  <td>
                    <a href={href.province(p.file)}>{p.name}</a>
                  </td>
                  <td style="text-align:right">{p.n.toLocaleString('th-TH')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  )
}
