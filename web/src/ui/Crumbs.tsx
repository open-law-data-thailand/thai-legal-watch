import { href } from '../router'

export interface Crumb {
  label: string
  to?: string
}

/** Breadcrumb trail; the last item is the current page and is not a link. */
export function Crumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ label: 'วันนี้', to: href.home() }, ...items]
  return (
    <nav class="crumbs" aria-label="ตำแหน่งหน้า">
      {all.map((c, i) => (
        <span key={`${c.label}-${i}`}>
          {i > 0 && (
            <span class="sep" aria-hidden="true">
              ›
            </span>
          )}
          {c.to && i < all.length - 1 ? (
            <a href={c.to}>{c.label}</a>
          ) : (
            <span aria-current={i === all.length - 1 ? 'page' : undefined}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
