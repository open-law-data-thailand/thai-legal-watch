/** "ติดตาม" — every feed this site publishes, in one place.
 *
 *  A feed is the only way to follow the gazette without opening it: the reader's own software
 *  polls and tells them. There are ~480 of them, so the page is ordered by how most people will
 *  arrive — the whole gazette, then its four series, then the narrow subjects — and everything
 *  below the fold is behind one filter box. */
import { useMemo, useState } from 'preact/hooks'
import { useClient, useHref, useLoad } from '../data/context'
import type { FeedItem } from '../data/types'
import { Crumbs } from '../ui/Crumbs'
import { ErrorBox, Kicker, Loading } from '../ui/bits'
import { CopyButton } from '../ui/CopyButton'
import { FeedLink, FeedlyButton, ONE_CLICK, RssMark } from '../ui/rss'

const GROUPS: { id: FeedItem['group']; label: string; blurb: string }[] = [
  { id: 'topic', label: 'ตามหัวข้อ', blurb: 'สิ่งแวดล้อม ภาษี ที่ดิน สาธารณสุข และอีก 70 กว่าหมวด' },
  { id: 'province', label: 'ตามจังหวัด', blurb: 'ผังเมือง ป่าสงวน เขตเลือกตั้ง และประกาศของผู้ว่าฯ' },
  { id: 'agency', label: 'ตามหน่วยงาน', blurb: 'เฉพาะหน่วยงานที่ออกเอกสารตั้งแต่ 50 ฉบับขึ้นไป' },
]

/** An absolute URL, because a feed address is meant to be pasted into another program. */
function absolute(url: string): string {
  if (typeof location === 'undefined') return url
  return new URL(url, `${location.origin}${location.pathname}`).href
}

function Actions({ url, name }: { url: string; name: string }) {
  return (
    <div class="feedrow-actions">
      <CopyButton text={url} label="คัดลอกลิงก์" done="คัดลอกแล้ว" />
      <FeedlyButton feed={url} name={name} />
      <FeedLink feed={url} name={name} />
    </div>
  )
}

function FeedRow({ feed, url, to }: { feed: FeedItem; url: string; to?: string }) {
  return (
    <li class="feedrow">
      <div class="feedrow-main">
        {to ? <a href={to}>{feed.title}</a> : <span>{feed.title}</span>}
        <span class="feedrow-n">{feed.n.toLocaleString('th-TH')} ฉบับ</span>
        {feed.note && <span class="feedrow-note">{feed.note}</span>}
      </div>
      <Actions url={url} name={feed.title} />
    </li>
  )
}

