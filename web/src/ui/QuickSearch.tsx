/** One box that jumps anywhere: topics, provinces, agencies, a document id. "/" focuses it. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { docIdOk } from '../data/client'
import { parseCitation } from '../lib/coords'
import { partLabel } from '../lib/thai'
import { useClient } from '../data/context'
import { useLoad } from '../data/context'
import { href } from '../router'

export interface Hit {
  kind: 'หมวด' | 'จังหวัด' | 'หน่วยงาน' | 'เอกสาร' | 'อ้างอิง'
  name: string
  to: string
  n?: number
  citation?: { volume: number; part: string; page: number | null }
}

export function search(
  q: string,
  idx: {
    topics: { slug: string; thai: string | null; n: number }[]
    provinces: { name: string; file: string; n: number }[]
    agencies: { id: string; name: string; n: number; page?: boolean }[]
  },
  limit = 8,
): Hit[] {
  const needle = q.replace(/\s+/g, '')
  if (!needle) return []
  const out: Hit[] = []
  if (docIdOk(q.trim())) out.push({ kind: 'เอกสาร', name: q.trim(), to: href.doc(q.trim()) })
  const cite = parseCitation(q)
  if (cite)
    out.push({
      kind: 'อ้างอิง',
      name: `เล่ม ${cite.volume} ${partLabel(cite.part)}${cite.page ? ` หน้า ${cite.page}` : ''} → เปิดฉบับนี้`,
      to: '',
      citation: cite,
    })
  // rank: what starts with what you typed first, then the bigger thing of the same kind —
  // otherwise a one-letter query buries "ไฟฟ้า" under every name that merely contains ไ
  const KIND_ORDER: Record<Hit['kind'], number> = {
    เอกสาร: 0,
    อ้างอิง: 0,
    หมวด: 1,
    จังหวัด: 2,
    หน่วยงาน: 3,
  }
  const scored: { hit: Hit; prefix: number }[] = []
  const add = (hit: Hit, haystacks: string[]) => {
    const flat = haystacks.map((h) => h.replace(/\s+/g, ''))
    if (!flat.some((h) => h.includes(needle))) return
    scored.push({ hit, prefix: flat.some((h) => h.startsWith(needle)) ? 0 : 1 })
  }
  for (const t of idx.topics)
    add({ kind: 'หมวด', name: t.thai ?? t.slug, to: href.topic(t.slug), n: t.n }, [t.thai ?? t.slug, t.slug])
  for (const p of idx.provinces)
    add({ kind: 'จังหวัด', name: p.name, to: href.province(p.file), n: p.n }, [p.name])
  for (const a of idx.agencies)
    add(
      {
        kind: 'หน่วยงาน',
        name: a.name,
        to: a.page === false ? href.explore({ agency: a.id, scope: 'all' }) : href.agency(a.id),
        n: a.n,
      },
      [a.name],
    )
  scored.sort(
    (x, y) =>
      x.prefix - y.prefix ||
      KIND_ORDER[x.hit.kind] - KIND_ORDER[y.hit.kind] ||
      (y.hit.n ?? 0) - (x.hit.n ?? 0),
  )
  // one kind must not crowd the others out of a short list
  const perKind = new Map<Hit['kind'], number>()
  for (const { hit } of scored) {
    const seen = perKind.get(hit.kind) ?? 0
    if (seen >= 4) continue
    perKind.set(hit.kind, seen + 1)
    out.push(hit)
    if (out.length >= limit) break
  }
  return out.slice(0, limit)
}

export function QuickSearch({ big = false }: { big?: boolean } = {}) {
  // two of these render on the home page, so the ids they point at have to differ
  const listId = big ? 'qs-list-hero' : 'qs-list'
  const client = useClient()
  const [note, setNote] = useState('')
  const idx = useLoad(
    async (c) => ({ topics: await c.topics(), provinces: await c.provinces(), agencies: await c.agencies() }),
    [],
  )
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const hits = useMemo(() => (idx.state === 'ok' ? search(q, idx.data) : []), [q, idx])
  useEffect(() => {
    // the header box is on every page, so it owns "/" — otherwise two instances race on the
    // home page and the shortcut lands wherever the last one mounted
    if (big) return
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey)
    }
  }, [big])
  const go = (h: Hit) => {
    if (h.citation) {
      setNote('กำลังเปิดฉบับตามเลขอ้างอิง…')
      client.byCitation(h.citation).then(
        (hit) => {
          if (hit) {
            location.hash = href.doc(hit.doc.id, hit.month)
            setQ('')
            setOpen(false)
            setNote('')
          } else setNote('ไม่พบฉบับตามเลขอ้างอิงนี้')
        },
        // without this a failed shard fetch left "กำลังเปิด…" on screen for good
        () => {
          setNote('เปิดไม่สำเร็จ ลองใหม่อีกครั้ง')
        },
      )
      return
    }
    location.hash = h.to
    setQ('')
    setOpen(false)
    input.current?.blur()
  }
  return (
    <div class={`qs${big ? ' big' : ''}`} role="search">
      <input
        ref={input}
        type="search"
        value={q}
        placeholder={
          big
            ? 'ค้นหมวด จังหวัด หน่วยงาน หรือใส่เลขอ้างอิง เช่น เล่ม 143 ตอนพิเศษ 219 ง หน้า 23'
            : 'ค้นด่วน  ( / )'
        }
        aria-label="ค้นหาด่วน"
        aria-expanded={open && hits.length > 0}
        // only point at the list while it exists, and name the highlighted option — arrowing
        // through the results used to be completely silent for a screen reader
        aria-controls={open && hits.length > 0 ? listId : undefined}
        aria-activedescendant={open && hits[sel] ? `${listId}-${sel}` : undefined}
        aria-autocomplete="list"
        role="combobox"
        onInput={(e) => {
          setQ((e.target as HTMLInputElement).value)
          setOpen(true)
          setSel(0)
        }}
        onFocus={() => {
          setOpen(true)
        }}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false)
          }, 120)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSel((s) => Math.min(hits.length - 1, s + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSel((s) => Math.max(0, s - 1))
          } else if (e.key === 'Enter') {
            const h = hits[sel]
            if (h) go(h)
          } else if (e.key === 'Escape') {
            setOpen(false)
            input.current?.blur()
          }
        }}
      />
      {note && (
        <div class="qs-note" role="status">
          {note}
        </div>
      )}
      {open && hits.length > 0 && (
        <ul id={listId} class="qs-list" role="listbox" aria-label="ผลการค้นหาด่วน">
          {hits.map((h, i) => (
            <li
              key={h.to}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === sel}
              onMouseDown={() => {
                go(h)
              }}
            >
              <span class="kind">{h.kind}</span>
              <span class="name">{h.name}</span>
              {h.n !== undefined && <span class="n">{h.n.toLocaleString('th-TH')}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
