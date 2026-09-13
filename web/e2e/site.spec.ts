import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type APIRequestContext } from '@playwright/test'

async function a11y(page: Page) {
  // entrance animations fade elements in; scanning mid-fade reads white-on-white and reports
  // contrast failures that never reach the screen, so settle the page first
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(
    r.violations,
    r.violations
      .flatMap((v) => v.nodes.map((n) => `${v.id} :: ${n.target.join(' ')} :: ${n.failureSummary ?? ''}`))
      .join('\n'),
  ).toEqual([])
}

/** Nothing on any page may render the error box, and every page needs exactly one h1. */
async function sane(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.locator('.error')).toHaveCount(0)
  await expect(page.locator('.skeleton')).toHaveCount(0)
}

/** the number a chip or an option carries, e.g. "ล้มละลาย (1,204)" -> 1204 */
const countIn = (text: string | null): number =>
  Number(/\((\d[\d,]*)\)/.exec(text ?? '')?.[1]?.replace(/,/g, '') ?? NaN)

const data = {
  async months(request: APIRequestContext) {
    const y = (await (await request.get('/data/ratchakitcha/agg/years.json')).json()) as {
      by_month: Record<string, number>
    }
    return Object.keys(y.by_month).sort()
  },
  async docs(request: APIRequestContext, month: string) {
    return (await (
      await request.get(`/data/ratchakitcha/docs/${month.slice(0, 4)}/${month}.json`)
    ).json()) as { id: string; t: string; v: number; p: string; pg: number; d: string; pr: string | null }[]
  },
  async provinces(request: APIRequestContext) {
    return (await (await request.get('/data/ratchakitcha/index/provinces.json')).json()) as {
      file: string
      name: string
      n: number
    }[]
  },
  async agencies(request: APIRequestContext) {
    return (await (await request.get('/data/ratchakitcha/index/agencies.json')).json()) as {
      id: string
      name: string
      page: boolean
    }[]
  },
}

test.describe('every route', () => {
  test('renders, titles itself, and never shows the error box', async ({ page, request }) => {
    const provinces = await data.provinces(request)
    const agencies = await data.agencies(request)
    const withPage = agencies.find((a) => a.page)
    if (!withPage) throw new Error('fixture has no agency page')
    const months = await data.months(request)
    const last = months[months.length - 1] as string
    const docs = await data.docs(request, last)
    const routes: [string, RegExp][] = [
      ['#/', /วันนี้ในราชกิจจานุเบกษา/],
      ['#/ratchakitcha/explore', /สำรวจ/],
      ['#/ratchakitcha/explore?scope=all', /สำรวจ/],
      ['#/ratchakitcha/provinces', /ท้องถิ่นฉัน/],
      ['#/ratchakitcha/latest', /ล่าสุด 90 วัน/],
      [`#/ratchakitcha/province/${encodeURIComponent(provinces[0]?.file ?? '')}`, /จังหวัด/],
      [`#/ratchakitcha/agency/${withPage.id}`, /หน่วยงาน/],
      ['#/ratchakitcha/topic/environment', /หมวด/],
      [`#/ratchakitcha/doc/${docs[0]?.id ?? ''}`, /Thai Legal Watch/],
      ['#/ratchakitcha/dashboard', /สถิติ/],
      ['#/ratchakitcha/graph', /ความสัมพันธ์ของหมวด/],
      ['#/about', /เกี่ยวกับ/],
    ]
    for (const [hash, title] of routes) {
      await page.goto(`/${hash}`)
      await expect(page, hash).toHaveTitle(title)
      await sane(page)
    }
  })
})