export function Feeds() {
  const href = useHref()
  const client = useClient()
  const st = useLoad(async (c) => (await c.feeds()).feeds, [])
  const [filter, setFilter] = useState('')
  const url = useMemo(() => (id: string) => absolute(client.feedUrl(id)), [client])
  if (st.state === 'loading') return <Loading what="รายการติดตาม" />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  const feeds = st.data
  const main = feeds.find((f) => f.group === 'main')
  const parts = feeds.filter((f) => f.group === 'part')
  const needle = filter.replace(/\s+/g, '')
  const match = (f: FeedItem) => !needle || f.title.replace(/\s+/g, '').includes(needle)
  // the id says which page a feed belongs to, so the row can link to it without a second index
  const pageFor = (f: FeedItem): string | undefined => {
    const rest = f.id.slice(f.id.indexOf('/') + 1)
    if (f.group === 'topic') return href.topic(rest)
    if (f.group === 'agency') return href.agency(rest)
    if (f.group === 'province') return href.province(rest)
    return undefined
  }
  return (
    <>
      <Crumbs items={[{ label: 'ติดตาม' }]} />
      <Kicker>ติดตาม</Kicker>
      <h1 style="margin:6px 0 10px">ให้ราชกิจจานุเบกษามาหาคุณเอง</h1>
      <p style="max-width:70ch">
        ทุกอย่างในหน้านี้เป็นลิงก์ที่โปรแกรมอ่านข่าวดูดไปเองได้ ไม่ต้องเข้าเว็บนี้ทุกวัน ไม่ต้องสมัคร
        ไม่ต้องให้อีเมล และเราไม่รู้ว่าใครติดตามอะไร — เป็นไฟล์ธรรมดาไฟล์หนึ่ง ที่โปรแกรมของคุณไปดึงเอง
      </p>

      {main && (
        <section class="card feed-hero" style="margin:20px 0">
          <div>
            <Kicker>ตัวหลัก</Kicker>
            <h2 style="margin:4px 0 6px">
              <RssMark size={20} /> {main.title}
            </h2>
            <p style="margin:0 0 12px;max-width:62ch">
              ทุกฉบับที่ประกาศใหม่ ไม่แยกหมวด เก็บ {main.entries.toLocaleString('th-TH')} รายการล่าสุด
              ซึ่งครอบคลุมเกินหนึ่งวันของราชกิจจานุเบกษาในวันปกติ แต่ละรายการมีพิกัด เล่ม/ตอน/หน้า
              มาให้พร้อมอ้างอิง
            </p>
            <div class="feedrow-actions">
              <FeedlyButton feed={url(main.id)} name={main.title} />
              <CopyButton text={url(main.id)} label="คัดลอกลิงก์" done="คัดลอกแล้ว" />
              <a class="btn btn-quiet" href={url(main.id)} target="_blank" rel="noreferrer">
                เปิดดูไฟล์
              </a>
              <a class="btn btn-quiet" href={href.latest()}>
                หรือดูบนเว็บ
              </a>
            </div>
            <p class="muted" style="margin:10px 0 0">
              หรือเพิ่มเข้าตัวอื่น:{' '}
              {ONE_CLICK.slice(1).map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ' · '}
                  <a href={r.url(url(main.id))} target="_blank" rel="noreferrer">
                    {r.label}
                  </a>
                </span>
              ))}
            </p>
          </div>
        </section>
      )}

      {parts.length > 0 && (
        <section style="margin:26px 0">
          <h2 style="margin:0 0 4px">แยกตามฉบับ</h2>
          <p class="muted" style="margin:0 0 12px;max-width:70ch">
            ราชกิจจานุเบกษาพิมพ์แยกเป็นสี่ฉบับและนับเลขตอนแยกกัน ถ้าสนใจเฉพาะกฎหมายที่ออกใหม่ ให้ตามฉบับ ก
            อย่างเดียว — เพราะฉบับ ง คิดเป็นเกือบทั้งหมดของปริมาณ ตามทุกฉบับแล้วจะกลบสิ่งที่อยากอ่านจริง
          </p>
          <ul class="feedlist">
            {parts.map((f) => (
              <FeedRow key={f.id} feed={f} url={url(f.id)} />
            ))}
          </ul>
        </section>
      )}

      <section style="margin:26px 0">
        <h2 style="margin:0 0 10px">แยกตามเรื่องที่สนใจ</h2>
        <label class="check" style="max-width:34rem;width:100%">
          <span class="sr-only">กรองชื่อหัวข้อ จังหวัด หรือหน่วยงาน</span>
          <input
            type="search"
            class="provfilter"
            value={filter}
            placeholder="พิมพ์ชื่อหัวข้อ จังหวัด หรือหน่วยงาน"
            onInput={(e) => {
              setFilter((e.target as HTMLInputElement).value)
            }}
          />
        </label>
        {GROUPS.map(({ id, label, blurb }) => {
          const rows = feeds.filter((f) => f.group === id && match(f))
          return (
            <div key={id} style="margin:18px 0">
              <h3 style="margin:0 0 2px">
                {label}{' '}
                <span class="muted" style="font-weight:400">
                  ({rows.length.toLocaleString('th-TH')})
                </span>
              </h3>
              <p class="muted" style="margin:0 0 8px">
                {blurb}
              </p>
              {rows.length === 0 ? (
                <p class="muted">ไม่มีรายการที่ตรงกับคำค้น</p>
              ) : (
                <ul class="feedlist">
                  {rows.map((f) => (
                    <FeedRow key={f.id} feed={f} url={url(f.id)} to={pageFor(f)} />
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </section>

      <section class="card" style="margin:26px 0">
        <h2 style="margin:0 0 8px">
          <RssMark size={18} /> ยังไม่เคยใช้ RSS?
        </h2>
        <p style="margin:0 0 14px;max-width:70ch">
          RSS คือวิธีติดตามเว็บที่มีมาก่อนโซเชียลมีเดีย และยังเหมาะกับเรื่องแบบนี้ที่สุด
          เพราะไม่มีอัลกอริทึมมาคัดว่าคุณควรเห็นอะไร ได้ครบทุกฉบับตามลำดับเวลา
          และไม่ต้องบอกใครว่าคุณสนใจกฎหมายเรื่องไหน
        </p>

        <h3 style="margin:0 0 6px">วิธีที่เร็วที่สุด</h3>
        <p style="margin:0 0 14px;max-width:70ch">
          กดปุ่ม <b>+ Feedly</b> ที่รายการไหนก็ได้ในหน้านี้ Feedly จะเปิดหน้าถามยืนยันขึ้นมาให้กดรับ
          ถ้ายังไม่มีบัญชีจะให้สมัครก่อน (ฟรี) จากนั้นฉบับใหม่จะไปโผล่ในนั้นเอง ปุ่มนี้แค่พาไปหน้าเว็บของ
          Feedly พร้อมที่อยู่ไฟล์ — เราไม่ได้ส่งอะไรเกี่ยวกับคุณไปด้วย
        </p>

        <h3 style="margin:0 0 6px">ถ้าใช้โปรแกรมอื่น</h3>
        <ol style="margin:0 0 14px;max-width:70ch;padding-left:1.2em">
          <li>กด "คัดลอกลิงก์" ที่รายการที่อยากตาม</li>
          <li>เปิดโปรแกรมอ่าน RSS แล้วหาเมนูเพิ่มแหล่งข่าว (Add feed / Subscribe / เพิ่มฟีด)</li>
          <li>วางลิงก์ลงไป</li>
        </ol>
        <p class="muted" style="margin:0 0 14px;max-width:70ch">
          โปรแกรมที่คนใช้กันเยอะ: <b>Feedly</b> และ <b>Inoreader</b> (เว็บ + แอปมือถือ ฟรี) ·{' '}
          <b>NetNewsWire</b> (Mac / iPhone ฟรี ไม่มีบัญชี) · <b>Thunderbird</b> (คอมพิวเตอร์ ฟรี) · ถ้าทีมใช้{' '}
          <b>Slack</b> พิมพ์ <code>/feed subscribe</code> แล้วตามด้วยลิงก์ ได้เลยในห้องแชท
        </p>

        <h3 style="margin:0 0 6px">ควรตามอันไหนดี</h3>
        <ul style="margin:0 0 14px;max-width:70ch;padding-left:1.2em">
          <li>
            <b>อยากรู้ว่ามีอะไรออกใหม่บ้างทุกวัน</b> — ตัวหลักด้านบน ได้ครบทุกฉบับ วันละร้อยกว่าฉบับ
          </li>
          <li>
            <b>สนใจเฉพาะกฎหมายใหม่</b> — ฉบับกฤษฎีกา (ก) วันละประมาณหนึ่งฉบับ ไม่ถูกประกาศทั่วไปกลบ
          </li>
          <li>
            <b>ดูแลเรื่องใดเรื่องหนึ่งหรือพื้นที่ใดพื้นที่หนึ่ง</b> — เลือกจากหัวข้อ จังหวัด หรือหน่วยงาน
            จะเงียบกว่ามากและตรงกับงานมากกว่า
          </li>
        </ul>
        <p class="muted" style="margin:0;max-width:70ch">
          ไฟล์เป็นรูปแบบ Atom ซึ่งโปรแกรมอ่าน RSS รองรับทุกตัว อัปเดตคืนละครั้งหลังเว็บสร้างข้อมูลใหม่
          แต่ละรายการมีทั้งชื่อเรื่องและพิกัด เล่ม/ตอน/หน้า ให้คัดลอกไปอ้างอิงได้ทันทีโดยไม่ต้องเปิดเว็บ
        </p>
      </section>
    </>
  )
}
