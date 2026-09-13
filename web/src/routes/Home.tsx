import { useLoad } from '../data/context'
import { beRange, beYear, percent, thaiDate } from '../lib/thai'
import { useHref } from '../data/context'
import {
  Bars,
  DocRow,
  ErrorBox,
  FeedLink,
  Loading,
  Metric,
  Sparkline,
  StaleNotice,
  actionName,
  govName,
  topicName,
} from '../ui/bits'
import { CiteLookup } from '../ui/CiteLookup'
import { QuickSearch } from '../ui/QuickSearch'
import { STAGE } from './Doc'

export function Home() {
  const href = useHref()
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
  const list = home.highlights.length ? home.highlights : (home.latest ?? [])
  return (
    <>
      <StaleNotice generatedAt={meta.generated_at} />
      <section class="hero" aria-labelledby="hero-h">
        <div class="hero-text">
          <div class="kicker light">สำหรับนักกฎหมายและคนทำงานที่ต้องตามราชกิจจานุเบกษาทุกวัน</div>
          <h1 id="hero-h">
            ราชกิจจานุเบกษา
            <br />
            อ่านเป็นหมวด ติดตามเป็นเรื่อง
          </h1>
          <p>
            ทุกฉบับที่ประกาศ จะถูกจำแนกให้อัตโนมัติว่า <em>เรื่องอะไร</em> · <em>ทำอะไร</em> · <em>ใครออก</em>{' '}
            พร้อมเล่ม ตอน หน้า ที่หยิบไปอ้างอิงได้ทันที ค้นย้อนหลังได้ถึง พ.ศ.{' '}
            {meta.years[0] ? beYear(meta.years[0]) : '—'} รวม {meta.docs.toLocaleString('th-TH')} ฉบับ
            และติดตามหมวด จังหวัด หรือหน่วยงานที่คุณรับผิดชอบผ่าน RSS ได้โดยไม่ต้องสมัครสมาชิก
          </p>
          <div class="hero-search">
            <QuickSearch big />
          </div>
          <details class="hero-cite">
            <summary>มีเลขอ้างอิงอยู่แล้ว — เปิดจากเล่ม ตอน หน้า</summary>
            <CiteLookup light />
          </details>
          <div class="hero-links">
            <a
              class="btn primary"
              href={href.explore({
                scope: 'month',
                month: home.latest_date?.slice(0, 7) ?? '',
              })}
            >
              สำรวจเดือนนี้ →
            </a>
            <a class="btn" href={href.provinces()}>
              ท้องถิ่นฉัน
            </a>
            <a class="btn" href={href.graph()}>
              ความสัมพันธ์ของหมวด
            </a>
            <a class="btn" href={href.dashboard()}>
              ตัวเลขย้อนหลัง {meta.years.length} ปี
            </a>
          </div>
        </div>
        <div class="hero-side">
          <div class="kicker light">
            ฉบับล่าสุด · {thaiDate(home.latest_date)} · เล่ม {home.volume ?? '—'} · {home.parts.length} ตอน
          </div>
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
          <Sparkline points={home.sparkline} />
        </div>
      </section>
      <div class="two" style="margin-top:36px">
        <section aria-labelledby="h-topics">
          <h2 id="h-topics" class="sec">
            หมวดของวันนี้
          </h2>
          {topics.length ? (
            <Bars
              rows={topics}
              total={home.count}
              nameOf={(k) => topicName(tax, k)}
              hrefOf={(k) => href.topic(k)}
            />
          ) : (
            <p class="muted">วันนี้ยังไม่มีฉบับที่ยืนยันหมวดได้</p>
          )}
          <p style="margin-top:14px">
            <a href={href.explore()}>ดูทั้ง {Object.keys(tax.topics).length} หมวด →</a>
          </p>
          <h2 class="sec" style="margin-top:28px">
            ระดับผู้ออก
          </h2>
          <Bars
            rows={Object.entries(home.by_govlevel)}
            total={home.count}
            nameOf={(k) => govName(tax, k)}
            hrefOf={(k) => href.explore({ govlevel: k })}
          />
        </section>
        <section aria-labelledby="h-rules">
          <div class="row" style="align-items:baseline;margin-bottom:8px">
            <h2 id="h-rules" class="sec">
              {home.highlights.length ? 'กฎใหม่ของวัน' : 'ฉบับเด่นของวัน'}
            </h2>
            <FeedLink path="topic/public_admin" />
          </div>
          {home.highlights.length === 0 && (
            <p class="muted">
              วันนี้ไม่มีกฎ ระเบียบ หรือข้อบังคับใหม่ มีแต่ประกาศและคำสั่ง
              ด้านล่างคือฉบับที่จำแนกหมวดได้ชัดเจนที่สุดของวัน
            </p>
          )}
          <div class="doclist">
            {list.map((d) => (
              <DocRow key={d.id} d={d} tax={tax} month={home.latest_date?.slice(0, 7)} />
            ))}
          </div>
          <p class="muted" style="margin-top:14px;font-size:.85rem">
            สิ่งที่เอกสารวันนี้ทำ:{' '}
            {Object.entries(home.by_action)
              .map(([k, n]) => `${actionName(tax, k)} ${n}`)
              .join(' · ')}
          </p>
        </section>
      </div>
      <p class="muted" style="margin-top:40px;font-size:.85rem">
        ทั้งเว็บมี {meta.docs.toLocaleString('th-TH')} ฉบับ (พ.ศ. {beRange(meta.years)}) · จำแนกหมวดได้{' '}
        {percent(meta.labelled, meta.docs)} · ปรับปรุงข้อมูลล่าสุด{' '}
        {(meta.generated_at || '').slice(0, 16).replace('T', ' ') || '—'} น.
      </p>
    </>
  )
}
