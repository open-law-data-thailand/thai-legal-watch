import { describe, expect, it } from 'vitest'
import { href, hrefFor, parseHash } from './router'

describe('parseHash', () => {
  it('maps every source-scoped route and round-trips href()', () => {
    expect(parseHash('')).toEqual({ name: 'home' })
    expect(parseHash('#/')).toEqual({ name: 'home' })
    expect(parseHash('#/about')).toEqual({ name: 'about' })
    expect(parseHash(href.topic('pollution_waste'))).toEqual({
      name: 'topic',
      source: 'ratchakitcha',
      slug: 'pollution_waste',
    })
    expect(parseHash(href.agency('3f9c1e2a7b'))).toEqual({
      name: 'agency',
      source: 'ratchakitcha',
      id: '3f9c1e2a7b',
    })
    expect(parseHash(href.province('ตรัง'))).toEqual({
      name: 'province',
      source: 'ratchakitcha',
      file: 'ตรัง',
    })
    expect(parseHash(href.doc('2024-001232', '2024-03'))).toEqual({
      name: 'doc',
      source: 'ratchakitcha',
      id: '2024-001232',
      month: '2024-03',
    })
    expect(parseHash(href.doc('2024-001232'))).toEqual({
      name: 'doc',
      source: 'ratchakitcha',
      id: '2024-001232',
      month: undefined,
    })
    expect(parseHash(href.provinces())).toEqual({ name: 'provinces', source: 'ratchakitcha' })
    expect(parseHash(href.dashboard())).toEqual({ name: 'dashboard', source: 'ratchakitcha' })
    expect(parseHash(href.graph())).toEqual({ name: 'graph', source: 'ratchakitcha' })
    expect(parseHash('#/ratchakitcha')).toMatchObject({ name: 'explore', source: 'ratchakitcha' })
  })
  it('keeps explore filters as query params and other sources as their own prefix', () => {
    const r = parseHash(href.explore({ topic: 'health', govlevel: 'local', province: '' }))
    expect(r.name).toBe('explore')
    if (r.name === 'explore') {
      expect(r.q.get('topic')).toBe('health')
      expect(r.q.has('province')).toBe(false)
    }
    expect(parseHash(hrefFor('krisdika').topic('x'))).toEqual({
      name: 'topic',
      source: 'krisdika',
      slug: 'x',
    })
  })
  it('reports unknown or incomplete paths', () => {
    expect(parseHash('#/ratchakitcha/topic')).toMatchObject({ name: 'notfound' })
    expect(parseHash('#/Bad Source/topic/x')).toMatchObject({ name: 'notfound' })
    expect(parseHash('#/ratchakitcha/nope/x')).toMatchObject({
      name: 'notfound',
      path: '/ratchakitcha/nope/x',
    })
  })
})
