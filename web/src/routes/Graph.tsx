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
import { useClient, useLoad } from '../data/context'
import type { AgencyPage, Graph as GraphData, TopicPage } from '../data/types'
import { FAMILY_PALETTE, rootOf } from '../lib/family'
import { reducedMotion } from '../lib/motion'
import { beYear } from '../lib/thai'
import { useHref } from '../data/context'
import { DocRow, ErrorBox, Kicker, Loading } from '../ui/bits'

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

/** The nodes joined to this one, heaviest edge first. The parent/child edges carry value 0 and
 *  are structure rather than evidence, so they sort last but are still offered — "ขยะ is under
 *  มลพิษ" is exactly the kind of thing somebody arrives here not knowing. */
export function neighboursOf(
  model: GraphModel,
  id: string,
  limit = 12,
): { node: GraphNode; n: number; kin: boolean }[] {
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  // A pair can be joined twice — once because they co-occur and once because one is the other's
  // parent — and listing มลพิษ under both reads as a bug. Keep one row, carrying both facts.
  const best = new Map<string, { node: GraphNode; n: number; kin: boolean }>()
  for (const l of model.links) {
    const other = l.source === id ? l.target : l.target === id ? l.source : null
    if (!other) continue
    const node = byId.get(other)
    if (!node) continue
    const kin = l.value === 0
    const had = best.get(other)
    best.set(other, { node, n: Math.max(had?.n ?? 0, l.value), kin: kin || (had?.kin ?? false) })
  }
  return [...best.values()].sort((a, b) => b.n - a.n).slice(0, limit)
}

/** One colour per category, plus the grey that means "agency" at the end.
 *
 *  `FAMILY_PALETTE.slice(0, roots)` was wrong twice over: the palette has eleven entries and the
 *  taxonomy has twenty-two roots, so half the families came out with no colour at all — and the
 *  last entry is the grey reserved for "not a family", which is also what the legend calls
 *  agencies. Cycling the palette the way `familyColor` does means a topic is the same colour here
 *  as on its pill, which is the whole point of having a family palette.
 */
