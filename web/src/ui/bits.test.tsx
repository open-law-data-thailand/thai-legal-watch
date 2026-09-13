import { expect, it, vi, afterEach } from 'vitest'
import { render } from '@testing-library/preact'
import { Bars, StaleNotice } from './bits'

afterEach(() => {
  vi.useRealTimers()
})

const at = (iso: string, now: string) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(now))
  return render(<StaleNotice generatedAt={iso} />).container.textContent ?? ''
}

it('says nothing while the nightly is keeping up', () => {
  expect(at('2026-09-13T02:00:00+07:00', '2026-09-13T09:00:00+07:00')).toBe('')
  expect(at('2026-09-11T02:00:00+07:00', '2026-09-13T09:00:00+07:00')).toBe('')
})

it('warns once the data is older than the nightly could explain', () => {
  const out = at('2026-09-09T02:00:00+07:00', '2026-09-13T09:00:00+07:00')
  expect(out).toContain('ข้อมูลยังไม่อัปเดต')
  expect(out).toContain('4 วันก่อน')
})

it('stays quiet rather than guessing when there is no usable timestamp', () => {
  expect(render(<StaleNotice generatedAt={undefined} />).container.textContent).toBe('')
  expect(render(<StaleNotice generatedAt="not a date" />).container.textContent).toBe('')
})

it('Bars measures against the largest value, not the first row', () => {
  // the month-of-year profile arrives in calendar order, so the first row is January
  const rows: [string, number][] = [
    ['jan', 61_718],
    ['aug', 64_708],
    ['apr', 52_665],
  ]
  const { container } = render(<Bars rows={rows} nameOf={(k) => k} />)
  const widths = [...container.querySelectorAll('.bar > i')].map((el) =>
    Number(/width:\s*(\d+)%/.exec(el.getAttribute('style') ?? '')?.[1]),
  )
  expect(widths[1]).toBe(100) // August is the maximum
  expect(widths[0]).toBeLessThan(100) // January is not
  expect(widths[2]).toBeLessThan(widths[0])
  expect(Math.max(...widths)).toBe(100)
})

it('Bars does not divide by zero when everything is zero', () => {
  const { container } = render(
    <Bars
      rows={[
        ['a', 0],
        ['b', 0],
      ]}
      total={0}
      nameOf={(k) => k}
    />,
  )
  expect(container.innerHTML).not.toContain('NaN')
})
