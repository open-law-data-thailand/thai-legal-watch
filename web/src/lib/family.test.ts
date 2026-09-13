import { expect, it } from 'vitest'
import type { Taxonomy } from '../data/types'
import { familyColor, familyIndex, rootOf, tint } from './family'

const tax = {
  topics: {
    environment: { parent: null },
    pollution: { parent: 'environment' },
    bankruptcy: { parent: null },
  },
} as unknown as Taxonomy

it('children share their root colour; unknown slugs get the neutral one', () => {
  expect(familyColor('pollution', tax)).toBe(familyColor('environment', tax))
  expect(familyColor('bankruptcy', tax)).not.toBe(familyColor('environment', tax))
  expect(familyIndex('nope', tax)).toBe(10)
  expect(familyIndex(null, undefined)).toBe(10)
  expect(rootOf('pollution', { pollution: 'environment', environment: null })).toBe('environment')
})
it('tint turns a hex into rgba', () => {
  expect(tint('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
})
