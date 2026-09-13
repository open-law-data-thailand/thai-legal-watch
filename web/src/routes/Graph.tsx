import { useEffect, useRef, useState } from 'preact/hooks'
import { useLoad } from '../data/context'
import type { Graph as GraphData } from '../data/types'
import { href } from '../router'
import { ErrorBox, Kicker, Loading } from '../ui/bits'

const PALETTE = [
  '#6b4fd8',
  '#1d9e75',
  '#d85a30',
  '#378add',
  '#d4537e',
  '#ba7517',
  '#639922',
  '#534ab7',
  '#0f6e56',
  '#993c1d',
]

/** Root ancestor of a topic: the colour family of everything under it. */
export function rootOf(slug: string, parent: Record<string, string | null>): string {
  let cur = slug
  for (let i = 0; i < 12 && parent[cur]; i++) cur = parent[cur] as string
  return cur
}

export interface GraphModel {
  nodes: {
    id: string
    name: string
    value: number
    category: number
    symbolSize: number
    kind: 'topic' | 'agency'
  }[]
  links: { source: string; target: string; value: number; lineStyle: { width: number; opacity: number } }[]
  categories: { name: string }[]
}

/** Topics as big nodes coloured by root, agencies as small grey nodes; edge width ~ log(count). */
export function buildModel(g: GraphData, opts: { minEdge: number; agencies: boolean }): GraphModel {
  const parent: Record<string, string | null> = {}
  for (const t of g.topics) parent[t.slug] = t.parent
  const roots = [...new Set(g.topics.map((t) => rootOf(t.slug, parent)))].sort()
  const catOf = new Map(roots.map((r, i) => [r, i]))
  const thai = new Map(g.topics.map((t) => [t.slug, t.thai ?? t.slug]))
  const size = (n: number) => 10 + Math.min(50, Math.log10(Math.max(1, n)) * 9)
  const nodes: GraphModel['nodes'] = g.topics.map((t) => ({
    id: `t:${t.slug}`,
    name: t.thai ?? t.slug,
    value: t.n,
    kind: 'topic',
    category: catOf.get(rootOf(t.slug, parent)) ?? 0,
    symbolSize: size(t.n),
  }))
  const links: GraphModel['links'] = []
  for (const e of g.topic_topic) {
    if (e.n < opts.minEdge) continue
    links.push({
      source: `t:${e.a}`,
      target: `t:${e.b}`,
      value: e.n,
      lineStyle: { width: 1 + Math.log10(e.n), opacity: 0.55 },
    })
  }
  // the tree itself is a relationship too: child → parent, thin
  for (const t of g.topics)
    if (t.parent && thai.has(t.parent))
      links.push({
        source: `t:${t.slug}`,
        target: `t:${t.parent}`,
        value: 0,
        lineStyle: { width: 0.6, opacity: 0.25 },
      })
  if (opts.agencies) {
    const used = new Set(g.topic_agency.filter((e) => e.n >= opts.minEdge).map((e) => e.a))
    for (const a of g.agencies)
      if (used.has(a.id))
        nodes.push({
          id: `a:${a.id}`,
          name: a.name,
          value: a.n,
          kind: 'agency',
          category: roots.length,
          symbolSize: 6 + Math.min(14, Math.log10(Math.max(1, a.n)) * 3),
        })
    for (const e of g.topic_agency)
      if (e.n >= opts.minEdge && used.has(e.a))
        links.push({
          source: `t:${e.t}`,
          target: `a:${e.a}`,
          value: e.n,
          lineStyle: { width: 0.8 + Math.log10(e.n) * 0.6, opacity: 0.35 },
        })
  }
  return {
    nodes,
    links,
    categories: [...roots.map((r) => ({ name: thai.get(r) ?? r })), { name: 'หน่วยงาน' }],
  }
}

