import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useLoad } from '../data/context'
import type { Graph as GraphData } from '../data/types'
import { FAMILY_PALETTE, rootOf } from '../lib/family'
import { beYear } from '../lib/thai'
import { href } from '../router'
import { ErrorBox, Kicker, Loading } from '../ui/bits'

export interface YearGraph {
  year: string
  topics: { slug: string; n: number }[]
  agencies: { id: string; name: string; n: number }[]
  topic_agency: GraphData['topic_agency']
  topic_topic: GraphData['topic_topic']
}

export interface GraphNode {
  id: string
  name: string
  value: number
  category: number
  symbolSize: number
  kind: 'topic' | 'agency'
  root: string
}
export interface GraphModel {
  nodes: GraphNode[]
  links: { source: string; target: string; value: number; lineStyle: { width: number; opacity: number } }[]
  categories: { name: string }[]
  roots: string[]
}

/** Names and tree come from the global graph; sizes and edges from the chosen year (or the global one). */
export function buildModel(
  g: GraphData,
  year: YearGraph | null,
  opts: { minEdge: number; agencies: boolean },
): GraphModel {
  const parent: Record<string, string | null> = {}
  for (const t of g.topics) parent[t.slug] = t.parent
  const roots = [...new Set(g.topics.map((t) => rootOf(t.slug, parent)))].sort()
  const catOf = new Map(roots.map((r, i) => [r, i]))
  const thai = new Map(g.topics.map((t) => [t.slug, t.thai ?? t.slug]))
  const nYear = year ? new Map(year.topics.map((t) => [t.slug, t.n])) : null
  const size = (n: number) => (n ? 10 + Math.min(50, Math.log10(Math.max(1, n)) * 9) : 6)
  const nodes: GraphNode[] = g.topics.map((t) => {
    const n = nYear ? (nYear.get(t.slug) ?? 0) : t.n
    return {
      id: `t:${t.slug}`,
      name: t.thai ?? t.slug,
      value: n,
      kind: 'topic',
      root: rootOf(t.slug, parent),
      category: catOf.get(rootOf(t.slug, parent)) ?? 0,
      symbolSize: size(n),
    }
  })
  const src = year ?? g
  const links: GraphModel['links'] = []
  for (const e of src.topic_topic)
    if (e.n >= opts.minEdge && thai.has(e.a) && thai.has(e.b))
      links.push({
        source: `t:${e.a}`,
        target: `t:${e.b}`,
        value: e.n,
        lineStyle: { width: 1 + Math.log10(e.n), opacity: 0.55 },
      })
  for (const t of g.topics)
    if (t.parent && thai.has(t.parent))
      links.push({
        source: `t:${t.slug}`,
        target: `t:${t.parent}`,
        value: 0,
        lineStyle: { width: 0.6, opacity: 0.25 },
      })
  if (opts.agencies) {
    const agencies = year ? year.agencies : g.agencies
    const used = new Set(src.topic_agency.filter((e) => e.n >= opts.minEdge).map((e) => e.a))
    for (const a of agencies)
      if (used.has(a.id))
        nodes.push({
          id: `a:${a.id}`,
          name: a.name,
          value: a.n,
          kind: 'agency',
          root: '',
          category: roots.length,
          symbolSize: 6 + Math.min(14, Math.log10(Math.max(1, a.n)) * 3),
        })
    for (const e of src.topic_agency)
      if (e.n >= opts.minEdge && used.has(e.a) && thai.has(e.t))
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
    roots,
  }
}

/** Focus never removes a node: matching nodes stay vivid, the rest fade to the background. */
export function focusOf(node: GraphNode, focus: { families: Set<string>; q: string }): boolean {
  if (focus.families.size && node.kind === 'topic' && !focus.families.has(node.root)) return false
  if (focus.families.size && node.kind === 'agency') return false
  if (focus.q && !node.name.replace(/\s+/g, '').includes(focus.q.replace(/\s+/g, ''))) return false
  return true
}

