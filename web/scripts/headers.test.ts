import { describe, expect, it } from 'vitest'
import { headersFor, matches, parseHeaders } from './headers'

const SAMPLE = `# a comment
/data/*
  Cache-Control: public, max-age=3600
  Access-Control-Allow-Origin: *

# another comment
/data/ratchakitcha/feeds/*
  Content-Type: application/atom+xml; charset=utf-8

/*
  X-Content-Type-Options: nosniff
  # an indented comment
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://*.hf.co
`

describe('parseHeaders', () => {
  it('reads a path and the headers indented under it', () => {
    const rules = parseHeaders(SAMPLE)
    expect(rules.map((r) => r.path)).toEqual(['/data/*', '/data/ratchakitcha/feeds/*', '/*'])
    expect(rules[0]?.headers).toEqual([
      ['Cache-Control', 'public, max-age=3600'],
      ['Access-Control-Allow-Origin', '*'],
    ])
  })

  it('keeps a colon inside a value', () => {
    // every CSP has several, and splitting on the first one is the only reading that works
    const csp = parseHeaders(SAMPLE)
      .at(-1)
      ?.headers.find(([k]) => k === 'Content-Security-Policy')
    expect(csp?.[1]).toBe("default-src 'self'; connect-src 'self' https://*.hf.co")
  })

  it('drops comments, wherever they are', () => {
    expect(
      parseHeaders(SAMPLE)
        .at(-1)
        ?.headers.map(([k]) => k),
    ).toEqual(['X-Content-Type-Options', 'Content-Security-Policy'])
  })

  it('ignores a path with nothing under it', () => {
    expect(parseHeaders('/orphan\n\n/real\n  A: b\n').map((r) => r.path)).toEqual(['/real'])
  })
})

describe('matches', () => {
  it('lets * cross a slash, the way Cloudflare does', () => {
    expect(matches('/data/*', '/data/ratchakitcha/agg/meta.json')).toBe(true)
    expect(matches('/*', '/anything/at/all')).toBe(true)
  })

  it('anchors at both ends', () => {
    expect(matches('/data/*', '/other/data/x')).toBe(false)
    expect(matches('/about', '/about/more')).toBe(false)
  })

  it('does not treat a dot in the path as a wildcard', () => {
    expect(matches('/a.b', '/axb')).toBe(false)
  })
})

describe('headersFor', () => {
  const rules = parseHeaders(SAMPLE)

  it('applies every rule that matches', () => {
    const h = headersFor(rules, '/data/ratchakitcha/agg/meta.json')
    expect(h['Cache-Control']).toBe('public, max-age=3600')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
  })

  it('lets a later rule win, which is how the feed blocks override /data/*', () => {
    expect(headersFor(rules, '/data/ratchakitcha/feeds/topic/x.xml')['Content-Type']).toContain('atom')
  })

  it('gives an ordinary page the global rules only', () => {
    expect(Object.keys(headersFor(rules, '/index.html')).sort()).toEqual([
      'Content-Security-Policy',
      'X-Content-Type-Options',
    ])
  })
})
