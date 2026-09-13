import { afterEach, expect, it, vi } from 'vitest'
import { render } from '@testing-library/preact'
import { SITE, lastExplore, rememberExplore, useTitle } from './title'

afterEach(() => {
  // unstub first: a stubbed storage has no clear()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

function Titled({ name, suffix }: { name: string | null; suffix?: string }) {
  useTitle(name, suffix)
  return null
}

it('names the page once its data has arrived', () => {
  render(<Titled name="สิ่งแวดล้อม" suffix="หมวด" />)
  expect(document.title).toBe(`สิ่งแวดล้อม · หมวด — ${SITE}`)
  render(<Titled name="ตรัง" />)
  expect(document.title).toBe(`ตรัง — ${SITE}`)
})

it('leaves the router-set title alone while there is nothing better to say', () => {
  document.title = 'placeholder'
  render(<Titled name={null} />)
  expect(document.title).toBe('placeholder')
})

it('remembers the last สำรวจ url and gives it back', () => {
  expect(lastExplore()).toBeNull()
  rememberExplore('#/ratchakitcha/explore?topic=bankruptcy')
  expect(lastExplore()).toBe('#/ratchakitcha/explore?topic=bankruptcy')
})

it('survives storage that refuses to work at all', () => {
  // private modes and locked-down browsers throw on access rather than returning null, and a
  // back link is never worth taking the page down for
  const boom = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
  }
  vi.stubGlobal('sessionStorage', boom)
  expect(() => {
    rememberExplore('#/x')
  }).not.toThrow()
  expect(lastExplore()).toBeNull()
})
