import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
})

const doc = { source: 'x', width: 460, height: 833, provinces: { ตรัง: 'M1 1L2 2Z' } }

const ok = () =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify(doc), { status: 200 }))) as unknown as typeof fetch

it('fetches the outlines once and reuses them', async () => {
  const { loadProvinceMap } = await import('./thaimap')
  const f = ok()
  const a = await loadProvinceMap(f)
  const b = await loadProvinceMap(f)
  expect(a.provinces['ตรัง']).toBe('M1 1L2 2Z')
  expect(b).toBe(a)
  expect(f).toHaveBeenCalledTimes(1)
})

it('does not cache a failure, so a retry can still succeed', async () => {
  const { loadProvinceMap } = await import('./thaimap')
  const bad = vi.fn(() => Promise.resolve(new Response('nope', { status: 503 }))) as unknown as typeof fetch
  await expect(loadProvinceMap(bad)).rejects.toThrow(/503/)
  const good = ok()
  await expect(loadProvinceMap(good)).resolves.toMatchObject({ width: 460 })
})
