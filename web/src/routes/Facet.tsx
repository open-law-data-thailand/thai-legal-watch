/** Topic, agency and province pages share one shape: a Facet with counts, agencies, provinces and recent docs. */
import { useLoad } from '../data/context'
import type { AgencyPage, Facet, ProvincePage, Taxonomy } from '../data/types'
import { href } from '../router'
import {
  Bars,
  DocRow,
  ErrorBox,
  FeedLink,
  Kicker,
  Loading,
  Metric,
  actionName,
  govName,
  topicName,
} from '../ui/bits'

export function mainAction(f: Facet, t: Taxonomy | undefined): string {
  const [slug, n] = Object.entries(f.by_action)[0] ?? []
  if (!slug || !n || n < f.total * 0.2) return 'ยืนยันได้น้อยเกินไป'
  return actionName(t, slug)
}
export function mainActionHint(f: Facet): string | undefined {
  const n = Object.values(f.by_action).reduce((s, x) => s + x, 0)
  return f.total ? `ยืนยันแล้ว ${Math.round((100 * n) / f.total)}% ของฉบับ` : undefined
}

function YearBars({ f }: { f: Facet }) {
  const rows = Object.entries(f.by_year)
  const max = Math.max(1, ...rows.map(([, n]) => n))
  return (
    <div class="spark" style="height:72px" role="img" aria-label={`ฉบับต่อปี ${rows.length} ปี`}>
      {rows.map(([y, n]) => (
        <i
          key={y}
          style={`height:${Math.round((100 * n) / max)}%`}
          title={`${Number(y) + 543}: ${n.toLocaleString('th-TH')}`}
        />
      ))}
    </div>
  )
}

