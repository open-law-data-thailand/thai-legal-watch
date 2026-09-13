/** "I have the citation, give me the document." เล่ม / ตอน / หน้า as their own fields, because
 *  that is how a citation arrives in a footnote — and typing it into a search box is a guess. */
import { useState } from 'preact/hooks'
import { useClient } from '../data/context'
import { hrefFor } from '../router'

export type LookupState = { state: 'idle' | 'busy' } | { state: 'missing'; message: string }

const CLASSES = ['ก', 'ข', 'ค', 'ง'] as const

export function CiteLookup({ light = false }: { light?: boolean } = {}) {
  const client = useClient()
  const [volume, setVolume] = useState('')
  const [part, setPart] = useState('')
  const [cls, setCls] = useState<string>('ง')
  const [special, setSpecial] = useState(false)
  const [page, setPage] = useState('')
  const [st, setSt] = useState<LookupState>({ state: 'idle' })
  const ready = /^\d{1,3}$/.test(volume.trim()) && /^\d{1,4}$/.test(part.trim())

  const submit = (e: Event) => {
    e.preventDefault()
    if (!ready) return
    setSt({ state: 'busy' })
    const c = {
      volume: Number(volume),
      part: `${Number(part)} ${cls}${special ? ' พิเศษ' : ''}`,
      page: /^\d{1,4}$/.test(page.trim()) ? Number(page) : null,
    }
    void client
      .byCitation(c)
      .then((hit) => {
        if (hit) location.hash = hrefFor(client.source).doc(hit.doc.id, hit.month)
        else
          setSt({
            state: 'missing',
            message: `ไม่พบฉบับที่ เล่ม ${c.volume} ตอน${special ? 'พิเศษ' : 'ที่'} ${Number(part)} ${cls} — ลองตรวจเลขอีกครั้ง หรือปีนั้นอาจยังไม่มีในเว็บนี้`,
          })
      })
      .catch(() => {
        setSt({ state: 'missing', message: 'เปิดไม่สำเร็จ ลองใหม่อีกครั้ง' })
      })
  }

  return (
    <form class={`cite-lookup${light ? ' light' : ''}`} onSubmit={submit}>
      <div class="fields">
        <label>
          <span>เล่ม</span>
          <input
            inputMode="numeric"
            value={volume}
            size={4}
            placeholder="141"
            onInput={(e) => {
              setVolume((e.target as HTMLInputElement).value)
            }}
          />
        </label>
        <label>
          <span>ตอนที่</span>
          <input
            inputMode="numeric"
            value={part}
            size={4}
            placeholder="17"
            onInput={(e) => {
              setPart((e.target as HTMLInputElement).value)
            }}
          />
        </label>
        <label>
          <span>ตอน ก/ข/ค/ง</span>
          <select
            value={cls}
            onChange={(e) => {
              setCls((e.target as HTMLSelectElement).value)
            }}
          >
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label class="check inline">
          <input
            type="checkbox"
            checked={special}
            onChange={(e) => {
              setSpecial((e.target as HTMLInputElement).checked)
            }}
          />
          <span>ตอนพิเศษ</span>
        </label>
        <label>
          <span>หน้า</span>
          <input
            inputMode="numeric"
            value={page}
            size={4}
            placeholder="4"
            onInput={(e) => {
              setPage((e.target as HTMLInputElement).value)
            }}
          />
        </label>
        <button class="btn primary" type="submit" disabled={!ready || st.state === 'busy'}>
          {st.state === 'busy' ? 'กำลังค้น…' : 'เปิดเอกสาร'}
        </button>
      </div>
      <p class="note" role="status">
        {st.state === 'missing'
          ? st.message
          : 'ใส่เลขหน้าเพื่อเปิดฉบับที่เริ่มต้นที่หน้านั้นพอดี หรือฉบับก่อนหน้าที่สุดในตอนเดียวกัน — ไม่ทราบก็เว้นว่างได้'}
      </p>
    </form>
  )
}