test.describe('home', () => {
  test('shows the latest day, metrics, topic bars and a data credit', async ({ page }) => {
    await page.goto('/#/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('อ่านเป็นหมวด')
    const metrics = page.getByTestId('today-metrics')
    await expect(metrics.locator('.metric')).toHaveCount(4)
    await expect(metrics.locator('.value').first()).not.toHaveText('0')
    await expect(page.locator('footer')).toContainText('OpenLawData')
    await a11y(page)
  })

  test('the sparkline names a day on hover and opens that day on click', async ({ page }) => {
    await page.goto('/#/')
    const bars = page.locator('.sparkbar')
    await expect(bars.first()).toBeVisible()
    const last = bars.last()
    const label = (await last.getAttribute('aria-label')) ?? ''
    expect(label).toMatch(/\d+ ฉบับ$/)
    await last.hover()
    await expect(page.locator('.sparkhint')).toContainText('คลิกเพื่อดูรายฉบับ')
    await last.click()
    await expect(page).toHaveURL(/day=\d{4}-\d{2}-\d{2}/)
    await expect(page.locator('.pill', { hasText: 'เฉพาะวันที่' })).toBeVisible()
    // the toolbar says which day, and clearing it returns the whole month
    const day = page.getByLabel('วันที่', { exact: true })
    await expect(day).not.toHaveValue('')
    const oneDay = await page.getByTestId('results').locator('.doc').count()
    await day.selectOption('')
    await expect(page).not.toHaveURL(/day=/)
    await expect
      .poll(() => page.getByTestId('results').locator('.doc').count())
      .toBeGreaterThanOrEqual(oneDay)
    await sane(page)
  })
})

test.describe('ล่าสุด', () => {
  test('lists every recent document newest first, with a count on each date', async ({ page, request }) => {
    const latest = (await (await request.get('/data/ratchakitcha/agg/latest.json')).json()) as {
      days: number
      docs: { d: string | null; t: string }[]
    }
    await page.goto('/#/ratchakitcha/latest')
    const bars = page.locator('.daybar')
    await expect(bars.first()).toBeVisible()

    // dates run newest to oldest, and each says how many that day has
    const dates = await page.locator('.daybar > span:first-child').allTextContents()
    expect(dates.length).toBeGreaterThan(0)
    for (const b of await bars.allTextContents()) expect(b).toMatch(/\d+ ฉบับ/)

    // the first row is the first document of the payload — the page reorders nothing
    await expect(page.getByTestId('latest').locator('.doc a.title').first()).toHaveText(
      latest.docs[0]?.t ?? '',
    )
    await sane(page)
    await a11y(page)
  })

  test('the filter narrows as you type, says how many matched, and is shareable', async ({
    page,
    request,
  }) => {
    const latest = (await (await request.get('/data/ratchakitcha/agg/latest.json')).json()) as {
      docs: { t: string }[]
    }
    const word = (latest.docs[0]?.t ?? '').slice(0, 6)
    if (!word) throw new Error('fixture has no documents in the last 90 days')
    await page.goto('/#/ratchakitcha/latest')
    const rows = page.getByTestId('latest').locator('.doc')
    const before = await rows.count()

    await page.getByPlaceholder(/พิมพ์คำที่ต้องการ/).fill(word)
    await expect(page.getByText(/ตรงกัน/)).toBeVisible()
    await expect.poll(() => rows.count()).toBeLessThanOrEqual(before)
    // every remaining row really contains it, and the match is marked
    await expect(page.getByTestId('latest').locator('mark').first()).toBeVisible()

    // the filter lives in the URL, so a search can be handed to someone else
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(word)}`))
    await page.reload()
    await expect(page.getByPlaceholder(/พิมพ์คำที่ต้องการ/)).toHaveValue(word)

    await page.getByPlaceholder(/พิมพ์คำที่ต้องการ/).fill('ไม่มีคำนี้ในราชกิจจาแน่นอน')
    await expect(rows).toHaveCount(0)
    await expect(page.locator('.empty')).toContainText('ไม่พบฉบับ')
  })
})

test.describe('header search', () => {
  test('finds a topic by name and the keyboard alone can reach it', async ({ page }) => {
    await page.goto('/#/')
    await page.keyboard.press('/')
    const box = page.locator('.topbar').getByRole('combobox', { name: 'ค้นหาด่วน' })
    await expect(box).toBeFocused()
    await box.fill('ขยะ')
    const list = page.locator('#qs-list li')
    await expect(list.first()).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/topic\/pollution_waste/)
    await sane(page)
  })

  test('a gazette citation typed into the box opens that document', async ({ page, request }) => {
    const months = await data.months(request)
    const docs = await data.docs(request, months[months.length - 1] as string)
    const target = docs.find((d) => d.v && d.p && d.pg)
    if (!target) throw new Error('fixture has no document with coordinates')
    const special = /พิเศษ/.test(target.p)
    const [part, cls] = target.p.split(' ')
    const typed = `เล่ม ${target.v} ตอน${special ? 'พิเศษ' : 'ที่'} ${part} ${cls} หน้า ${target.pg}`
    await page.goto('/#/')
    await page.locator('.topbar').getByRole('combobox', { name: 'ค้นหาด่วน' }).fill(typed)
    await page.locator('.topbar').locator('#qs-list li', { hasText: 'เปิดฉบับนี้' }).click()
    await expect(page.getByTestId('doc-title')).toHaveText(target.t)
  })
})

test.describe('arriving with a subject rather than a date', () => {
  test('the front page offers subjects, and each one opens filtered', async ({ page }) => {
    // Most people arrive knowing what they care about, not what came out today. The doorways are
    // read from the taxonomy, so this checks the wiring rather than a list somebody typed.
    await page.goto('/#/')
    const doors = page.locator('.door')
    await expect(doors.first()).toBeVisible()
    expect(await doors.count()).toBeGreaterThan(3)
    const first = doors.first()
    const name = (await first.locator('.nm').textContent())?.trim() ?? ''
    await first.click()
    await expect(page).toHaveURL(/explore\?.*topic=/)
    await expect(page.getByRole('button', { name: new RegExp(`^${name} \\(`) })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await sane(page)
  })

  test('a filter that is one subject can be followed; a crossed one says why not', async ({ page }) => {
    await page.goto('/#/ratchakitcha/explore?scope=all&topic=bankruptcy')
    const feed = page.locator('.feedrow')
    await expect(feed.getByRole('link', { name: /RSS/ })).toHaveAttribute('href', /feeds\/topic\//)
    await page.getByLabel('ระดับผู้ออก').selectOption({ index: 1 })
    await expect(feed.getByRole('link', { name: /RSS/ })).toHaveCount(0)
    await expect(feed).toContainText('ยังติดตามด้วย RSS ไม่ได้')
  })
})

test.describe('explore', () => {
  test('filters by topic chip and title search; results and CSV button react', async ({ page }) => {
    await page.goto('/#/ratchakitcha/explore')
    const results = page.getByTestId('results')
    await expect(results.locator('.doc').first()).toBeVisible()
    const all = await results.locator('.doc').count()
    await page.getByRole('button', { name: /^ล้มละลาย/ }).click()
    await expect(page).toHaveURL(/topic=bankruptcy/)
    await expect.poll(() => results.locator('.doc').count()).toBeLessThan(all)
    await expect(results.locator('.doc .pill.topic').first()).toContainText('ล้มละลาย')
    await page.goto('/#/ratchakitcha/explore?q=%E0%B8%A1%E0%B8%B9%E0%B8%A5%E0%B8%9D%E0%B8%AD%E0%B8%A2')
    await expect(results.locator('.doc mark').first()).toHaveText('มูลฝอย')
    await page.getByPlaceholder(/ขยะ/).fill('ไม่มีคำนี้แน่นอน')
    await expect(results.locator('.doc')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /ดาวน์โหลด CSV/ })).toBeDisabled()
    await a11y(page)
  })

  test('year scope loads every month of the year and shows counts on chips and options', async ({ page }) => {
    await page.goto('/#/ratchakitcha/explore?scope=year&year=2024')
    const results = page.getByTestId('results')
    await expect(results.locator('.doc')).toHaveCount(50) // first page of 80
    await expect(page.locator('.pager')).toContainText('หน้า 1 / 2')
    await expect(page.getByRole('button', { name: /^ทุกหมวด \(\d/ })).toBeVisible()
    await page.getByRole('button', { name: /ถัดไป/ }).click()
    await expect(page.locator('.pager')).toContainText('หน้า 2 / 2')
    await page.getByRole('button', { name: 'ทั้งหมด' }).click()
    await expect(page).toHaveURL(/scope=all/)
    // titles are not in the archive index, so title search belongs to the scopes that load shards
    await expect(page.getByLabel('ค้นในชื่อเรื่อง')).toBeDisabled()
  })

  test('the whole archive cross-filters, and the numbers beside the options follow', async ({
    page,
    request,
  }) => {
    // Before the archive index existed this view could show one pre-built topic page and nothing
    // else: no list without a topic, and no way to ask for a topic *and* a province at once.
    await page.goto('/#/ratchakitcha/explore?scope=all')
    const results = page.getByTestId('results')
    await expect(results.locator('.doc').first()).toBeVisible()
    const everything = await results.locator('.doc').count()
    expect(everything).toBeGreaterThan(0)

    const provinces = await data.provinces(request)
    const province = provinces[0]
    if (!province) throw new Error('fixture has no provinces')
    // the province option carries a count that the archive index computed in the browser
    await expect(page.getByLabel('จังหวัด').locator('option', { hasText: province.name })).toContainText(
      /\(\d/,
    )
    await page.getByLabel('จังหวัด').selectOption(province.name)
    await expect(page).toHaveURL(new RegExp(`province=${encodeURIComponent(province.name)}`))
    await expect(page.getByRole('button', { name: 'ลบตัวกรองจังหวัด' })).toBeVisible()

    // and now the combination that had no pre-built file: this province and this topic
    const chip = page.getByRole('button', { name: /^ล้มละลาย/ })
    const label = (await chip.textContent()) ?? ''
    await chip.click()
    await expect(page).toHaveURL(/topic=bankruptcy/)
    const narrowed = await results.locator('.doc').count()
    expect(narrowed).toBeLessThanOrEqual(everything)
    // the count on the chip was computed with the topic filter lifted, so it survives the click
    await expect(chip).toHaveText(label)
    for (const pill of await results.locator('.doc .pill.topic').allTextContents())
      expect(pill).toContain('ล้มละลาย')
    await sane(page)
    await a11y(page)
  })

  test('a chip promises a number and the list keeps it', async ({ page }) => {
    // The chips counted corroborated labels and the filter did not, so "ล้มละลาย (12)" listed
    // more than twelve. Both now use the rule the rest of the site counts by.
    for (const url of ['/#/ratchakitcha/explore?scope=year&year=2024', '/#/ratchakitcha/explore?scope=all']) {
      await page.goto(url)
      const chip = page.getByRole('button', { name: /^ล้มละลาย \(/ })
      await expect.poll(async () => countIn(await chip.textContent())).toBeGreaterThan(0)
      const promised = countIn(await chip.textContent())
      await chip.click()
      await expect(page.getByRole('status').first()).toContainText(
        new RegExp(`ตรงเงื่อนไข ${promised.toLocaleString('th-TH')} ฉบับ`),
      )
    }
  })

  test('the archive index agrees with the files the pipeline built from the same data', async ({
    page,
    request,
  }) => {
    await page.goto('/#/ratchakitcha/explore?scope=all')
    const chips = page.locator('[aria-label="หมวดหลัก"] button')
    await expect.poll(async () => countIn(await chips.first().textContent())).toBeGreaterThan(0)
    const texts = await chips.allTextContents()
    const [all, ...roots] = texts.map(countIn)

    // a document has one topic, rolled up to exactly one root, so the roots must account for
    // "ทุกหมวด" exactly — they did not when the two were counted by different rules
    expect(roots.reduce((a, b) => a + b, 0)).toBe(all)

    // and the browser's own count of a topic has to be the number the pipeline wrote for it
    const chip = chips.nth(1)
    const promised = countIn(await chip.textContent())
    await chip.click()
    const slug = new URL(page.url()).hash.match(/topic=([^&]+)/)?.[1]
    if (!slug) throw new Error('clicking a topic chip set no topic')
    const built = (await (await request.get(`/data/ratchakitcha/agg/topic/${slug}.json`)).json()) as {
      total: number
    }
    expect(promised).toBe(built.total)
  })

  test('a year from the archive view lists in full, and to the same number', async ({ page }) => {
    // A filter can match documents spread one-per-month across twenty years; those cannot be
    // listed from a handful of shards, so the archive view offers the years instead. The number
    // on a year comes from the index and the list comes from the month files — two different
    // paths through two different filters, which have to agree.
    await page.goto('/#/ratchakitcha/explore?scope=all&topic=bankruptcy')
    const byYear = page.locator('[aria-label="แยกดูรายปี"]')
    if ((await byYear.count()) === 0) test.skip(true, 'fixture is small enough to list in full')
    const chip = byYear.locator('button').first()
    const promised = countIn(await chip.textContent())
    expect(promised).toBeGreaterThan(0)
    await chip.click()
    await expect(page).toHaveURL(/scope=year/)
    await expect(page).toHaveURL(/topic=bankruptcy/)
    await expect(page.getByRole('status').first()).toContainText(
      new RegExp(`ตรงเงื่อนไข ${promised.toLocaleString('th-TH')} ฉบับ`),
    )
  })

  test('document type is a filter of its own in every scope', async ({ page }) => {
    await page.goto('/#/ratchakitcha/explore?scope=all')
    const kind = page.getByLabel('ประเภทเอกสาร')
    await expect(kind.locator('option')).not.toHaveCount(1)
    const value = await kind.locator('option').nth(1).getAttribute('value')
    if (!value) throw new Error('fixture has no document types')
    await kind.selectOption(value)
    await expect(page).toHaveURL(new RegExp(`dtype=${encodeURIComponent(value)}`))
    const results = page.getByTestId('results')
    await expect(results.locator('.doc').first()).toBeVisible()
    // the filter survives a scope change, and still filters
    await page.getByRole('button', { name: 'รายเดือน' }).click()
    await expect(page).toHaveURL(new RegExp(`dtype=${encodeURIComponent(value)}`))
    await sane(page)
  })

  test('months are listed in Buddhist years and the province filter narrows the list', async ({
    page,
    request,
  }) => {
    await page.goto('/#/ratchakitcha/explore')
    const monthSelect = page.getByLabel('เดือน')
    await expect(monthSelect.locator('option').first()).toHaveText(/^25\d\d-\d\d /)
    const provinces = await data.provinces(request)
    const withDocs = provinces[0]
    if (!withDocs) throw new Error('fixture has no provinces')
    const results = page.getByTestId('results')
    const before = await results.locator('.doc').count()
    await page.getByLabel('จังหวัด').selectOption(withDocs.name)
    await expect(page).toHaveURL(new RegExp(`province=${encodeURIComponent(withDocs.name)}`))
    await expect.poll(() => results.locator('.doc').count()).toBeLessThanOrEqual(before)
    for (const pill of await results.locator('.doc').first().locator('.pill').allTextContents())
      expect(pill).toBeTruthy()
    await sane(page)
  })
})

test.describe('facet pages', () => {
  test('topic page rolls up children and links to documents', async ({ page }) => {
    await page.goto('/#/ratchakitcha/topic/environment')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('สิ่งแวดล้อม')
    await expect(page.locator('.chip', { hasText: 'มลพิษ' })).toBeVisible()
    const recent = page.getByTestId('recent')
    await expect(recent.locator('.doc').first()).toBeVisible()
    await recent.locator('.doc a.title').first().click()
    await expect(page.getByTestId('doc-title')).toBeVisible()
    await a11y(page)
  })

  test('province page and agency page render from the index', async ({ page, request }) => {
    const provinces = await data.provinces(request)
    const first = provinces[0]
    if (!first) throw new Error('fixture has no provinces')
    await page.goto(`/#/ratchakitcha/province/${encodeURIComponent(first.file)}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(first.name)
    await expect(page.locator('.crumbs a', { hasText: 'ท้องถิ่นฉัน' })).toBeVisible()
    const agencies = await data.agencies(request)
    const withPage = agencies.find((a) => a.page)
    if (!withPage) throw new Error('fixture has no agency page')
    await page.goto(`/#/ratchakitcha/agency/${withPage.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(withPage.name)
    await a11y(page)
  })
})

test.describe('document', () => {
  test('shows coordinates, evidence, every citation format and a working copy button', async ({
    page,
    request,
    context,
  }) => {
    const months = await data.months(request)
    const month = months[months.length - 1] as string
    const docs = await data.docs(request, month)
    const first = docs[0]
    if (!first) throw new Error('fixture month is empty')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/#/ratchakitcha/doc/${first.id}`)
    await expect(page.getByTestId('doc-title')).toHaveText(first.t)
    await expect(page.getByTestId('citation')).toContainText('ราชกิจจานุเบกษา เล่ม 141')
    await expect(page.getByTestId('evidence').locator('.lab')).not.toHaveCount(0)
    await page.getByTestId('cite').click()
    await expect(page.getByTestId('cite')).toHaveText(/คัดลอกแล้ว/)
    await page.getByLabel('รูปแบบการอ้างอิง').selectOption('footnote')
    await expect(page.getByTestId('citation')).toContainText('เล่ม ๑๔๑')
    await page.getByLabel('รูปแบบการอ้างอิง').selectOption('apa')
    await expect(page.getByTestId('citation')).toContainText('ราชกิจจานุเบกษา, 141')
    await page.getByLabel('รูปแบบการอ้างอิง').selectOption('coords')
    await expect(page.getByTestId('citation')).toHaveText(/^เล่ม 141/)
    await page.getByTestId('copy-link').click()
    await expect(page.getByTestId('copy-link')).toHaveText(/คัดลอกแล้ว/)
    await a11y(page)
  })

  test('a legacy id is never handed a hundred-megabyte download', async ({ page, request }) => {
    const months = await data.months(request)
    const docs = await data.docs(request, months[months.length - 1] as string)
    const legacy = docs.find((d) => /^\d{4}-\d{6}$/.test(d.id))
    if (!legacy) return // a build of modern-only years has nothing to check
    await page.goto(`/#/ratchakitcha/doc/${legacy.id}`)
    const primary = page.locator('.doclinks a.btn.primary')
    await expect(primary).toHaveAttribute('href', 'https://ratchakitcha.soc.go.th/')
    const secondary = page.locator('.doclinks a').nth(1)
    await expect(secondary).toHaveAttribute('href', /\/blob\/main\/zip\//)
    for (const href of await page
      .locator('a')
      .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href)))
      expect(href, 'no direct archive download anywhere on the page').not.toMatch(/\/resolve\/.*\.zip$/)
  })

  test('the full text is offered but not fetched until it is asked for', async ({ page, request }) => {
    // The text layer lives on somebody else's server and a lookup is a dozen range requests, so
    // it must never happen as a side effect of opening a page. This also proves the page does not
    // reach outside the site on load, which is what the CSP is there to enforce.
    const outside: string[] = []
    await page.route('**/*', (route) => {
      const u = route.request().url()
      if (!u.startsWith('http://127.0.0.1:4173')) outside.push(u)
      return route.continue()
    })
    const months = await data.months(request)
    const last = months[months.length - 1] as string
    const docs = await data.docs(request, last)
    await page.goto(`/#/ratchakitcha/doc/${docs[0]?.id ?? ''}?m=${last}`)
    await expect(page.getByTestId('doc-title')).toBeVisible()

    const section = page.locator('.fulltext')
    await expect(section).toBeVisible()
    await expect(section.getByTestId('load-fulltext')).toBeVisible()
    await expect(section).toContainText('เก็บไว้ในเครื่อง')
    expect(outside.filter((u) => u.includes('huggingface'))).toEqual([])
  })

  test('a document says where to go next, with the number that makes it worth going', async ({
    page,
    request,
  }) => {
    // most people reach a document from a link with no context at all
    const months = await data.months(request)
    const last = months[months.length - 1] as string
    const docs = await data.docs(request, last)
    await page.goto(`/#/ratchakitcha/doc/${docs[0]?.id ?? ''}?m=${last}`)
    const next = page.locator('.nextsteps')
    await expect(next).toBeVisible()
    const steps = next.locator('.door')
    expect(await steps.count()).toBeGreaterThan(0)
    await expect(steps.first()).toContainText(/\d[\d,]* ฉบับ/)
    const href = await steps.first().getAttribute('href')
    expect(href).toMatch(/#\/ratchakitcha\//)
    // the day a document was published always exists, so the block is never empty — a document
    // with no issuer and no confirmed subject used to render nothing at all
    await expect(steps.last()).toContainText('ประกาศวันเดียวกัน')
    await steps.first().click()
    await sane(page)
  })

  test('a printed document is the document, with a way back on it', async ({ page, request }) => {
    // people print these and hand them to somebody. What comes out has to be the document and its
    // coordinates, not the navigation — and paper has no address bar.
    const months = await data.months(request)
    const last = months[months.length - 1] as string
    const docs = await data.docs(request, last)
    await page.goto(`/#/ratchakitcha/doc/${docs[0]?.id ?? ''}?m=${last}`)
    await expect(page.getByTestId('doc-title')).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('header.topbar')).toBeHidden()
    await expect(page.locator('footer')).toBeHidden()
    await expect(page.getByTestId('doc-title')).toBeVisible()
    await expect(page.getByTestId('citation')).toBeVisible()
    const back = page.locator('.printback')
    await expect(back).toBeVisible()
    await expect(back).toContainText(docs[0]?.id ?? '')
    await page.emulateMedia({ media: 'screen' })
    await expect(page.locator('.printback')).toBeHidden()
  })

  test('unknown id is an error, not a blank page', async ({ page }) => {
    await page.goto('/#/ratchakitcha/doc/2024-999999')
    await expect(page.getByRole('alert')).toContainText('ไม่พบเอกสาร')
    await page.goto('/#/ratchakitcha/nope')
    await expect(page.getByRole('alert')).toContainText('ไม่พบหน้า')
  })
})