export function Graph() {
  const base = useLoad(
    async (c) => ({
      g: await c.graph(),
      years: Object.keys((await c.years()).by_year)
        .sort()
        .reverse(),
    }),
    [],
  )
  const [year, setYear] = useState<string>('')
  const yg = useLoad(async (c) => (year ? c.get<YearGraph>(`agg/graph/${year}.json`) : null), [year])
  const [agencies, setAgencies] = useState(true)
  const [minEdge, setMinEdge] = useState(200)
  const [families, setFamilies] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const model = useMemo(
    () =>
      base.state === 'ok'
        ? buildModel(base.data.g, yg.state === 'ok' ? yg.data : null, {
            minEdge: year ? Math.max(5, Math.round(minEdge / 10)) : minEdge,
            agencies,
          })
        : null,
    [base, yg, minEdge, agencies, year],
  )
  useEffect(() => {
    if (!model || !ref.current) return
    let disposed = false
    const el = ref.current
    const focus = { families, q }
    void import('echarts').then((echarts) => {
      if (disposed) return
      const chart = echarts.init(el, undefined, { renderer: 'canvas' })
      const data = model.nodes.map((n) => {
        const on = focusOf(n, focus)
        return {
          ...n,
          itemStyle: { opacity: on ? 1 : 0.12 },
          label: {
            show:
              on && (n.kind === 'agency' ? Boolean(q) : n.symbolSize > 16 || families.size > 0 || Boolean(q)),
          },
        }
      })
      const dim = new Set(data.filter((d) => d.itemStyle.opacity < 1).map((d) => d.id))
      const links = model.links.map((l) =>
        dim.has(l.source) || dim.has(l.target) ? { ...l, lineStyle: { ...l.lineStyle, opacity: 0.04 } } : l,
      )
      chart.setOption({
        backgroundColor: 'transparent',
        color: [...FAMILY_PALETTE.slice(0, model.roots.length), '#8a8a94'],
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
        series: [
          {
            type: 'graph',
            layout: 'force',
            roam: true,
            draggable: true,
            data,
            links,
            categories: model.categories,
            label: { position: 'right', fontFamily: 'Anuphan, sans-serif', fontSize: 11 },
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
  }, [model, families, q])
  if (base.state === 'loading') return <Loading what="กราฟความสัมพันธ์" />
  if (base.state === 'error') return <ErrorBox error={base.error} />
  const g = base.data.g
  const toggle = (r: string) => {
    setFamilies((s) => {
      const n = new Set(s)
      if (n.has(r)) n.delete(r)
      else n.add(r)
      return n
    })
  }
  const rootName = (r: string) => g.topics.find((t) => t.slug === r)?.thai ?? r
  const stats = year && yg.state === 'ok' && yg.data ? yg.data : g
  return (
    <>
      <Kicker>
        ความสัมพันธ์ · {year ? `ปี ${beYear(year)}` : 'ทั้งคลัง'} · {stats.topic_topic.length}{' '}
        คู่ที่ปรากฏร่วมกัน · {stats.agencies.length} หน่วยงานหลัก
      </Kicker>
      <h1 style="margin:6px 0 12px">แผนที่ความสัมพันธ์ระหว่างหมวด</h1>
      <p class="muted" style="margin:0 0 14px;max-width:72ch">
        วงกลม = หมวด (ขนาดตามจำนวนฉบับ สีตามหมวดแม่) · เส้นหนา = สองหมวดที่ระบบจำแนกให้เอกสารเดียวกันบ่อย ·
        จุดเทา = หน่วยงานที่ออกเอกสารในหมวดนั้นมากสุด · ตัวกรองไม่ลบจุดออก แค่ทำให้ที่เหลือจางลง · ลาก ซูม
        คลิกเพื่อเข้าไปดู
      </p>
      <div class="toolbar">
        <select
          aria-label="ปี"
          value={year}
          onChange={(e) => {
            setYear((e.target as HTMLSelectElement).value)
          }}
        >
          <option value="">ทั้งคลัง</option>
          {base.data.years.map((y) => (
            <option key={y} value={y}>
              ปี {beYear(y)}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="ค้นชื่อหมวดหรือหน่วยงาน"
          placeholder="ค้นชื่อหมวด/หน่วยงาน เพื่อเน้น"
          value={q}
          onInput={(e) => {
            setQ((e.target as HTMLInputElement).value)
          }}
          style="max-width:280px"
        />
        <label class="check">
          <input
            type="checkbox"
            checked={agencies}
            onChange={(e) => {
              setAgencies((e.target as HTMLInputElement).checked)
            }}
          />{' '}
          แสดงหน่วยงาน
        </label>
        <label class="check">
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
          <span class="muted">
            {(year ? Math.max(5, Math.round(minEdge / 10)) : minEdge).toLocaleString('th-TH')} ฉบับ
          </span>
        </label>
      </div>
      <div class="chips" style="margin:10px 0 12px" aria-label="เน้นหมวดแม่">
        <button
          class="chip"
          aria-pressed={families.size === 0}
          onClick={() => {
            setFamilies(new Set())
          }}
        >
          ทุกหมวด
        </button>
        {model?.roots.map((r, i) => (
          <button
            key={r}
            class="chip fam"
            aria-pressed={families.has(r)}
            style={`--fam:${FAMILY_PALETTE[i] ?? '#888'}`}
            onClick={() => {
              toggle(r)
            }}
          >
            <i /> {rootName(r)}
          </button>
        ))}
      </div>
      {yg.state === 'loading' && <Loading what={`กราฟปี ${beYear(year)}`} />}
      <div
        ref={ref}
        style="height:640px;border:1px solid var(--line);border-radius:14px;background:var(--paper-2)"
        data-testid="graph"
      />
    </>
  )
}
