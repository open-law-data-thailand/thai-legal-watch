import { useEffect, useMemo, useState } from 'preact/hooks'
import { ClientContext } from './data/context'
import { DataClient } from './data/client'
import { About } from './routes/About'
import { Dashboard } from './routes/Dashboard'
import { Graph } from './routes/Graph'
import { Doc } from './routes/Doc'
import { Explore } from './routes/Explore'
import { Agency, Province, Topic } from './routes/Facet'
import { Home } from './routes/Home'
import { Latest } from './routes/Latest'
import { Provinces } from './routes/Provinces'
import { DEFAULT_SOURCE, href, parseHash, subscribe, type Route } from './router'
import { Boundary } from './ui/Boundary'
import { QuickSearch } from './ui/QuickSearch'

// "วันนี้" is gone: it was the same destination as the wordmark beside it, and a nav that
// repeats the logo spends a phone's whole first row saying nothing.
const NAV: [string, () => string, Route['name'][]][] = [
  ['ล่าสุด', () => href.latest(), ['latest']],
  ['สำรวจ', () => href.explore(), ['explore', 'topic', 'agency', 'doc']],
  ['ท้องถิ่นฉัน', href.provinces, ['provinces', 'province']],
  ['สถิติ', href.dashboard, ['dashboard']],
  ['ความสัมพันธ์', href.graph, ['graph']],
  ['เกี่ยวกับ', href.about, ['about']],
]

export function App({ client }: { client?: DataClient }) {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash))
  useEffect(
    () =>
      subscribe((r) => {
        setRoute(r)
        scrollTo(0, 0)
      }),
    [],
  )
  useEffect(() => {
    document.title = titleFor(route)
  }, [route])
  useEffect(() => {
    // the nav scrolls sideways on a phone; keep the page you are on from hiding off the edge
    const nav = document.querySelector('nav.main')
    const current = nav?.querySelector('[aria-current="page"]')
    if (nav && current && nav.scrollWidth > nav.clientWidth)
      current.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [route])
  const source = 'source' in route ? route.source : DEFAULT_SOURCE
  const sourced = useMemo(
    () => new DataClient({ baseUrl: import.meta.env.VITE_DATA_BASE_URL ?? '/data', source }),
    [source],
  )
  return (
    <ClientContext.Provider value={client ?? sourced}>
      <a class="skip" href="#main">
        ข้ามไปเนื้อหาหลัก
      </a>
      <header class="topbar">
        <div class="wrap">
          {/* the wordmark is the home link, so it carries home's "you are here" now */}
          <a class="brand" href={href.home()} aria-current={route.name === 'home' ? 'page' : undefined}>
            <span class="name">Thai Legal Watch</span>
          </a>
          <QuickSearch />
          <nav class="main" aria-label="หลัก">
            {NAV.map(([label, to, names]) => (
              <a key={label} href={to()} aria-current={names.includes(route.name) ? 'page' : undefined}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main class="wrap" id="main">
        <Boundary key={routeKey(route)}>
          <Page route={route} />
        </Boundary>
      </main>
      <footer>
        <div class="wrap foot">
          <div>
            <div class="brand">
              <span class="name">Thai Legal Watch</span>
            </div>
            <p>
              อ่านราชกิจจานุเบกษาเป็นหมวด ติดตามเป็นเรื่อง — โครงการในเครือ{' '}
              <a href="https://huggingface.co/open-law-data-thailand">OpenLawData</a>
            </p>
          </div>
          <div>
            <p class="disclaimer">
              <b>ข้อจำกัดความรับผิด</b> ข้อมูลบนเว็บนี้สร้างขึ้นโดยอัตโนมัติจากชุดข้อมูลเปิด
              อาจมีความคลาดเคลื่อนจากการสกัดข้อความและการจำแนกหมวด{' '}
              <b>โปรดตรวจสอบกับต้นฉบับในราชกิจจานุเบกษา (ratchakitcha.soc.go.th) ทุกครั้ง</b>{' '}
              ก่อนนำไปใช้อ้างอิงหรือดำเนินการทางกฎหมาย
            </p>
            <p>
              <a href="/directory">สารบัญหมวด จังหวัด และหน่วยงานทั้งหมด</a> ·{' '}
              <a href="/data/ratchakitcha/agg/meta.json">ข้อมูลดิบ (JSON)</a>
            </p>
            <p>
              ข้อมูล:{' '}
              <a href="https://huggingface.co/datasets/open-law-data-thailand/soc-ratchakitcha">
                OpenLawData — soc-ratchakitcha
              </a>{' '}
              (ชั้น meta และ taxonomy) · จำแนกหมวดด้วยกฎเกณฑ์ที่เปิดให้ตรวจสอบได้ทุกฉบับ ·{' '}
              <a href={href.about()}>ความแม่นยำและข้อจำกัด</a>
            </p>
          </div>
        </div>
      </footer>
    </ClientContext.Provider>
  )
}

/** Remounting the boundary on navigation means one broken page does not poison the next. */
function routeKey(route: Route): string {
  return Object.entries(route)
    .filter(([k]) => k !== 'q')
    .map(([k, v]) => `${k}:${String(v)}`)
    .join('|')
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />
    case 'explore':
      return <Explore q={route.q} />
    case 'topic':
      return <Topic slug={route.slug} />
    case 'agency':
      return <Agency id={route.id} />
    case 'province':
      return <Province file={route.file} />
    case 'provinces':
      return <Provinces />
    case 'latest':
      return <Latest q={route.q} />
    case 'doc':
      return <Doc id={route.id} month={route.month} />
    case 'dashboard':
      return <Dashboard />
    case 'graph':
      return <Graph />
    case 'about':
      return <About />
    case 'notfound':
      return (
        <div class="error" role="alert">
          ไม่พบหน้า <code>{route.path}</code> — <a href={href.home()}>กลับหน้าแรก</a>
        </div>
      )
  }
}

export function titleFor(route: Route): string {
  const base = 'Thai Legal Watch'
  switch (route.name) {
    case 'home':
      return `${base} — วันนี้ในราชกิจจานุเบกษา`
    case 'explore':
      return `สำรวจ — ${base}`
    case 'topic':
      return `หมวด — ${base}`
    case 'agency':
      return `หน่วยงาน — ${base}`
    case 'province':
      return `จังหวัด${route.file} — ${base}`
    case 'provinces':
      return `ท้องถิ่นฉัน — ${base}`
    case 'latest':
      return `ล่าสุด 90 วัน — ${base}`
    case 'doc':
      return `${route.id} — ${base}`
    case 'dashboard':
      return `สถิติ — ${base}`
    case 'graph':
      return `ความสัมพันธ์ของหมวด — ${base}`
    case 'about':
      return `เกี่ยวกับ — ${base}`
    case 'notfound':
      return `ไม่พบหน้า — ${base}`
  }
}
