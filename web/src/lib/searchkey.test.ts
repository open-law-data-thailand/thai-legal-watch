import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claimPendingFocus, focusSearch, forgetPendingFocus } from './searchkey'

const box = () => document.querySelector<HTMLInputElement>('.qs input')

beforeEach(() => {
  document.body.innerHTML = ''
  forgetPendingFocus()
})
afterEach(forgetPendingFocus)

const mount = () => {
  document.body.innerHTML = '<div class="qs"><input type="search" /></div>'
  return box()
}

describe('the "/" shortcut', () => {
  it('focuses a box that is already on the page', () => {
    const el = mount()
    expect(focusSearch()).toBe(true)
    expect(document.activeElement).toBe(el)
  })

  it('remembers a press that arrives before the box exists', () => {
    // the regression this exists for: the box moved onto the home page, behind its data fetch,
    // so an early "/" reached no listener at all and did nothing — silently, and only when slow
    expect(focusSearch()).toBe(false)
    const el = mount()
    expect(claimPendingFocus(el)).toBe(true)
    expect(document.activeElement).toBe(el)
  })

  it('only honours the press once', () => {
    focusSearch()
    const first = mount()
    expect(claimPendingFocus(first)).toBe(true)
    const second = mount()
    expect(claimPendingFocus(second)).toBe(false)
    expect(document.activeElement).not.toBe(second)
  })

  it('does not focus a box when no press is waiting', () => {
    const el = mount()
    expect(claimPendingFocus(el)).toBe(false)
    expect(document.activeElement).toBe(document.body)
  })

  it('is unbothered by a box that is not there when it claims', () => {
    focusSearch()
    expect(claimPendingFocus(null)).toBe(false)
    // and the press is still waiting for a box that does appear
    expect(claimPendingFocus(mount())).toBe(true)
  })
})
