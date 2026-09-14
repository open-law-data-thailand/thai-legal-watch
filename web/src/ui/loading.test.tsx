import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from '@testing-library/preact'
import { act } from 'preact/test-utils'
import { Loading } from './bits'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

it('says nothing for the first moment, so a cached page never flashes a loading line', () => {
  const { container } = render(<Loading what="สถิติ" />)
  const p = container.querySelector('p')
  // present, and announced as busy, from the first frame — it is the text that waits
  expect(p).not.toBeNull()
  expect(p?.getAttribute('aria-busy')).toBe('true')
  expect(p?.textContent).toBe('')
})

it('speaks up once the wait is long enough to be worth reporting', () => {
  const { container } = render(<Loading what="สถิติ" />)
  void act(() => {
    vi.advanceTimersByTime(200)
  })
  expect(container.querySelector('p')?.textContent).toContain('กำลังโหลดสถิติ')
})

it('reserves its line either way, so the text arriving pushes nothing', () => {
  const { container } = render(<Loading />)
  expect(container.querySelector('p')?.className).toContain('skeleton')
})