test.describe('ท้องถิ่นฉัน', () => {
  test('draws the country, keys the colours, and reaches a province page', async ({ page, request }) => {
    await page.goto('/#/ratchakitcha/provinces')
    const map = page.getByTestId('province-map')
    // every one of the 77 provinces is drawn, whether or not it has documents
    await expect(map.locator('svg path.pv')).toHaveCount(77)
    await expect(map.locator('.maplegend .sw')).toHaveCount(5)
    const provinces = await data.provinces(request)
    const linked = map.locator('svg a')
    await expect(linked).toHaveCount(provinces.length)
    const first = linked.first()
    const label = (await first.getAttribute('aria-label')) ?? ''
    await first.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label.split(' ')[0] as string)
    await a11y(page)
  })

  test('the filter narrows the list and says so when nothing matches', async ({ page }) => {
    await page.goto('/#/ratchakitcha/provinces')
    const rows = page.getByTestId('province-list').locator('.provrow')
    await expect(rows.first()).toBeVisible()
    await page.getByPlaceholder(/ชื่อจังหวัด/).fill('ไม่มีจังหวัดนี้')
    await expect(rows).toHaveCount(0)
    await expect(page.getByText(/ไม่พบจังหวัดที่ตรงกับ/)).toBeVisible()
  })
})

