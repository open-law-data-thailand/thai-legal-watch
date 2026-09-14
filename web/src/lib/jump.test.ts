import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jumpTo, onJump } from './jump'

// typed to the member it replaces, not to a bare mock: `tsc -b` checks this file and a
// `Mock<Procedure>` does not satisfy scrollIntoView's signature
let scrolled: ReturnType<typeof vi.fn<Element['scrollIntoView']>>

beforeEach(() => {
  document.body.innerHTML = '<main id="main">content</main><section id="fulltext">text</section>'
  // jsdom has no layout, so scrollIntoView is not implemented there at all
  scrolled = vi.fn<Element['scrollIntoView']>()
  Element.prototype.scrollIntoView = scrolled
})

describe('jumping inside a hash-routed page', () => {
  it('moves focus to the target so the keyboard carries on from there', () => {
    expect(jumpTo('main')).toBe(true)
    const main = document.getElementById('main')
    expect(document.activeElement).toBe(main)
    // a <main> is not focusable on its own; the standard skip-link technique makes it so
    expect(main?.getAttribute('tabindex')).toBe('-1')
    expect(scrolled).toHaveBeenCalled()
  })

  it('does not invent a tabindex where the author set one', () => {
    const el = document.getElementById('fulltext') as HTMLElement
    el.setAttribute('tabindex', '0')
    jumpTo('fulltext')
    expect(el.getAttribute('tabindex')).toBe('0')
  })

  it('says so when the target is not on the page, and changes nothing', () => {
    expect(jumpTo('nope')).toBe(false)
    expect(document.activeElement).toBe(document.body)
  })
})

describe('onJump', () => {
  it('stops the browser following the fragment, because that is a route change here', () => {
    // `href="#main"` parses as the explore page of a data source called "main": the skip link
    // used to throw a keyboard user off the page they were reading
    const e = new Event('click', { cancelable: true })
    onJump('main')(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('leaves the anchor alone when there is nothing to jump to', () => {
    const e = new Event('click', { cancelable: true })
    onJump('nope')(e)
    expect(e.defaultPrevented).toBe(false)
  })
})
