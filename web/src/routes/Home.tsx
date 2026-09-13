import { useLoad } from '../data/context'
import { thaiDate } from '../lib/thai'
import { href } from '../router'
import {
  Bars,
  DocRow,
  ErrorBox,
  FeedLink,
  Loading,
  Metric,
  Sparkline,
  actionName,
  govName,
  topicName,
} from '../ui/bits'
import { QuickSearch } from '../ui/QuickSearch'
import { STAGE } from './Doc'

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
  const list = home.highlights.length ? home.highlights : (home.latest ?? [])
  return (
    <>
      <section class="hero" aria-labelledby="hero-h">
        <div class="hero-text">
          <div class="kicker light">สำหรับนักกฎหมายและผู้ที่ต้องตามราชกิจจานุเบกษาทุกวัน</div>
          <h1 id="hero-h">
            ราชกิจจานุเบกษา
            <br />
            อ่านเป็นหมวด ติดตามเป็นเรื่อง
          </h1>
          <p>
            ทุกฉบับที่ประกาศถูกจำแนกอัตโนมัติว่า <em>เรื่องอะไร</em> · <em>ทำอะไร</em> · <em>ใครออก</em>{' '}
            พร้อมเล่ม ตอน หน้า ให้อ้างอิงได้ทันที ค้นย้อนหลัง{' '}
            {meta.years[0] ? Number(meta.years[0]) + 543 : ''}–
            {Number(meta.years[meta.years.length - 1]) + 543} ได้ {meta.docs.toLocaleString('th-TH')} ฉบับ
            และติดตามหมวด จังหวัด หรือหน่วยงานที่คุณดูแลผ่าน RSS
          </p>
          <div class="hero-search">
            <QuickSearch big />
          </div>
          <div class="hero-links">
            <a
              class="btn primary"
              href={href.explore({ scope: 'year', year: meta.years[meta.years.length - 1] ?? '' })}
            >
              สำรวจปีนี้ →
            </a>
            <a class="btn" href={href.graph()}>
              แผนที่ความสัมพันธ์
            </a>
            <a class="btn" href={href.dashboard()}>
              ตัวเลข 22 ปี
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
          <div class="muted light" style="font-size:.8rem">
            ฉบับต่อวัน 30 วันล่าสุด
          </div>
        </div>
      </section>
      <div class="two" style="margin-top:36px">
        <section aria-labelledby="h-topics">
          <h2 id="h-topics" class="sec">
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
            <p class="muted">ไม่มีหมวดที่ยืนยันได้ในวันนี้</p>
          )}
          <p style="margin-top:14px">
            <a href={href.explore()}>สำรวจทั้ง {Object.keys(tax.topics).length} หมวด →</a>
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
              วันนี้ไม่มีกฎ ระเบียบ หรือข้อบังคับใหม่ — มีแต่ประกาศและคำสั่ง
              ด้านล่างคือฉบับเด่นที่ยืนยันหมวดได้
            </p>
          )}
          <div class="doclist">
            {list.map((d) => (
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
        {meta.years[meta.years.length - 1]}) · จำแนกหมวดแล้ว {Math.round((100 * meta.labelled) / meta.docs)}%
        · สร้างเมื่อ {meta.generated_at.slice(0, 16).replace('T', ' ')}
      </p>
    </>
  )
}
