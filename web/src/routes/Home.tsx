import { useLoad } from '../data/context'
import { thaiDate } from '../lib/thai'
import { href } from '../router'
import { STAGE } from './Doc'
import {
  Bars,
  DocRow,
  ErrorBox,
  FeedLink,
  Kicker,
  Loading,
  Metric,
  Sparkline,
  actionName,
  govName,
  topicName,
} from '../ui/bits'

export function Home() {
  const st = useLoad(async (c) => {
    const [home, tax, meta] = await Promise.all([c.home(), c.taxonomy(), c.meta()])
    return { home, tax, meta }
  }, [])
  if (st.state === 'loading') return <Loading what="ราชกิจจาฯ วันนี้" />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  const { home, tax, meta } = st.data
  const rules = Object.entries(home.by_action)
    .filter(([k]) => ['rulemaking', 'amendment', 'repeal'].includes(k))
    .reduce((s, [, n]) => s + n, 0)
  const local = (home.by_govlevel['local'] ?? 0) + (home.by_govlevel['provincial'] ?? 0)
  const bankrupt = Object.values(home.bankruptcy_stages).reduce((s, n) => s + n, 0)
  const topics = Object.entries(home.by_topic).slice(0, 6)
  return (
    <>
      <Kicker>
        ฉบับล่าสุด · {thaiDate(home.latest_date)} · เล่ม {home.volume ?? '—'} · {home.parts.length} ตอน
      </Kicker>
      <h1 style="margin:6px 0 20px">วันนี้ในราชกิจจานุเบกษา</h1>
      <div class="grid metrics" data-testid="today-metrics">
        <Metric label="ฉบับใหม่" value={home.count} hint={`${home.parts.length} ตอน`} />
        <Metric label="กฎ ระเบียบ ข้อบังคับ" value={rules} hint="ยืนยันจากประเภทเอกสาร" />
        <Metric label="ท้องถิ่นและจังหวัด" value={local} hint={`${home.provinces} จังหวัด`} />
        <Metric
          label="คดีล้มละลาย"
          value={bankrupt}
          hint={Object.entries(home.bankruptcy_stages)
            .slice(0, 1)
            .map(([s, n]) => `${STAGE[s] ?? s} ${n}`)
            .join('')}
        />
      </div>
      <div style="margin:18px 0 28px">
        <Sparkline points={home.sparkline} />
        <div class="muted" style="font-size:.8rem">
          ฉบับต่อวัน 30 วันล่าสุด
        </div>
      </div>
      <div class="two">
        <section aria-labelledby="h-topics">
          <h2 id="h-topics" style="font-size:1.1rem;margin-bottom:10px">
            หัวข้อของวัน
          </h2>
          {topics.length ? (
            <Bars
              rows={topics}
              total={home.count}
              nameOf={(k) => topicName(tax, k)}
              hrefOf={(k) => href.topic(k)}
            />
          ) : (
            <p class="muted">ไม่มีป้ายที่ยืนยันได้ในวันนี้</p>
          )}
          <p style="margin-top:14px">
            <a href={href.explore()}>สำรวจทั้ง {Object.keys(tax.topics).length} หมวด →</a>
          </p>
          <h2 style="font-size:1.1rem;margin:24px 0 10px">ระดับผู้ออก</h2>
          <Bars
            rows={Object.entries(home.by_govlevel)}
            total={home.count}
            nameOf={(k) => govName(tax, k)}
            hrefOf={(k) => href.explore({ govlevel: k })}
          />
        </section>
        <section aria-labelledby="h-rules">
          <div class="row" style="align-items:baseline;margin-bottom:8px">
            <h2 id="h-rules" style="font-size:1.1rem">
              กฎใหม่ของวัน
            </h2>
            <FeedLink path="topic/public_admin" />
          </div>
          {home.highlights.length === 0 && (
            <p class="muted">
              วันนี้ไม่มีกฎ ระเบียบ หรือข้อบังคับใหม่ — มีแต่ประกาศและคำสั่ง ด้านล่างคือฉบับเด่นของวัน
            </p>
          )}
          <div class="doclist">
            {(home.highlights.length ? home.highlights : (home.latest ?? [])).map((d) => (
              <DocRow key={d.id} d={d} tax={tax} month={home.latest_date?.slice(0, 7)} />
            ))}
          </div>
          <p class="muted" style="margin-top:14px;font-size:.85rem">
            ประเภทการกระทำที่พบวันนี้:{' '}
            {Object.entries(home.by_action)
              .map(([k, n]) => `${actionName(tax, k)} ${n}`)
              .join(' · ')}
          </p>
        </section>
      </div>
      <p class="muted" style="margin-top:40px;font-size:.85rem">
        คลังทั้งหมด {meta.docs.toLocaleString('th-TH')} ฉบับ ({meta.years[0]}–
        {meta.years[meta.years.length - 1]}) · ติดป้ายแล้ว {Math.round((100 * meta.labelled) / meta.docs)}% ·
        สร้างเมื่อ {meta.generated_at.slice(0, 16).replace('T', ' ')}
      </p>
    </>
  )
}
