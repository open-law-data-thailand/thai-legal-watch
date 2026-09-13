import { describe, expect, it } from 'vitest'
import { href, parseHash } from './router'

describe('parseHash', () => {
  it('maps every route and round-trips href()', () => {
    expect(parseHash('')).toEqual({ name: 'home' })
    expect(parseHash('#/')).toEqual({ name: 'home' })
    expect(parseHash(href.topic('pollution_waste'))).toEqual({ name: 'topic', slug: 'pollution_waste' })
    expect(parseHash(href.agency('3f9c1e2a7b'))).toEqual({ name: 'agency', id: '3f9c1e2a7b' })
    expect(parseHash(href.province('ตรัง'))).toEqual({ name: 'province', file: 'ตรัง' })
    expect(parseHash(href.doc('2024-001232', '2024-03'))).toEqual({
      name: 'doc',
      id: '2024-001232',
      month: '2024-03',
    })
    expect(parseHash(href.doc('2024-001232'))).toEqual({ name: 'doc', id: '2024-001232', month: undefined })
    expect(parseHash('#/dashboard')).toEqual({ name: 'dashboard' })
    expect(parseHash('#/about')).toEqual({ name: 'about' })
  })
  it('keeps explore filters as query params', () => {
    const r = parseHash(href.explore({ topic: 'health', govlevel: 'local', province: '' }))
    expect(r.name).toBe('explore')
    if (r.name === 'explore') {
      expect(r.q.get('topic')).toBe('health')
      expect(r.q.has('province')).toBe(false)
    }
  })
  it('reports unknown or incomplete paths', () => {
    expect(parseHash('#/topic')).toMatchObject({ name: 'notfound' })
    expect(parseHash('#/nope/x')).toMatchObject({ name: 'notfound', path: '/nope/x' })
  })
})