export function Graph() {
  const st = useLoad((c) => c.graph(), [])
  const [agencies, setAgencies] = useState(true)
  const [minEdge, setMinEdge] = useState(200)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (st.state !== 'ok' || !ref.current) return
    let disposed = false
    const el = ref.current
    void import('echarts').then((echarts) => {
      if (disposed) return
      const model = buildModel(st.data, { minEdge, agencies })
      const chart = echarts.init(el, undefined, { renderer: 'canvas' })
      chart.setOption({
        backgroundColor: 'transparent',
        color: [...PALETTE, '#8a8a94'],
        tooltip: {
          formatter: (p: {
            dataType?: string
            data?: { name?: string; value?: number; kind?: string }
            value?: number
          }) =>
            p.dataType === 'edge'
              ? `ปรากฏร่วมกัน ${(p.value ?? 0).toLocaleString('th-TH')} ฉบับ`
              : `${p.data?.name ?? ''}<br/>${(p.data?.value ?? 0).toLocaleString('th-TH')} ฉบับ · ${p.data?.kind === 'agency' ? 'คลิกเพื่อดูหน่วยงาน' : 'คลิกเพื่อดูหมวด'}`,
        },
        legend: { type: 'scroll', bottom: 0, textStyle: { fontFamily: 'Anuphan, sans-serif' } },
        series: [
          {
            type: 'graph',
            layout: 'force',
            roam: true,
            draggable: true,
            data: model.nodes,
            links: model.links,
            categories: model.categories,
            label: {
              show: true,
              position: 'right',
              fontFamily: 'Anuphan, sans-serif',
              fontSize: 11,
              formatter: (p: { data?: { kind?: string; symbolSize?: number; name?: string } }) =>
                p.data?.kind === 'topic' && (p.data.symbolSize ?? 0) > 16 ? (p.data.name ?? '') : '',
            },
            labelLayout: { hideOverlap: true },
            force: { repulsion: 180, edgeLength: [40, 160], gravity: 0.08, friction: 0.2 },
            emphasis: { focus: 'adjacency', label: { show: true } },
            lineStyle: { color: 'source', curveness: 0.15 },
            animationDuration: 1200,
            animationEasingUpdate: 'quinticInOut',
          },
        ],
      })
      chart.on('click', (raw) => {
        const p = raw as unknown as { dataType?: string; data?: { id?: string } }
        const id = p.data?.id
        if (p.dataType !== 'node' || !id) return
        location.hash = id.startsWith('t:') ? href.topic(id.slice(2)) : href.agency(id.slice(2))
      })
      const onResize = () => {
        chart.resize()
      }
      addEventListener('resize', onResize)
      el.dataset['ready'] = '1'
      return () => {
        removeEventListener('resize', onResize)
        chart.dispose()
      }
    })
    return () => {
      disposed = true
    }
  }, [st, minEdge, agencies])
  if (st.state === 'loading') return <Loading what="กราฟความสัมพันธ์" />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  return (
    <>
      <Kicker>
        ความสัมพันธ์ · {st.data.topics.length} หมวด · {st.data.topic_topic.length} คู่ที่ปรากฏร่วมกัน ·{' '}
        {st.data.agencies.length} หน่วยงานหลัก
      </Kicker>
      <h1 style="margin:6px 0 12px">แผนที่ความสัมพันธ์ระหว่างหมวด</h1>
      <p class="muted" style="margin:0 0 14px;max-width:70ch">
        วงกลม = หมวด (ขนาดตามจำนวนฉบับ สีตามหมวดแม่) · เส้นหนา = สองหมวดที่ระบบจำแนกให้เอกสารเดียวกันบ่อย ·
        จุดเทา = หน่วยงานที่ออกเอกสารในหมวดนั้นมากสุด · ลากได้ ซูมได้ คลิกเพื่อเข้าไปดู
      </p>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <label style="display:flex;gap:8px;align-items:center">
          <input
            type="checkbox"
            checked={agencies}
            onChange={(e) => {
              setAgencies((e.target as HTMLInputElement).checked)
            }}
          />{' '}
          แสดงหน่วยงาน
        </label>
        <label style="display:flex;gap:8px;align-items:center">
          เส้นขั้นต่ำ{' '}
          <input
            type="range"
            min={20}
            max={5000}
            step={20}
            value={minEdge}
            onInput={(e) => {
              setMinEdge(Number((e.target as HTMLInputElement).value))
            }}
          />{' '}
          <span class="muted">{minEdge.toLocaleString('th-TH')} ฉบับ</span>
        </label>
      </div>
      <div
        ref={ref}
        style="height:620px;border:1px solid var(--line);border-radius:12px;background:var(--paper-2)"
        data-testid="graph"
      />
    </>
  )
}
