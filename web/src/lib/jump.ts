/** Move to a place on the current page without touching the address.
 *
 *  This application routes on `location.hash`, so an ordinary in-page anchor is not a jump — it
 *  is a route change. `href="#main"` parsed as the สำรวจ page of a data source called `main`,
 *  which meant the skip link, the first control a keyboard user meets on every page, threw them
 *  off the page they were reading. The test that guarded it read the link's href and never
 *  clicked it.
 *
 *  The markup stays a link, because "skip to content" is a link and that is what a screen reader
 *  announces; only its default action is replaced.
 */
import { reducedMotion } from './motion'

export function jumpTo(id: string): boolean {
  const el = document.getElementById(id)
  if (!el) return false
  // so the keyboard carries on from the target rather than from the top of the document
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
  el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
  return true
}

/** An onClick for an in-page anchor: jump, and leave the address alone. If the target is not
 *  there, the anchor is left to do whatever it would have done. */
export const onJump = (id: string) => (e: Event) => {
  if (jumpTo(id)) e.preventDefault()
}
