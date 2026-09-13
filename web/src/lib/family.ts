/** Colour families: every topic takes the colour of its root ancestor, everywhere on the site. */
import type { Taxonomy } from '../data/types'

export const FAMILY_PALETTE = [
  '#5b45c9',
  '#0f8a68',
  '#c9502a',
  '#2d7ac2',
  '#c2467a',
  '#a86a0f',
  '#5a8a1c',
  '#3d3489',
  '#0b6a5a',
  '#8a3a1a',
  '#6b6b73',
]

export function rootOf(slug: string, parent: Record<string, string | null | undefined>): string {
  let cur = slug
  for (let i = 0; i < 12 && parent[cur]; i++) cur = parent[cur] as string
  return cur
}

/** Walking and sorting the whole taxonomy per call meant rebuilding it a hundred times to paint
 *  one page of results. The taxonomy object is immutable once fetched, so it keys a cache. */
const FAMILY_CACHE = new WeakMap<Taxonomy, Map<string, number>>()

function familyMap(tax: Taxonomy): Map<string, number> {
  const hit = FAMILY_CACHE.get(tax)
  if (hit) return hit
  const parent: Record<string, string | null> = {}
  const roots: string[] = []
  for (const [s, t] of Object.entries(tax.topics)) {
    parent[s] = t.parent
    if (!t.parent) roots.push(s)
  }
  roots.sort()
  const map = new Map<string, number>()
  for (const s of Object.keys(tax.topics)) {
    const i = roots.indexOf(rootOf(s, parent))
    map.set(s, i < 0 ? FAMILY_PALETTE.length - 1 : i % (FAMILY_PALETTE.length - 1))
  }
  FAMILY_CACHE.set(tax, map)
  return map
}

export function familyIndex(slug: string | null | undefined, tax: Taxonomy | undefined): number {
  if (!slug || !tax) return FAMILY_PALETTE.length - 1
  return familyMap(tax).get(slug) ?? FAMILY_PALETTE.length - 1
}

export function familyColor(slug: string | null | undefined, tax: Taxonomy | undefined): string {
  return FAMILY_PALETTE[familyIndex(slug, tax)] ?? '#6b6b73'
}

/** A soft tint of a hex colour for pill backgrounds. */
export function tint(hex: string, alpha = 0.14): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