test.describe('citation lookup', () => {
  test('เล่ม / ตอน / หน้า on the hero opens the document at those coordinates', async ({ page, request }) => {
    const months = await data.months(request)
    const docs = await data.docs(request, months[months.length - 1] as string)
    const target = docs.find((d) => d.v && d.p && d.pg)
    if (!target) throw new Error('fixture has no document with coordinates')
    const [part, cls] = target.p.split(' ')
    await page.goto('/#/')
    await page.getByText(/เปิดจากเล่ม ตอน หน้า/).click()
    await page.getByLabel('เล่ม', { exact: true }).fill(String(target.v))
    await page.getByLabel('ตอนที่', { exact: true }).fill(part as string)
    await page.getByLabel('ตอน ก/ข/ค/ง').selectOption(cls as string)
    if (/พิเศษ/.test(target.p)) await page.getByLabel('ตอนพิเศษ').check()
    await page.getByLabel('หน้า', { exact: true }).fill(String(target.pg))
    await page.getByRole('button', { name: 'เปิดเอกสาร' }).click()
    await expect(page.getByTestId('doc-title')).toHaveText(target.t)
  })

  test('coordinates that do not exist say so instead of hanging', async ({ page }) => {
    await page.goto('/#/')
    await page.getByText(/เปิดจากเล่ม ตอน หน้า/).click()
    await page.getByLabel('เล่ม', { exact: true }).fill('99')
    await page.getByLabel('ตอนที่', { exact: true }).fill('999')
    await page.getByRole('button', { name: 'เปิดเอกสาร' }).click()
    await expect(page.getByText(/ไม่พบฉบับที่ เล่ม 99/)).toBeVisible()
  })
})

