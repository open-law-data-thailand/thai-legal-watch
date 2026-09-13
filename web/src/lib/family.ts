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

export function familyIndex(slug: string | null | undefined, tax: Taxonomy | undefined): number {
  if (!slug || !tax) return FAMILY_PALETTE.length - 1
  const parent: Record<string, string | null> = {}
  const roots: string[] = []
  for (const [s, t] of Object.entries(tax.topics)) {
    parent[s] = t.parent
    if (!t.parent) roots.push(s)
  }
  roots.sort()
  const i = roots.indexOf(rootOf(slug, parent))
  return i < 0 ? FAMILY_PALETTE.length - 1 : i % (FAMILY_PALETTE.length - 1)
}

export function familyColor(slug: string | null | undefined, tax: Taxonomy | undefined): string {
  return FAMILY_PALETTE[familyIndex(slug, tax)] ?? '#6b6b73'
}

/** A soft tint of a hex colour for pill backgrounds. */
export function tint(hex: string, alpha = 0.14): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
