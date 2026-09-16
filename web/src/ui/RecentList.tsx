/** The newest documents, newest first, fifty at a time.
 *
 *  The front page starts from `agg/recent.json`, which holds the newest 500 and is small enough
 *  to load on the page everybody lands on. Someone who keeps pressing past those has shown they
 *  want the whole window, so the next press fetches `agg/latest.json` — 90 days, 9 MB — once, and
 *  paging carries on from where it was. Nobody pays for that download by arriving. */
import { useMemo, useState } from 'preact/hooks'
import { useClient, useHref } from '../data/context'
import type { SlimDoc, Taxonomy } from '../data/types'
import { coordinates, thaiDate } from '../lib/thai'
import { displayTitle, LabelPills } from './bits'

export const PAGE = 50

export function RecentList({
  seed,
  tax,
  agencies,
  windowDays,
  exploreHref,
}: {
  seed: SlimDoc[]
  tax: Taxonomy
  agencies: Map<string, string>
  windowDays: number
  exploreHref: string
}) {
  const client = useClient()
  const [docs, setDocs] = useState(seed)
  const [shown, setShown] = useState(PAGE)
  // 'seed' while only the small file is loaded, 'all' once the 90-day window is in hand
  const [depth, setDepth] = useState<'seed' | 'loading' | 'all' | 'failed'>('seed')
  const rows = useMemo(() => docs.slice(0, shown), [docs, shown])

  const more = () => {
    if (shown + PAGE <= docs.length || depth !== 'seed') {
      setShown((n) => n + PAGE)
      return
    }
    // the small file is spent: take the window once, then keep paging through it
    setDepth('loading')
    client.latest().then(
      (latest) => {
        setDocs(latest.docs)
        setDepth('all')
        setShown((n) => n + PAGE)
      },
      () => {
        setDepth('failed')
      },
    )
  }

  const exhausted = shown >= docs.length && depth === 'all'
  return (
    <>
      <div class="doclist" data-testid="recent">
        {rows.map((d, i) => (
          <Row key={d.id} d={d} tax={tax} agency={agencies.get(d.a ?? '')} newDay={d.d !== rows[i - 1]?.d} />
        ))}
      </div>
      <p style="margin-top:18px">
        {depth === 'failed' ? (
          <span class="muted">
            โหลดเพิ่มไม่สำเร็จ — <a href={exploreHref}>เปิดหน้าล่าสุด {windowDays} วันแทน →</a>
          </span>
        ) : exhausted ? (
          <span class="muted">
            หมดช่วง {windowDays} วันล่าสุดแล้ว — <a href={exploreHref}>ค้นย้อนหลังในหน้าสำรวจ →</a>
          </span>
        ) : (
          <button class="btn" onClick={more} disabled={depth === 'loading'}>
            {depth === 'loading' ? 'กำลังโหลด…' : `แสดงเพิ่มอีก ${PAGE} ฉบับ`}
          </button>
        )}
      </p>
    </>
  )
}

function Row({
  d,
  tax,
  agency,
  newDay,
}: {
  d: SlimDoc
  tax: Taxonomy
  agency: string | undefined
  newDay: boolean
}) {
  const href = useHref()
  const title = displayTitle(d, agency)
  return (
    <>
      {newDay && d.d && (
        <p class="recent-day" aria-hidden="true">
          {thaiDate(d.d)}
        </p>
      )}
      <article class="doc">
        <a class="title" href={href.doc(d.id, d.d?.slice(0, 7))}>
          {title.text}
          {title.missing && <span class="muted notitle"> · ชุดข้อมูลไม่มีชื่อเรื่องของฉบับนี้</span>}
        </a>
        <div class="meta">
          <LabelPills d={d} tax={tax} agencyName={agency} />
          {d.dt && <span>{d.dt}</span>}
          <span>{coordinates({ volume: d.v, part: d.p, page: d.pg, date: d.d })}</span>
        </div>
      </article>
    </>
  )
}
