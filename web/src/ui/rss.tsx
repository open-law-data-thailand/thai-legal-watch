/** The RSS mark, and the one-click routes into the readers people actually use.
 *
 *  The orange square is the one symbol a reader recognises without a label, which is the whole
 *  reason to draw it rather than write "RSS" — but it is decoration, so it is hidden from
 *  assistive technology and the control around it carries the words. */

/** The standard RSS glyph: a dot and two arcs, at the same origin. */
export function RssMark({ size = 16 }: { size?: number }) {
  return (
    <svg class="rss-mark" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="6.3" cy="17.7" r="2.4" fill="currentColor" />
      <path
        d="M4 10.4a9.6 9.6 0 0 1 9.6 9.6M4 4.2A15.8 15.8 0 0 1 19.8 20"
        fill="none"
        stroke="currentColor"
        stroke-width="2.7"
        stroke-linecap="round"
      />
    </svg>
  )
}

/** Readers that subscribe from a URL in the address bar, so a link is all it takes.
 *
 *  Each takes the feed address as a parameter and opens its own "add this?" screen — the reader
 *  confirms there, so following one of these never signs anybody up for anything. The feed
 *  address is public and carries nothing about who followed the link. */
export const ONE_CLICK: { id: string; label: string; url: (feed: string) => string }[] = [
  {
    id: 'feedly',
    label: 'Feedly',
    url: (f) => `https://feedly.com/i/subscription/feed/${encodeURIComponent(f)}`,
  },
  {
    id: 'inoreader',
    label: 'Inoreader',
    url: (f) => `https://www.inoreader.com/?add_feed=${encodeURIComponent(f)}`,
  },
  {
    id: 'newsblur',
    label: 'NewsBlur',
    url: (f) => `https://newsblur.com/?url=${encodeURIComponent(f)}`,
  },
]

const FEEDLY = ONE_CLICK[0]

/** "Add to Feedly" — the one reader common enough to earn a button of its own on every row. */
export function FeedlyButton({ feed, name }: { feed: string; name: string }) {
  if (!FEEDLY) return null
  return (
    <a class="btn btn-feedly" href={FEEDLY.url(feed)} target="_blank" rel="noreferrer">
      + {FEEDLY.label}
      <span class="sr-only">{` — ${name}`}</span>
    </a>
  )
}

/** The raw feed, behind the mark people already know. The label says what it is, because an icon
 *  on its own tells a screen reader nothing and tells a first-time visitor very little. */
export function FeedLink({ feed, name }: { feed: string; name: string }) {
  return (
    <a class="btn btn-icon" href={feed} target="_blank" rel="noreferrer" title={`ไฟล์ feed ของ ${name}`}>
      <RssMark size={14} />
      <span class="sr-only">{`เปิดไฟล์ feed ของ ${name}`}</span>
    </a>
  )
}
