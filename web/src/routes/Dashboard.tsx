import { useEffect, useRef } from 'preact/hooks'
import { useLoad } from '../data/context'
import { beYear } from '../lib/thai'
import { ErrorBox, Kicker, Loading, topicName } from '../ui/bits'

export function Dashboard() {
  const st = useLoad(async (c) => {
    const [years, tax, bk, provinces] = await Promise.all([
      c.years(),
      c.taxonomy(),
      c.get_bankruptcy(),
      c.provinces(),
    ])
    return { years, tax, bk, provinces }
  }, [])
  const yearsRef = useRef<HTMLDivElement>(null)
  const funnelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (st.state !== 'ok') return
    let disposed = false
    void import('echarts').then((echarts) => {
      if (disposed || !yearsRef.current || !funnelRef.current) return
      const dark = matchMedia('(prefers-color-scheme: dark)').matches
      const y = echarts.init(yearsRef.current, dark ? 'dark' : undefined, { renderer: 'svg' })
      const ys = Object.entries(st.data.years.by_year)
      y.setOption({
        backgroundColor: 'transparent',
        grid: { left: 48, right: 12, top: 12, bottom: 28 },
        xAxis: { type: 'category', data: ys.map(([k]) => beYear(k)) },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: ys.map(([, n]) => n), itemStyle: { color: '#6b4fd8' } }],
        tooltip: { trigger: 'axis' },
      })
      const f = echarts.init(funnelRef.current, dark ? 'dark' : undefined, { renderer: 'svg' })
      const byStage = new Map<string, number>()
      for (const r of st.data.bk.by_court_stage) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + r.n)
      f.setOption({
        backgroundColor: 'transparent',
        series: [
          {
            type: 'funnel',
            sort: 'descending',
            gap: 2,
            label: { formatter: '{b}: {c}' },
            data: [...byStage.entries()].map(([name, value]) => ({ name, value })),
          },
        ],
        tooltip: {},
      })
      const onResize = () => {
        y.resize()
        f.resize()
      }
      addEventListener('resize', onResize)
      return () => {
        removeEventListener('resize', onResize)
      }
    })
    return () => {
      disposed = true
    }
  }, [st])
  if (st.state === 'loading') return <Loading what="แดชบอร์ด" />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  const { years, tax, bk, provinces } = st.data
  const top = Object.entries(tax.topics)
    .filter(([, t]) => !t.parent)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 12)
  return (
    <>
      <Kicker>
        แดชบอร์ด ·{' '}
        {Object.values(years.by_year)
          .reduce((s, n) => s + n, 0)
          .toLocaleString('th-TH')}{' '}
        ฉบับ
      </Kicker>
      <h1 style="margin:6px 0 20px">ราชกิจจานุเบกษาในตัวเลข</h1>
      <div class="two">
        <section>
          <h2 style="font-size:1.05rem;margin-bottom:8px">ฉบับต่อปี</h2>
          <div ref={yearsRef} style="height:260px" data-testid="chart-years" />
          <h2 style="font-size:1.05rem;margin:22px 0 8px">คดีล้มละลายตามขั้น</h2>
          <div ref={funnelRef} style="height:280px" data-testid="chart-funnel" />
          <p class="muted" style="font-size:.85rem">
            {bk.by_court_stage.length} คู่ศาล×ขั้น จาก field ที่สกัดได้ (`stage`, `court`)
          </p>
        </section>
        <section>
          <h2 style="font-size:1.05rem;margin-bottom:8px">หมวดหลัก (ยืนยันแล้ว)</h2>
          <table>
            <thead>
              <tr>
                <th>หมวด</th>
                <th style="text-align:right">ฉบับ</th>
              </tr>
            </thead>
            <tbody>
              {top.map(([s, t]) => (
                <tr key={s}>
                  <td>
                    <a href={`#/topic/${s}`}>{topicName(tax, s)}</a>
                  </td>
                  <td style="text-align:right">{t.n.toLocaleString('th-TH')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 style="font-size:1.05rem;margin:22px 0 8px">จังหวัดที่ออกเอกสารมากสุด</h2>
          <table>
            <tbody>
              {provinces.slice(0, 15).map((p) => (
                <tr key={p.name}>
                  <td>
                    <a href={`#/province/${encodeURIComponent(p.file)}`}>{p.name}</a>
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
