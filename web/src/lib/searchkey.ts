/** "/" focuses the page's quick-search box.
 *
 *  The shortcut belongs to the application, not to the box. While a search box sat in the header
 *  it was mounted from the first paint and "/" always worked; moving the box onto the home page
 *  put it behind that page's data fetch, so the listener did not exist yet and an early press did
 *  nothing at all — silently, and only on a slow connection, which is the worst way for a
 *  keyboard shortcut to fail.
 *
 *  So the press is remembered. If the box is already there it is focused; if it is not, the next
 *  one to mount claims the press.
 */
let pending = false

/** Focus the search box on this page. Returns whether one was there to focus. */
export function focusSearch(): boolean {
  const box = document.querySelector<HTMLInputElement>('.qs input')
  if (!box) {
    pending = true
    return false
  }
  pending = false
  box.focus()
  return true
}

/** Called by a search box as it mounts, to take a press that arrived before it existed. */
export function claimPendingFocus(box: HTMLInputElement | null): boolean {
  if (!pending || !box) return false
  pending = false
  box.focus()
  return true
}

/** Tests share a module; this drops a press none of them meant to leave behind. */
export function forgetPendingFocus(): void {
  pending = false
}