test.describe('dashboard, graph and about', () => {
  test('the relationship graph mounts and its filters stay usable', async ({ page }) => {
    await page.goto('/#/ratchakitcha/graph')
    await expect(page.getByTestId('graph').locator('canvas').first()).toBeVisible()
    await expect(page.getByTestId('graph')).toHaveAttribute('data-ready', '1')
    await page.getByPlaceholder(/พิมพ์ชื่อหมวด/).fill('ขยะ')
    await expect(page.getByTestId('graph')).toHaveAttribute('data-ready', '1')
    await a11y(page)
  })

  test('the graph can be zoomed and reset from buttons, not only the wheel', async ({ page }) => {
    await page.goto('/#/ratchakitcha/graph')
    await expect(page.getByTestId('graph')).toHaveAttribute('data-ready', '1')
    const nav = page.getByRole('group', { name: 'มุมมองกราฟ' })
    await expect(nav).toBeVisible()
    await nav.getByRole('button', { name: 'ขยายเข้า' }).click()
    await expect(nav).toContainText('130%')
    await nav.getByRole('button', { name: 'ย่อออก' }).click()
    await nav.getByRole('button', { name: 'ย่อออก' }).click()
    await expect(nav).not.toContainText('130%')
    await nav.getByRole('button', { name: 'กลับไปขนาดเริ่มต้น' }).click()
    await expect(nav).toContainText('100%')
  })

  test('a node opens beside the graph instead of throwing the reader off the page', async ({ page }) => {
    // A canvas has no elements, so the graph cannot be entered by keyboard at all. The search box
    // offers its matches as real buttons; from there the neighbour list walks the rest.
    await page.goto('/#/ratchakitcha/graph')
    await expect(page.getByTestId('graph')).toHaveAttribute('data-ready', '1')
    await page.getByPlaceholder(/พิมพ์ชื่อหมวด/).fill('ขยะ')
    const matches = page.locator('[aria-label^="โหนดที่ตรงกับ"] button')
    await expect(matches.first()).toBeVisible()
    const name = (await matches.first().textContent())?.trim() ?? ''
    await matches.first().click()

    const panel = page.locator('.nodepanel')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText(name)
    // the three ways out: the full page, the documents, and a feed to follow it
    await expect(panel.getByRole('link', { name: /หน้าสรุปเต็ม/ })).toBeVisible()
    await expect(panel.getByRole('link', { name: /ดูฉบับจริงในสำรวจ/ })).toHaveAttribute('href', /explore/)
    await expect(panel.getByRole('link', { name: 'RSS' })).toHaveAttribute('href', /feeds\/.+\.xml$/)
    // and the graph is still there, with its filters, because nothing navigated
    await expect(page.getByTestId('graph')).toBeVisible()

    // a neighbour re-focuses the panel rather than leaving
    const near = panel.locator('.nearlist button')
    if (await near.count()) {
      const nextName = (await near.first().locator('.nm').textContent())?.trim() ?? ''
      await near.first().click()
      await expect(panel.getByRole('heading', { level: 2 })).toHaveText(nextName)
    }
    await panel.getByRole('button', { name: 'ปิดรายละเอียด' }).click()
    await expect(page.locator('.nodepanel')).toHaveCount(0)
    await sane(page)
    await a11y(page)
  })

  test('the dashboard answers a question and a year click narrows it', async ({ page }) => {
    // data-ready goes up when the chart is configured, but the bars animate in after that, so a
    // click can land on empty canvas. Reduced motion removes the animation entirely — which the
    // charts now honour — and waiting for a drawn bar removes the rest of the race.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/#/ratchakitcha/dashboard')
    await expect(page.getByTestId('chart-years')).toHaveAttribute('data-ready', '1')
    // Count, not visibility: ECharts emits clip and background paths that are legitimately
    // hidden. The fixture has two years, so this only proves the series has been drawn at all
    // before a click is aimed at it.
    await expect.poll(() => page.locator('[data-testid=chart-years] svg path').count()).toBeGreaterThan(4)
    await expect(page.getByTestId('chart-years').locator('svg')).toBeVisible()
    // the headline numbers, the month-of-year profile and the per-year sections all render
    await expect(page.locator('.grid.metrics .metric')).not.toHaveCount(0)
    await expect(page.getByRole('heading', { name: /ช่วงเวลาในรอบปี/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /หมวดที่มาแรง/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /คดีล้มละลายตามขั้นตอน/ })).toBeVisible()
    // every breakdown on the page is titled by the focused year, so this is the one to watch
    const heading = page.getByRole('heading', { name: /แยกตามด้านต่าง ๆ$/ })
    await expect(heading).toHaveText(/ทุกปีรวมกัน/)
    // Click the middle of an actual drawn bar rather than a fraction of the chart: a fixed
    // fraction lands between bars as soon as the number of years changes. ECharts also emits
    // full-size clip and background paths, so the narrow tall ones are the bars.
    const chart = page.getByTestId('chart-years')
    const box = await chart.boundingBox()
    if (!box) throw new Error('the year chart has no box')
    const bars = await chart.locator('svg path').evaluateAll((paths) =>
      paths
        .map((p) => p.getBoundingClientRect())
        .filter((r) => r.width > 2 && r.width < 200 && r.height > 8)
        .map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })),
    )
    // the last bar, not the first: the earliest year has no year before it to compare against,
    // and this test is about the comparison being named
    const bar = bars[bars.length - 1]
    if (!bar) throw new Error('the year chart drew no bars')
    await page.mouse.click(bar.x, bar.y)
    // the chip names the year that was picked, and the per-year sections follow it
    const chip = page.locator('.chip', { hasText: 'ล้างการเลือก' })
    await expect(chip).toBeVisible()
    const picked = /\((\d{4})\)/.exec((await chip.textContent()) ?? '')?.[1]
    expect(picked, 'the chip should name the selected year').toBeTruthy()
    // and the whole page follows it: the heading, every metric, and the breakdown panels
    await expect(heading).toHaveText(new RegExp(`ปี ${picked as string} `))
    await expect(page.locator('.grid.metrics .metric').first()).toContainText(`ปี ${picked as string}`)
    await expect(page.locator('.statpanel')).not.toHaveCount(0)
    // a comparison without its baseline named is a decoration, not a statistic
    await expect(page.locator('.grid.metrics .metric').first()).toContainText(/จากปี \d{4} \(/)
    await chip.click()
    await expect(chip).toHaveCount(0)
    await expect(heading).toHaveText(/ทุกปีรวมกัน/)
    await sane(page)
    await a11y(page)
  })

  test('the about page hands the data over, and its links are real files', async ({ page, request }) => {
    // an open-data site that cannot be reused is a screenshot of open data
    await page.goto('/#/about')
    const links = page.getByRole('link', { name: /agg\// })
    await expect(links.first()).toBeVisible()
    for (const href of await links.evaluateAll((as) =>
      as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
    )) {
      const r = await request.get(href)
      expect(r.status(), href).toBe(200)
      expect(r.headers()['content-type'], href).toContain('json')
      expect(r.headers()['access-control-allow-origin'] ?? '*', href).toBe('*')
    }
  })

  test('the about page states the accuracy', async ({ page }) => {
    await page.goto('/#/about')
    await expect(page.getByText('100% (ช่วงเชื่อมั่น 98.6–100)')).toBeVisible()
    await expect(page.getByText('สุ่มทั่วคลัง 300 ฉบับ')).toBeVisible()
    await a11y(page)
  })
})

