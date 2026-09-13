import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

/** ECharts renders a tooltip formatter's return value as HTML, and these names come from OCR of
 *  scanned gazette pages — not a source that can be assumed free of angle brackets. Everywhere
 *  else on the site names go through JSX, which escapes them. */
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

/** Only the handful of ECharts methods this page uses; keeps the instance out of the render tree
 *  without pulling the library's types into a module that must not import it eagerly. */
interface EChart {
  setOption: (option: unknown) => void
  resize: () => void
  dispose: () => void
  on: (event: string, handler: (raw: unknown) => void) => void
}
import { useLoad } from '../data/context'
import type { Graph as GraphData } from '../data/types'
import { FAMILY_PALETTE, rootOf } from '../lib/family'
import { beYear } from '../lib/thai'
import { useHref } from '../data/context'
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
  const href = useHref()
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
  // One chart for the life of the page. The old code re-ran echarts.init on every change of
  // `families` or `q` — that is once per keystroke in the focus box — without disposing the
  // previous instance, because the cleanup it returned went to the promise rather than to Preact.
  // Each abandoned instance kept its force layout running and its resize listener attached.
  const chartRef = useRef<EChart | null>(null)
  // keyed on whether the container is on the page at all: while the data is loading this route
  // renders a spinner instead of the div, so an effect with no dependencies would run once,
  // find no element, and never try again
  const mounted = base.state === 'ok'
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let disposed = false
    void import('echarts').then((echarts) => {
      if (disposed) return
      const chart = echarts.init(el, undefined, { renderer: 'canvas' }) as unknown as EChart
      chartRef.current = chart
      chart.on('click', (raw: unknown) => {
        const p = raw as { dataType?: string; data?: { id?: string } }
        const id = p.data?.id
        if (p.dataType !== 'node' || !id) return
        location.hash = id.startsWith('t:') ? href.topic(id.slice(2)) : href.agency(id.slice(2))
      })
    })
    const onResize = () => {
      chartRef.current?.resize()
    }
    addEventListener('resize', onResize)
    return () => {
      disposed = true
      removeEventListener('resize', onResize)
      chartRef.current?.dispose()
      chartRef.current = null
      delete el.dataset['ready']
    }
  }, [mounted, href])

  useEffect(() => {
    const el = ref.current
    if (!model || !el) return
    let cancelled = false
    const focus = { families, q }
    // the instance may still be mid-import on the first pass; retry once it exists
    const paint = () => {
      const chart = chartRef.current
      if (cancelled || !chart) return false
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
              : `${escapeHtml(p.data?.name ?? '')}<br/>${(p.data?.value ?? 0).toLocaleString('th-TH')} ฉบับ · ${p.data?.kind === 'agency' ? 'คลิกเพื่อดูหน่วยงาน' : 'คลิกเพื่อดูหมวด'}`,
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
      el.dataset['ready'] = '1'
      return true
    }
    if (!paint()) {
      const t = setInterval(() => {
        if (paint()) clearInterval(t)
      }, 50)
      return () => {
        cancelled = true
        clearInterval(t)
      }
    }
    return () => {
      cancelled = true
    }
  }, [model, families, q])

  if (base.state === 'loading') return <Loading what="ความสัมพันธ์ของหมวด" />
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
      <h1 style="margin:6px 0 12px">หมวดไหนมักออกมาพร้อมกัน</h1>
      <p class="muted" style="margin:0 0 14px;max-width:72ch">
        วงกลมคือหมวด ขนาดตามจำนวนฉบับ สีตามหมวดแม่ · เส้นที่เชื่อมกันคือสองหมวดที่มักถูกจำแนกให้ฉบับเดียวกัน
        ยิ่งหนายิ่งพบบ่อย · จุดสีเทาคือหน่วยงานที่ออกเอกสารในหมวดนั้นมากที่สุด ·
        ตัวกรองจะทำให้ส่วนที่ไม่ตรงจางลงเฉย ๆ ไม่ได้ลบออก · ลากเพื่อเลื่อน หมุนล้อเพื่อซูม
        คลิกเพื่อเปิดหน้านั้น
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
          placeholder="พิมพ์ชื่อหมวดหรือหน่วยงานเพื่อเน้น"
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
          แสดงเส้นเมื่อพบร่วมกันอย่างน้อย{' '}
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
      {yg.state === 'error' && <ErrorBox error={yg.error} what={`ข้อมูลความสัมพันธ์ของปี ${beYear(year)}`} />}
      {yg.state === 'loading' && <Loading what={`กราฟปี ${beYear(year)}`} />}
      <div
        ref={ref}
        style="height:640px;border:1px solid var(--line);border-radius:14px;background:var(--paper-2)"
        data-testid="graph"
      />
    </>
  )
}
