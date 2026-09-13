/** One box that jumps anywhere: topics, provinces, agencies, a document id. "/" focuses it. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { docIdOk } from '../data/client'
import { useLoad } from '../data/context'
import { href } from '../router'

export interface Hit {
  kind: 'หมวด' | 'จังหวัด' | 'หน่วยงาน' | 'เอกสาร'
  name: string
  to: string
  n?: number
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
  for (const t of idx.topics)
    if ((t.thai ?? t.slug).replace(/\s+/g, '').includes(needle) || t.slug.includes(needle))
      out.push({ kind: 'หมวด', name: t.thai ?? t.slug, to: href.topic(t.slug), n: t.n })
  for (const p of idx.provinces)
    if (p.name.includes(needle))
      out.push({ kind: 'จังหวัด', name: p.name, to: href.province(p.file), n: p.n })
  const ag = idx.agencies
    .filter((a) => a.name.replace(/\s+/g, '').includes(needle))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
  for (const a of ag)
    out.push({
      kind: 'หน่วยงาน',
      name: a.name,
      to: a.page === false ? href.explore({ agency: a.id, scope: 'all' }) : href.agency(a.id),
      n: a.n,
    })
  return out.slice(0, limit)
}

export function QuickSearch({ big = false }: { big?: boolean } = {}) {
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
  }, [])
  const go = (h: Hit) => {
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
            ? 'พิมพ์ชื่อหมวด จังหวัด หน่วยงาน หรือรหัสเอกสาร เช่น ขยะ, ตรัง, กระทรวงสาธารณสุข'
            : 'ค้นด่วน  ( / )'
        }
        aria-label="ค้นหาด่วน"
        aria-expanded={open && hits.length > 0}
        aria-controls="qs-list"
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
      {open && hits.length > 0 && (
        <ul id="qs-list" class="qs-list" role="listbox">
          {hits.map((h, i) => (
            <li
              key={h.to}
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