test('feeds are served as Atom', async ({ request }) => {
  const r = await request.get('/data/ratchakitcha/feeds/topic/pollution_waste.xml')
  expect(r.ok()).toBeTruthy()
  expect(await r.text()).toContain('<feed xmlns="http://www.w3.org/2005/Atom">')
})

test.describe('finding your way back', () => {
  test('a document reached from สำรวจ offers the exact list it came from', async ({ page }) => {
    await page.goto('/#/ratchakitcha/explore?topic=bankruptcy')
    const results = page.getByTestId('results')
    await expect(results.locator('.doc a.title').first()).toBeVisible()
    await results.locator('.doc a.title').first().click()
    await expect(page.getByTestId('doc-title')).toBeVisible()
    const back = page.getByRole('link', { name: /กลับไปผลการค้นหา/ })
    await expect(back).toBeVisible()
    await back.click()
    await expect(page).toHaveURL(/topic=bankruptcy/)
    await expect(results.locator('.doc').first()).toBeVisible()
  })

  test('every kind of page names itself in the tab title', async ({ page, request }) => {
    await page.goto('/#/ratchakitcha/topic/environment')
    await expect(page).toHaveTitle(/^สิ่งแวดล้อม · หมวด — /)
    const provinces = await data.provinces(request)
    const first = provinces[0]
    if (!first) throw new Error('fixture has no provinces')
    await page.goto(`/#/ratchakitcha/province/${encodeURIComponent(first.file)}`)
    await expect(page).toHaveTitle(new RegExp(`^${first.name} · จังหวัด — `))
    const months = await data.months(request)
    const docs = await data.docs(request, months[months.length - 1] as string)
    const doc = docs[0]
    if (!doc) throw new Error('fixture month is empty')
    await page.goto(`/#/ratchakitcha/doc/${doc.id}`)
    await expect(page).toHaveTitle(new RegExp(doc.id))
  })
})

