/** "ท้องถิ่นฉัน" — find your province on the map, then read what was published about it. */
import { useMemo, useState } from 'preact/hooks'
import { useLoad } from '../data/context'
import type { ProvinceIndexItem } from '../data/types'
import { PROVINCES, REGIONS, type Region } from '../lib/provinces'
import { binOf, loadProvinceMap, quantileBins } from '../lib/thaimap'
import { href } from '../router'
import { Crumbs } from '../ui/Crumbs'
import { ErrorBox, Kicker, Loading, Metric } from '../ui/bits'

const BANDS = 5

export function Provinces() {
  const st = useLoad(
    async (c) => ({ list: await c.provinces(), meta: await c.meta(), map: await loadProvinceMap() }),
    [],
  )
  const [filter, setFilter] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  if (st.state === 'loading') return <Loading what="แผนที่จังหวัด" />
  if (st.state === 'error') return <ErrorBox error={st.error} />
  const { list, meta, map } = st.data
  const byName = new Map(list.map((p) => [p.name, p]))
  const withProvince = list.reduce((s, p) => s + p.n, 0)
  const needle = filter.replace(/\s+/g, '')
  const match = (name: string) => !needle || name.includes(needle)
  return (
    <>
      <Crumbs items={[{ label: 'สำรวจ', to: href.explore({ scope: 'all' }) }, { label: 'ท้องถิ่นฉัน' }]} />
      <Kicker>ท้องถิ่นฉัน</Kicker>
      <h1 style="margin:6px 0 10px">จังหวัดของคุณมีอะไรประกาศบ้าง</h1>
      <p style="max-width:70ch">
        ราชกิจจานุเบกษาไม่ได้มีแต่เรื่องส่วนกลาง ผังเมือง เขตควบคุมอาคาร ป่าสงวน เขตเลือกตั้ง
        และประกาศของผู้ว่าราชการจังหวัด ล้วนผูกกับพื้นที่ทั้งนั้น เลือกจังหวัดเพื่อดูว่ามีเรื่องอะไร
        หน่วยงานไหนออก และฉบับล่าสุดคืออะไร พร้อมติดตามต่อด้วย RSS
      </p>
      <div class="grid metrics" style="margin:18px 0 22px">
        <Metric
          label="จังหวัดที่มีเอกสาร"
          value={list.length}
          hint={list.length === 77 ? 'ครบทั้ง 77 จังหวัด' : 'จาก 77 จังหวัด'}
        />
        <Metric
          label="ฉบับที่ระบุจังหวัดได้"
          value={withProvince}
          hint={`${((100 * withProvince) / meta.docs).toFixed(1)}% ของคลัง`}
        />
        <Metric
          label="จังหวัดที่มากที่สุด"
          value={list[0]?.name ?? '—'}
          hint={list[0] ? `${list[0].n.toLocaleString('th-TH')} ฉบับ` : undefined}
        />
      </div>
      <div class="provlayout">
        <section>
          <Choropleth
            map={map}
            byName={byName}
            match={match}
            hover={hover}
            onHover={setHover}
            filtering={needle !== ''}
          />
        </section>
        <section>
          <label class="check" style="margin-bottom:10px;width:100%">
            <span class="sr-only">กรองชื่อจังหวัด</span>
            <input
              type="search"
              value={filter}
              placeholder="พิมพ์ชื่อจังหวัด เช่น ตรัง"
              class="provfilter"
              onInput={(e) => {
                setFilter((e.target as HTMLInputElement).value)
              }}
            />
          </label>
          <ProvinceList byName={byName} match={match} onHover={setHover} />
          {!PROVINCES.some((p) => match(p.name)) && <p class="muted">ไม่พบจังหวัดที่ตรงกับ "{filter}"</p>}
        </section>
      </div>
      <p class="muted" style="font-size:.85rem;margin-top:22px;max-width:75ch">
        <b>ข้อจำกัด</b> จังหวัดของแต่ละฉบับมาจากชื่อหน่วยงานผู้ออกที่ชุดข้อมูลจัดรูปแบบไว้แล้ว
        แต่หน่วยงานท้องถิ่นจำนวนมากไม่มีชื่อจังหวัดกำกับมาตั้งแต่ต้นทาง ฉบับเหล่านั้นจึงไม่ปรากฏบนแผนที่นี้
        ตัวเลขรายจังหวัดจึงหมายถึง "อย่างน้อยเท่านี้" ไม่ใช่ทั้งหมด · เส้นเขตแดนมาจาก{' '}
        <a href="https://www.naturalearthdata.com/">Natural Earth</a> (สาธารณสมบัติ) ย่อส่วนไว้เพื่อการแสดงผล
        ใช้อ้างอิงเขตแดนตามกฎหมายไม่ได้
      </p>
    </>
  )
}