export function categoryColors(roots: number): string[] {
  const wheel = FAMILY_PALETTE.length - 1
  return [...Array.from({ length: roots }, (_, i) => FAMILY_PALETTE[i % wheel] ?? '#6b6b73'), '#8a8a94']
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
  // Agencies off to begin with. With them on, the first view is several hundred grey dots over
  // the topics and the page reads as "look how complex" rather than as an answer to anything —
  // they are an overlay you add once you know what you are looking at, not the starting picture.
  const [agencies, setAgencies] = useState(false)
  const [minEdge, setMinEdge] = useState(200)
  const [families, setFamilies] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  // Clicking a node used to leave the page. That is the one thing a reader exploring a graph
  // never wants: you lose the layout, the filters and your place. A click now opens what that
  // node actually is, beside the graph, with the links out offered rather than taken.
  const [sel, setSel] = useState<{ id: string; name: string; kind: 'topic' | 'agency' } | null>(null)
  const [zoom, setZoom] = useState(1)
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
    void import('../lib/charts').then(({ init }) => {
      if (disposed) return
      const chart = init(el, undefined, { renderer: 'canvas' }) as unknown as EChart
      chartRef.current = chart
      chart.on('click', (raw: unknown) => {
        const p = raw as { dataType?: string; data?: { id?: string; name?: string } }
        const id = p.data?.id
        if (p.dataType !== 'node' || !id) return
        setSel({ id, name: p.data?.name ?? id, kind: id.startsWith('t:') ? 'topic' : 'agency' })
      })
    })
    const onResize = () => {
      chartRef.current?.resize()
    }
    addEventListener('resize', onResize)
    // The window is not the only thing that changes this element's width: opening the detail
    // panel takes a third of the row. Without this the canvas keeps its old size and hangs over
    // the panel, swallowing its clicks — which is exactly how a test found it.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize)
    ro?.observe(el)
    return () => {
      disposed = true
      ro?.disconnect()
      removeEventListener('resize', onResize)
      chartRef.current?.dispose()
      chartRef.current = null
      delete el.dataset['ready']
    }
  }, [mounted])

  useEffect(() => {
    chartRef.current?.setOption({ series: [{ zoom }] })
  }, [zoom, model])

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
        animation: !reducedMotion(),
        color: categoryColors(model.roots.length),
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
            zoom,
            draggable: true,
            data,
            links,
            categories: model.categories,
            label: { position: 'right', fontFamily: 'Anuphan, sans-serif', fontSize: 11 },
            labelLayout: { hideOverlap: true },
            force: { repulsion: 180, edgeLength: [40, 160], gravity: 0.08, friction: 0.2 },
            emphasis: { focus: 'adjacency', label: { show: true } },
            lineStyle: { color: 'source', curveness: 0.15 },
            animationDuration: reducedMotion() ? 0 : 1200,
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
  }, [model, families, q, zoom])

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
        ยิ่งหนายิ่งพบบ่อย · ติ๊ก "แสดงหน่วยงาน" เพื่อซ้อนจุดสีเทาของหน่วยงานที่ออกเอกสารในหมวดนั้นมากที่สุด ·
        ตัวกรองจะทำให้ส่วนที่ไม่ตรงจางลงเฉย ๆ ไม่ได้ลบออก · คลิกวงกลมเพื่อดูว่ามันคืออะไร อยู่ติดกับอะไร
        และเปิดฉบับจริงได้จากตรงนั้น
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
      {/* A canvas has no elements, so nothing in the graph can be reached by keyboard or read by
          a screen reader. Typing already dims everything that does not match; these are the same
          matches, as real buttons, so the graph can be entered without a mouse — and once a node
          is open, its neighbour list walks the rest of it. */}
      {q.trim() !== '' && model && (
        <div class="chips" style="margin:10px 0 0" aria-label={`โหนดที่ตรงกับ "${q}"`}>
          {(() => {
            const hits = model.nodes.filter((n) => focusOf(n, { families: new Set(), q })).slice(0, 12)
            if (!hits.length) return <span class="muted">ไม่พบหมวดหรือหน่วยงานที่ตรงกับ "{q}"</span>
            return (
              <>
                <span class="muted" style="align-self:center;font-size:.85rem">
                  เลือกเพื่อดูรายละเอียด:
                </span>
                {hits.map((n) => (
                  <button
                    key={n.id}
                    class="chip"
                    aria-pressed={sel?.id === n.id}
                    onClick={() => {
                      setSel({ id: n.id, name: n.name, kind: n.kind })
                    }}
                  >
                    {n.name}
                  </button>
                ))}
              </>
            )
          })()}
        </div>
      )}
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
      <div class={`graphlayout${sel ? ' withpanel' : ''}`}>
        <div class="graphstage">
          <div class="graphnav" role="group" aria-label="มุมมองกราฟ">
            <button
              class="btn"
              onClick={() => {
                setZoom((z) => Math.min(6, +(z * 1.3).toFixed(3)))
              }}
              aria-label="ขยายเข้า"
              title="ขยายเข้า"
            >
              +
            </button>
            <button
              class="btn"
              onClick={() => {
                setZoom((z) => Math.max(0.2, +(z / 1.3).toFixed(3)))
              }}
              aria-label="ย่อออก"
              title="ย่อออก"
            >
              −
            </button>
            <button
              class="btn"
              onClick={() => {
                setZoom(1)
              }}
              aria-label="กลับไปขนาดเริ่มต้น"
              title="กลับไปขนาดเริ่มต้น"
            >
              ⤢
            </button>
            <span class="muted" aria-hidden="true">
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <div ref={ref} class="graphcanvas" data-testid="graph" />
          <p class="muted graphhelp">
            ลากเพื่อเลื่อน · หมุนล้อหรือกดปุ่มเพื่อซูม · คลิกวงกลมเพื่อดูรายละเอียด
          </p>
        </div>
        {sel && model && (
          <NodePanel
            node={sel}
            model={model}
            year={year}
            onPick={(id, name, kind) => {
              setSel({ id, name, kind })
            }}
            onClose={() => {
              setSel(null)
            }}
          />
        )}
      </div>
    </>
  )
}