function FacetBody({
  f,
  kind,
  feed,
  explore,
}: {
  f: Facet
  kind: 'topic' | 'agency' | 'province'
  feed?: string
  explore: Record<string, string>
}) {
  const tax = useLoad((c) => c.taxonomy(), [])
  const agencies = useLoad(async (c) => new Map((await c.agencies()).map((a) => [a.id, a.name])), [])
  const t = tax.state === 'ok' ? tax.data : undefined
  const years = Object.keys(f.by_year)
  return (
    <>
      <div class="grid metrics" style="margin:16px 0 20px">
        <Metric
          label="ฉบับทั้งหมด"
          value={f.total}
          hint={
            years.length ? `${Number(years[0]) + 543}–${Number(years[years.length - 1]) + 543}` : undefined
          }
        />
        {kind === 'agency' ? (
          <Metric label="ประเภท" value={(f as { type?: string | null }).type ?? '—'} />
        ) : (
          <Metric label="หน่วยงานที่ออก" value={f.agencies.length >= 50 ? '50+' : f.agencies.length} />
        )}
        <Metric label="จังหวัด" value={Object.keys(f.provinces).length} />
        <Metric label="การกระทำหลัก" value={mainAction(f, t)} hint={mainActionHint(f)} />
      </div>
      <YearBars f={f} />
      <div class="muted" style="font-size:.8rem;margin-bottom:24px">
        ฉบับต่อปี (นับเฉพาะหมวดที่ยืนยัน)
      </div>
      <div class="two">
        <section>
          {kind !== 'topic' && (
            <>
              <h2 style="font-size:1.05rem;margin-bottom:8px">หัวข้อ</h2>
              <Bars
                rows={Object.entries(f.by_topic).slice(0, 10)}
                total={f.total}
                nameOf={(k) => topicName(t, k)}
                hrefOf={(k) => href.topic(k)}
              />
            </>
          )}
          <h2 style="font-size:1.05rem;margin:18px 0 8px">การกระทำ</h2>
          <Bars rows={Object.entries(f.by_action)} total={f.total} nameOf={(k) => actionName(t, k)} />
          <h2 style="font-size:1.05rem;margin:18px 0 8px">ระดับผู้ออก</h2>
          <Bars rows={Object.entries(f.by_govlevel)} total={f.total} nameOf={(k) => govName(t, k)} />
          {kind !== 'agency' && f.agencies.length > 0 && (
            <>
              <h2 style="font-size:1.05rem;margin:18px 0 8px">หน่วยงานที่ออกมากสุด</h2>
              <Bars
                rows={f.agencies.slice(0, 12).map((a) => [a.id, a.n] as [string, number])}
                nameOf={(k) => f.agencies.find((a) => a.id === k)?.name ?? k}
                hrefOf={(k) => href.agency(k)}
              />
            </>
          )}
          {kind !== 'province' && Object.keys(f.provinces).length > 0 && (
            <>
              <h2 style="font-size:1.05rem;margin:18px 0 8px">จังหวัด</h2>
              <Bars
                rows={Object.entries(f.provinces).slice(0, 12)}
                nameOf={(k) => k}
                hrefOf={(k) => href.province(k)}
              />
            </>
          )}
        </section>
        <section>
          <div class="row" style="align-items:baseline;margin-bottom:8px">
            <h2 style="font-size:1.05rem">ล่าสุด</h2>
            <span style="display:flex;gap:8px">
              {feed && <FeedLink path={feed} />}
              <a class="btn" href={href.explore(explore)}>
                สำรวจทั้งหมด →
              </a>
            </span>
          </div>
          <div class="doclist" data-testid="recent">
            {f.recent.map((d) => (
              <DocRow
                key={d.id}
                d={d}
                tax={t}
                agencyName={
                  kind !== 'agency' && d.a && agencies.state === 'ok' ? agencies.data.get(d.a) : null
                }
              />
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

export function Topic({ slug }: { slug: string }) {
  const st = useLoad(async (c) => ({ page: await c.topic(slug), tax: await c.taxonomy() }), [slug])
  if (st.state === 'loading') return <Loading />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  const { page, tax } = st.data
  const crumbs: string[] = []
  for (let cur = page.parent; cur; cur = tax.topics[cur]?.parent ?? null) crumbs.unshift(cur)
  return (
    <>
      <Kicker>
        หมวด{crumbs.length ? ' · ' : ''}
        {crumbs.map((s, i) => (
          <span key={s}>
            {i > 0 && ' › '}
            <a href={href.topic(s)}>{topicName(tax, s)}</a>
          </span>
        ))}
      </Kicker>
      <h1 style="margin-top:6px">{page.thai ?? page.slug}</h1>
      {page.children.length > 0 && (
        <p class="chips" style="margin-top:10px">
          {page.children.map((s) => (
            <a key={s} class="chip" href={href.topic(s)}>
              {topicName(tax, s)} <span class="muted">{(tax.topics[s]?.n ?? 0).toLocaleString('th-TH')}</span>
            </a>
          ))}
        </p>
      )}
      <FacetBody f={page} kind="topic" feed={`topic/${page.slug}`} explore={{ topic: page.slug }} />
    </>
  )
}

export function Agency({ id }: { id: string }) {
  const st = useLoad((c) => c.agency(id), [id])
  if (st.state === 'loading') return <Loading />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  const page: AgencyPage = st.data
  return (
    <>
      <Kicker>หน่วยงาน{page.type ? ` · ${page.type}` : ''}</Kicker>
      <h1 style="margin-top:6px">{page.name}</h1>
      <FacetBody
        f={page}
        kind="agency"
        feed={page.total >= 50 ? `agency/${page.id}` : undefined}
        explore={{ agency: page.id }}
      />
    </>
  )
}

export function Province({ file }: { file: string }) {
  const st = useLoad((c) => c.province(file), [file])
  if (st.state === 'loading') return <Loading />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  const page: ProvincePage = st.data
  return (
    <>
      <Kicker>ท้องถิ่นฉัน · จังหวัด</Kicker>
      <h1 style="margin-top:6px">{page.name}</h1>
      <FacetBody f={page} kind="province" feed={`province/${file}`} explore={{ province: page.name }} />
    </>
  )
}
