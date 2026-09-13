/** Every topic page shared one tab title and every one of the 2,841 agency pages shared another,
 *  which makes browser history, bookmarks and tab-switching useless. A route calls this once its
 *  data has arrived and it knows what it is actually showing.
 *
 *  This runs after the router's own generic title because data arrives asynchronously, so the
 *  effect ordering (children before parents) never gets a chance to undo it. */
import { useEffect } from 'preact/hooks'

export const SITE = 'Thai Legal Watch'

export function useTitle(name: string | null | undefined, suffix?: string) {
  useEffect(() => {
    if (!name) return
    document.title = `${name}${suffix ? ` · ${suffix}` : ''} — ${SITE}`
  }, [name, suffix])
}

/** Session memory of the last สำรวจ URL, so a document page can offer the way back to the exact
 *  filtered list somebody came from. Storage throws outright in some privacy modes, and losing
 *  the back link is never worth taking the page down with it. */
const KEY = 'tlw:lastExplore'

export function rememberExplore(hash: string): void {
  try {
    sessionStorage.setItem(KEY, hash)
  } catch {
    /* private mode, blocked storage: the back link is a convenience, not a requirement */
  }
}

export function lastExplore(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}
