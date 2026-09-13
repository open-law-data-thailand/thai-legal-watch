import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/preact'
import type { SlimDoc } from '../data/types'
import { Bars, displayTitle, NO_TITLE, StaleNotice } from './bits'

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

describe('displayTitle', () => {
  const doc = (o: Partial<SlimDoc>): SlimDoc => ({
    id: '2025-000001',
    t: 'ประกาศกระทรวง เรื่อง อะไรสักอย่าง',
    d: '2025-07-14',
    v: 142,
    p: '244 ง',
    pg: 1,
    dt: 'ประกาศ',
    a: 'a1',
    pr: null,
    topic: null,
    action: null,
    govlevel: null,
    tc: false,
    ac: false,
    gc: false,
    labels: [],
    ...o,
  })

  it('uses the real title when there is one', () => {
    expect(displayTitle(doc({}))).toEqual({ text: 'ประกาศกระทรวง เรื่อง อะไรสักอย่าง', missing: false })
  })

  it('names the document by its type and issuer when the dataset has no title', () => {
    // 673 of these are one batch of bankruptcy notices from July 2025 — exactly the documents
    // somebody is checking a name against, and "(ไม่มีชื่อเรื่อง)" tells them nothing
    expect(displayTitle(doc({ t: NO_TITLE }), 'เจ้าพนักงานพิทักษ์ทรัพย์')).toEqual({
      text: 'ประกาศ · เจ้าพนักงานพิทักษ์ทรัพย์',
      missing: true,
    })
  })

  it('treats an empty or whitespace title as missing too', () => {
    expect(displayTitle(doc({ t: '' }), 'ก').missing).toBe(true)
    expect(displayTitle(doc({ t: '   ' }), 'ก').missing).toBe(true)
  })

  it('falls back again when there is no type or issuer either', () => {
    const d = displayTitle(doc({ t: NO_TITLE, dt: null }), null)
    expect(d.missing).toBe(true)
    expect(d.text).toContain('ยังไม่มีชื่อเรื่อง')
  })

  it('uses whichever of the two it has', () => {
    expect(displayTitle(doc({ t: NO_TITLE, dt: null }), 'กรมที่ดิน').text).toBe('กรมที่ดิน')
    expect(displayTitle(doc({ t: NO_TITLE }), null).text).toBe('ประกาศ')
  })
})