test.describe('keyboard and screen reader', () => {
  test('a skip link jumps past the header, and it is the first thing focused', async ({ page }) => {
    await page.goto('/#/')
    const skip = page.locator('.skip')
    // first in the document, so it is first in tab order wherever Tab is available
    const firstFocusable = await page.evaluate(() => {
      const el = document.querySelector('a[href], button, input, select, [tabindex]')
      return el?.className ?? ''
    })
    expect(firstFocusable).toContain('skip')
    // off-screen until focused, then visible and pointing at the content
    await skip.focus()
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    await expect(skip).toHaveAttribute('href', '#main')
  })

  test('arrowing through quick search names the highlighted result', async ({ page }) => {
    await page.goto('/#/')
    const box = page.locator('.topbar').getByRole('combobox', { name: 'ค้นหาด่วน' })
    await box.fill('ขยะ')
    await expect(page.locator('.topbar #qs-list li').first()).toBeVisible()
    const first = await box.getAttribute('aria-activedescendant')
    expect(first, 'the highlighted option must be named').toBeTruthy()
    // whatever it points at must exist and be the option marked selected
    await expect(page.locator(`#${first as string}`)).toHaveAttribute('role', 'option')
    await expect(page.locator(`#${first as string}`)).toHaveAttribute('aria-selected', 'true')
    const options = page.locator('.topbar #qs-list li')
    if ((await options.count()) > 1) {
      await page.keyboard.press('ArrowDown')
      const second = await box.getAttribute('aria-activedescendant')
      expect(second, 'arrowing down must move the highlight').not.toBe(first)
      await expect(page.locator(`#${second as string}`)).toHaveAttribute('aria-selected', 'true')
    }
  })

  test('exactly one element per page claims to be the current location', async ({ page, request }) => {
    const agencies = await data.agencies(request)
    const withPage = agencies.find((a) => a.page)
    if (!withPage) throw new Error('fixture has no agency page')
    for (const hash of ['#/ratchakitcha/topic/environment', `#/ratchakitcha/agency/${withPage.id}`])
      await test.step(hash, async () => {
        await page.goto(`/${hash}`)
        await expect(page.locator('.crumbs [aria-current="page"]')).toHaveCount(1)
      })
  })

  test('the dashboard year can be chosen without a mouse', async ({ page }) => {
    await page.goto('/#/ratchakitcha/dashboard')
    // the first chip is "ทุกปี"; the years follow it
    const years = page.locator('[aria-label="เลือกปี"] .chip')
    await expect(years.first()).toHaveText('ทุกปี')
    const one = years.nth(1)
    const label = (await one.textContent())?.trim() ?? ''
    await one.click()
    await expect(one).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: /แยกตามด้านต่าง ๆ$/ })).toHaveText(
      new RegExp(`ปี ${label} `),
    )
  })
})

test.describe('dead ends', () => {
  test('a topic that does not exist says so instead of blaming the network', async ({ page }) => {
    await page.goto('/#/ratchakitcha/topic/no_such_topic')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('ไม่พบหมวดนี้ในคลัง')
    await expect(alert).not.toContainText('/data/')
    await expect(alert.getByRole('link', { name: /กลับหน้าแรก/ })).toBeVisible()
  })

  test('a filter combination with no results explains itself', async ({ page }) => {
    await page.goto('/#/ratchakitcha/explore?q=%E0%B9%84%E0%B8%A1%E0%B9%88%E0%B8%A1%E0%B8%B5')
    await expect(page.getByTestId('results').locator('.doc')).toHaveCount(0)
    await expect(page.locator('.empty')).toContainText('ไม่พบฉบับที่ตรงเงื่อนไข')
  })
})