function Choropleth({
  map,
  byName,
  match,
  hover,
  onHover,
  filtering,
}: {
  map: { width: number; height: number; provinces: Record<string, string> }
  byName: Map<string, ProvinceIndexItem>
  match: (name: string) => boolean
  hover: string | null
  onHover: (name: string | null) => void
  filtering: boolean
}) {
  const cuts = useMemo(
    () =>
      quantileBins(
        [...byName.values()].map((p) => p.n),
        BANDS,
      ),
    [byName],
  )
  const shown = hover ? byName.get(hover) : null
  return (
    <div class="provmap" data-testid="province-map">
      <svg
        viewBox={`0 0 ${map.width} ${map.height}`}
        width="100%"
        role="group"
        aria-label="แผนที่ประเทศไทยรายจังหวัด สีเข้มขึ้นตามจำนวนเอกสาร"
      >
        {Object.entries(map.provinces).map(([name, d]) => {
          const item = byName.get(name)
          const dim = filtering && !match(name)
          const cls = `pv b${item ? binOf(item.n, cuts) : 0}${dim ? ' dim' : ''}${hover === name ? ' on' : ''}`
          if (!item) return <path key={name} d={d} class="pv none" />
          return (
            <a
              key={name}
              href={href.province(item.file)}
              aria-label={`${name} ${item.n.toLocaleString('th-TH')} ฉบับ`}
              onMouseEnter={() => {
                onHover(name)
              }}
              onMouseLeave={() => {
                onHover(null)
              }}
              onFocus={() => {
                onHover(name)
              }}
              onBlur={() => {
                onHover(null)
              }}
            >
              <path d={d} class={cls} />
              <title>{`${name} · ${item.n.toLocaleString('th-TH')} ฉบับ`}</title>
            </a>
          )
        })}
      </svg>
      <div class="maplegend" aria-hidden="true">
        <span class="muted">น้อย</span>
        {Array.from({ length: BANDS }, (_, i) => (
          <i key={i} class={`sw b${i}`} />
        ))}
        <span class="muted">มาก</span>
      </div>
      <p class="muted maphint" role="status">
        {shown ? (
          <>
            <b>{shown.name}</b> {shown.n.toLocaleString('th-TH')} ฉบับ — คลิกเพื่อเปิด
          </>
        ) : (
          `เรียงทุกจังหวัดตามจำนวนฉบับ แล้วแบ่งเป็น ${BANDS} กลุ่มเท่า ๆ กัน สีจึงบอกลำดับ ไม่ได้บอกสัดส่วน`
        )}
      </p>
    </div>
  )
}

function ProvinceList({
  byName,
  match,
  onHover,
}: {
  byName: Map<string, ProvinceIndexItem>
  match: (name: string) => boolean
  onHover: (name: string | null) => void
}) {
  const max = Math.max(1, ...[...byName.values()].map((p) => p.n))
  const groups = REGIONS.map((region) => ({
    region,
    rows: PROVINCES.filter((p) => p.region === region && match(p.name))
      .map((p) => byName.get(p.name))
      .filter((p): p is ProvinceIndexItem => !!p)
      .sort((a, b) => b.n - a.n),
  })).filter((g) => g.rows.length > 0)
  return (
    <div data-testid="province-list">
      {groups.map((g) => (
        <RegionBlock key={g.region} region={g.region} rows={g.rows} max={max} onHover={onHover} />
      ))}
    </div>
  )
}

function RegionBlock({
  region,
  rows,
  max,
  onHover,
}: {
  region: Region
  rows: ProvinceIndexItem[]
  max: number
  onHover: (name: string | null) => void
}) {
  const total = rows.reduce((s, p) => s + p.n, 0)
  return (
    <>
      <h2 style="font-size:1rem;margin:16px 0 6px">
        ภาค{region} <span class="muted">· {total.toLocaleString('th-TH')} ฉบับ</span>
      </h2>
      <div class="provgrid">
        {rows.map((p) => (
          <a
            key={p.file}
            class="provrow"
            href={href.province(p.file)}
            onMouseEnter={() => {
              onHover(p.name)
            }}
            onMouseLeave={() => {
              onHover(null)
            }}
          >
            <span class="nm">{p.name}</span>
            <span class="n">{p.n.toLocaleString('th-TH')}</span>
            <i style={`width:${Math.max(2, Math.round((100 * p.n) / max))}%`} />
          </a>
        ))}
      </div>
    </>
  )
}