/** What a node actually is: how much of the archive it accounts for, what it sits next to, and
 *  the three ways out — its own page, the documents themselves, and a feed to follow it. A graph
 *  that only draws relationships leaves the reader to guess what to do with one. */
function NodePanel({
  node,
  model,
  year,
  onPick,
  onClose,
}: {
  node: { id: string; name: string; kind: 'topic' | 'agency' }
  model: GraphModel
  year: string
  onPick: (id: string, name: string, kind: 'topic' | 'agency') => void
  onClose: () => void
}) {
  const href = useHref()
  const client = useClient()
  const key = node.id.slice(2)
  const facet = useLoad<TopicPage | AgencyPage | null>(
    async (c) => (node.kind === 'topic' ? await c.topic(key) : await c.agency(key)),
    [node.id],
  )
  const near = neighboursOf(model, node.id)
  const explore = href.explore({
    ...(year ? { scope: 'year', year } : { scope: 'all' }),
    ...(node.kind === 'topic' ? { topic: key } : { agency: key }),
  })
  return (
    <aside class="nodepanel" aria-label={`รายละเอียดของ ${node.name}`}>
      <div class="nodepanel-head">
        <div>
          <span class="muted" style="font-size:.8rem">
            {node.kind === 'topic' ? 'หมวด' : 'หน่วยงาน'}
          </span>
          <h2 style="font-size:1.1rem;margin:2px 0 0">{node.name}</h2>
        </div>
        <button class="chip" onClick={onClose} aria-label="ปิดรายละเอียด">
          ×
        </button>
      </div>

      {facet.state === 'loading' && <Loading what={node.name} />}
      {facet.state === 'error' && (
        <p class="muted" style="font-size:.9rem">
          ยังไม่มีหน้าสรุปของ{node.kind === 'topic' ? 'หมวด' : 'หน่วยงาน'}นี้ — เปิดในหน้าสำรวจได้
        </p>
      )}
      {facet.state === 'ok' && facet.data && (
        <>
          <p class="muted" style="font-size:.9rem;margin:10px 0 12px">
            <b>{facet.data.total.toLocaleString('th-TH')}</b> ฉบับทั้งคลัง
            {Object.keys(facet.data.provinces).length > 0 && (
              <> · {Object.keys(facet.data.provinces).length} จังหวัด</>
            )}
          </p>
          <h3 class="nodepanel-h">ฉบับล่าสุด</h3>
          <div class="doclist tight">
            {facet.data.recent.slice(0, 3).map((d) => (
              <DocRow key={d.id} d={d} month={d.d?.slice(0, 7)} />
            ))}
          </div>
        </>
      )}

      <h3 class="nodepanel-h">อยู่ติดกับ</h3>
      {near.length === 0 ? (
        <p class="muted" style="font-size:.85rem">
          ไม่มีเส้นเชื่อมที่ผ่านเกณฑ์ — ลดค่า "แสดงเส้นเมื่อพบร่วมกันอย่างน้อย" ลง
        </p>
      ) : (
        <ul class="nearlist">
          {near.map((x) => (
            <li key={x.node.id}>
              <button
                onClick={() => {
                  onPick(x.node.id, x.node.name, x.node.kind)
                }}
              >
                <span class="nm">{x.node.name}</span>
                <span class="muted">
                  {x.n > 0 ? `${x.n.toLocaleString('th-TH')} ฉบับร่วมกัน` : 'หมวดแม่หรือหมวดย่อย'}
                  {x.n > 0 && x.kin ? ' · สายเดียวกัน' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div class="nodepanel-links">
        <a class="btn" href={node.kind === 'topic' ? href.topic(key) : href.agency(key)}>
          หน้าสรุปเต็ม →
        </a>
        <a class="btn" href={explore}>
          ดูฉบับจริงในสำรวจ →
        </a>
        <a class="btn" href={client.feedUrl(`${node.kind === 'topic' ? 'topic' : 'agency'}/${key}`)}>
          RSS
        </a>
      </div>
    </aside>
  )
}