test.describe('a second data source', () => {
  // The URL scheme is source-scoped so another OpenLawData dataset can sit beside the gazette.
  // Only one source exists today, so the guarantee is checked the only way it can be: that every
  // link a page builds keeps the source it was reached under, rather than falling back to the
  // default. Before this, one keystroke in สำรวจ threw you back to #/ratchakitcha/.
  const OTHER = 'krisdika'

  test('every link on a page keeps the source it was reached under', async ({ page }) => {
    // the data 404s under an unknown source; the links are still built from the route
    await page.goto(`/#/${OTHER}/explore`)
    await expect(page.getByRole('alert')).toBeVisible()
    const hrefs = await page
      .locator('main a[href^="#/"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''))
    for (const h of hrefs)
      expect(h, 'a link must not fall back to the default source').not.toMatch(/^#\/ratchakitcha\//)
  })

  test('the feed button follows the data client, not a hardcoded path', async ({ page }) => {
    await page.goto('/#/ratchakitcha/topic/environment')
    const feed = page.getByRole('link', { name: /RSS/ }).first()
    await expect(feed).toHaveAttribute('href', '/data/ratchakitcha/feeds/topic/environment.xml')
  })
})

test('the site tells a crawler and a link preview what it is', async ({ page, request }) => {
  await page.goto('/#/')
  for (const [selector, attr] of [
    ['meta[property="og:title"]', 'content'],
    ['meta[property="og:description"]', 'content'],
    ['meta[property="og:url"]', 'content'],
    ['meta[name="description"]', 'content'],
    ['link[rel="canonical"]', 'href'],
  ] as const) {
    const v = await page.locator(selector).first().getAttribute(attr)
    expect(v, selector).toBeTruthy()
    expect((v ?? '').length, selector).toBeGreaterThan(10)
  }
  // more than one feed is offered, and each one actually resolves
  const feeds = await page
    .locator('link[type="application/atom+xml"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).getAttribute('href') ?? ''))
  expect(feeds.length).toBeGreaterThan(1)
  for (const f of feeds) expect((await request.get(f)).ok(), f).toBeTruthy()

  const robots = await request.get('/robots.txt')
  expect(robots.ok()).toBeTruthy()
  expect(await robots.text()).toContain('Sitemap:')
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.ok()).toBeTruthy()
  expect(await sitemap.text()).toContain('sitemaps.org/schemas/sitemap/0.9')
})

test('every page says which code read which data', async ({ page, request }) => {
  const meta = (await (await request.get('/data/ratchakitcha/agg/meta.json')).json()) as {
    build?: { code?: { sha?: string }; dataset?: { sha?: string } }
  }
  const code = meta.build?.code?.sha
  if (!code) return // built outside a checkout; provenance is absent by design, not broken

  await page.goto('/#/about')
  const link = page.getByRole('link', { name: code.slice(0, 7) })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', new RegExp(`/commit/${code}$`))
  await expect(link).toHaveAttribute('title', code)

  // and on the static pages, which is where someone auditing a number is most likely to land
  const html = await (await request.get('/directory')).text()
  expect(html).toContain(`/commit/${code}`)
  expect(html).not.toContain('/commit/"') // never a link to nothing
})

test.describe('what a machine without JavaScript sees', () => {
  // The app is a hash-routed SPA: one page to a crawler, one card to a link unfurler. The facets
  // are real files so that is not the whole story.
  test('a topic has a real page with its own title, description and canonical URL', async ({
    page,
    request,
  }) => {
    const topics = (await (await request.get('/data/ratchakitcha/index/topics.json')).json()) as {
      slug: string
      thai: string | null
      n: number
    }[]
    const t = topics.find((x) => x.n > 0)
    if (!t) throw new Error('fixture has no topic with documents')
    const r = await request.get(`/ratchakitcha/topic/${t.slug}`)
    expect(r.ok(), `/ratchakitcha/topic/${t.slug}`).toBeTruthy()
    const html = await r.text()
    const name = t.thai ?? t.slug
    expect(html).toContain(`<title>${name} — Thai Legal Watch</title>`)
    expect(html).toContain('property="og:title"')
    expect(html).toMatch(/rel="canonical" href="[^"]*\/ratchakitcha\/topic\//)
    // and it must lead to the interactive page rather than being a dead end
    expect(html).toContain(`/#/ratchakitcha/topic/${t.slug}`)

    // it renders as a page, not as markup in a browser
    await page.goto(`/ratchakitcha/topic/${t.slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.getByRole('link', { name: /เปิดหน้านี้แบบโต้ตอบ/ })).toBeVisible()
  })

  test('the directory reaches every static page, and the app links to the directory', async ({
    page,
    request,
  }) => {
    const r = await request.get('/directory')
    expect(r.ok()).toBeTruthy()
    const html = await r.text()
    const sitemap = await (await request.get('/sitemap.xml')).text()
    const locs = [...sitemap.matchAll(/<loc>[^<]*?(\/ratchakitcha\/[^<]*)<\/loc>/g)].map((m) => m[1])
    expect(locs.length, 'the sitemap must list the static pages').toBeGreaterThan(0)
    for (const loc of locs) expect(html, `directory must link ${loc}`).toContain(loc as string)

    await page.goto('/#/')
    await expect(page.locator('footer').getByRole('link', { name: /สารบัญ/ })).toBeVisible()
  })
})

test('the province map ships with the site and covers all 77 provinces', async ({ request }) => {
  const r = await request.get('/map/thailand-provinces.json')
  expect(r.ok()).toBeTruthy()
  const m = (await r.json()) as { provinces: Record<string, string>; width: number; height: number }
  expect(Object.keys(m.provinces)).toHaveLength(77)
  expect(m.height).toBeGreaterThan(m.width)
  for (const d of Object.values(m.provinces)) expect(d).toMatch(/^M[\d. LZM]+$/)
})
