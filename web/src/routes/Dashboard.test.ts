import { expect, it } from 'vitest'
import { share } from './Dashboard'

it('never rounds an imperfect share up to a perfect one', () => {
  expect(share(729_566, 732_143)).toBe('99.6%')
  expect(share(732_143, 732_143)).toBe('100%')
  expect(share(1, 2)).toBe('50%')
  expect(share(0, 10)).toBe('0%')
})
