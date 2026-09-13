import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function a11y(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze()
  expect(
    r.violations,
    JSON.stringify(
      r.violations.map((v) => ({ id: v.id, nodes: v.nodes.length })),
      null,
      1,
    ),
  ).toEqual([])
}

test.describe('home', () => {
  test('shows the latest day, metrics, topic bars and a data credit', async ({ page }) => {
    await page.goto('/#/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('วันนี้ในราชกิจจานุเบกษา')
    const metrics = page.getByTestId('today-metrics')
    await expect(metrics.locator('.metric')).toHaveCount(4)
    await expect(metrics.locator('.value').first()).not.toHaveText('0')
    await expect(page.locator('footer')).toContainText('OpenLawData')
    await expect(page).toHaveTitle(/Thai Legal Watch/)
    await a11y(page)
  })
})

test.describe('explore', () => {
  test('filters by topic chip and title search; results and CSV button react', async ({ page }) => {
    await page.goto('/#/explore')
    const results = page.getByTestId('results')
    await expect(results.locator('.doc').first()).toBeVisible()
    const all = await results.locator('.doc').count()
    await page.getByRole('button', { name: 'ล้มละลาย' }).click()
    await expect(page).toHaveURL(/topic=bankruptcy/)
    await expect.poll(() => results.locator('.doc').count()).toBeLessThan(all)
    await expect(results.locator('.doc .pill.topic').first()).toContainText('ล้มละลาย')
    await page.getByPlaceholder(/ขยะ/).fill('ไม่มีคำนี้แน่นอน')
    await expect(results.locator('.doc')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /ดาวน์โหลด CSV/ })).toBeDisabled()
    await a11y(page)
  })
})

test.describe('facet pages', () => {
  test('topic page rolls up children and links to documents', async ({ page }) => {
    await page.goto('/#/topic/environment')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('สิ่งแวดล้อม')
    await expect(page.locator('.chip', { hasText: 'มลพิษ' })).toBeVisible()
    const recent = page.getByTestId('recent')
    await expect(recent.locator('.doc').first()).toBeVisible()
    await recent.locator('.doc a.title').first().click()
    await expect(page.getByTestId('doc-title')).toBeVisible()
    await a11y(page)
  })
  test('province page and agency page render from the index', async ({ page, request }) => {
    const provinces = (await (await request.get('/data/index/provinces.json')).json()) as {
      file: string
      name: string
    }[]
    await page.goto(`/#/province/${encodeURIComponent(provinces[0].file)}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(provinces[0].name)
    const agencies = (await (await request.get('/data/index/agencies.json')).json()) as {
      id: string
      name: string
      page: boolean
    }[]
    const withPage = agencies.find((a) => a.page)
    if (!withPage) throw new Error('fixture has no agency page')
    await page.goto(`/#/agency/${withPage.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(withPage.name)
    await a11y(page)
  })
})

test.describe('document', () => {
  test('shows coordinates, evidence, citation, and a working copy button', async ({
    page,
    request,
    context,
  }) => {
    const years = (await (await request.get('/data/agg/years.json')).json()) as {
      by_month: Record<string, number>
    }
    const month = Object.keys(years.by_month).sort().pop() as string
    const docs = (await (await request.get(`/data/docs/${month.slice(0, 4)}/${month}.json`)).json()) as {
      id: string
      t: string
    }[]
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/#/doc/${docs[0].id}`)
    await expect(page.getByTestId('doc-title')).toHaveText(docs[0].t)
    await expect(page.getByTestId('citation')).toContainText('ราชกิจจานุเบกษา เล่ม 141')
    await expect(page.getByTestId('evidence').locator('.lab')).not.toHaveCount(0)
    await page.getByTestId('cite').click()
    await expect(page.getByTestId('cite')).toHaveText(/คัดลอกแล้ว/)
    await a11y(page)
  })
  test('unknown id is an error, not a blank page', async ({ page }) => {
    await page.goto('/#/doc/2024-999999')
    await expect(page.getByRole('alert')).toContainText('ไม่พบเอกสาร')
    await page.goto('/#/nope')
    await expect(page.getByRole('alert')).toContainText('ไม่พบหน้า')
  })
})

test.describe('dashboard and about', () => {
  test('charts mount and the about page states the accuracy', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByTestId('chart-years').locator('svg')).toBeVisible()
    await expect(page.getByTestId('chart-funnel').locator('svg')).toBeVisible()
    await page.goto('/#/about')
    await expect(page.getByText('100% (ช่วงเชื่อมั่น 98.6–100)')).toBeVisible()
    await a11y(page)
  })
})

test('feeds are served as Atom', async ({ request }) => {
  const r = await request.get('/data/feeds/topic/pollution_waste.xml')
  expect(r.ok()).toBeTruthy()
  expect(await r.text()).toContain('<feed xmlns="http://www.w3.org/2005/Atom">')
})
