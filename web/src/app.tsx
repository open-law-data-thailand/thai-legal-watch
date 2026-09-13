import { useEffect, useState } from 'preact/hooks'
import { ClientContext } from './data/context'
import { DataClient } from './data/client'
import { About } from './routes/About'
import { Dashboard } from './routes/Dashboard'
import { Graph } from './routes/Graph'
import { Doc } from './routes/Doc'
import { Explore } from './routes/Explore'
import { Agency, Province, Topic } from './routes/Facet'
import { Home } from './routes/Home'
import { href, parseHash, subscribe, type Route } from './router'

const NAV: [string, () => string, Route['name'][]][] = [
  ['วันนี้', href.home, ['home']],
  ['สำรวจ', () => href.explore(), ['explore', 'topic', 'agency', 'province', 'doc']],
  ['แดชบอร์ด', href.dashboard, ['dashboard']],
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
  return (
    <ClientContext.Provider
      value={client ?? new DataClient({ baseUrl: import.meta.env.VITE_DATA_BASE_URL ?? '/data' })}
    >
      <header class="topbar">
        <div class="wrap">
          <a class="brand" href={href.home()}>
            <span class="name">Thai Legal Watch</span>
            <span class="sub">ราชกิจจานุเบกษา จัดหมวดทุกวัน</span>
          </a>
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
        <Page route={route} />
      </main>
      <footer>
        <div class="wrap">
          ข้อมูล:{' '}
          <a href="https://huggingface.co/datasets/open-law-data-thailand/soc-ratchakitcha">
            OpenLawData — soc-ratchakitcha
          </a>{' '}
          · Thai Legal Watch เป็นโครงการในเครือ OpenLawData · จำแนกหมวดด้วย rule ตรวจสอบที่มาได้ทุกฉบับ ·{' '}
          <a href={href.about()}>เกี่ยวกับและความแม่น</a>
        </div>
      </footer>
    </ClientContext.Provider>
  )
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
      return `หมวด ${route.slug} — ${base}`
    case 'agency':
      return `หน่วยงาน — ${base}`
    case 'province':
      return `จังหวัด${route.file} — ${base}`
    case 'doc':
      return `${route.id} — ${base}`
    case 'dashboard':
      return `แดชบอร์ด — ${base}`
    case 'graph':
      return `ความสัมพันธ์ระหว่างหมวด — ${base}`
    case 'about':
      return `เกี่ยวกับ — ${base}`
    case 'notfound':
      return `ไม่พบหน้า — ${base}`
  }
}
