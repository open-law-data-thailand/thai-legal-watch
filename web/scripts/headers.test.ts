import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { headersFor, matches, parseHeaders, productionHeaders } from './headers'

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

/** The middleware, driven directly. Pages answers a missing path with 404.html and
 *  `Cache-Control: no-store` — checked against the deployed site — so preview has to as well. */
function serve(url: string) {
  const dir = mkdtempSync(join(tmpdir(), 'tlw-headers-'))
  const dist = join(dir, 'dist')
  mkdirSync(join(dist, 'data'), { recursive: true })
  writeFileSync(join(dist, '404.html'), '<!doctype html>ไม่พบหน้านี้')
  writeFileSync(join(dist, 'data', 'real.json'), '{}')
  const headersFile = join(dir, '_headers')
  writeFileSync(
    headersFile,
    '/data/*\n  Cache-Control: public, max-age=3600, stale-while-revalidate=86400\n\n/*\n  X-Content-Type-Options: nosniff\n',
  )
  const plugin = productionHeaders(headersFile)
  let mw!: (req: unknown, res: unknown, next: () => void) => void
  const configure = plugin.configurePreviewServer as (s: unknown) => void
  configure({
    config: { root: dir, build: { outDir: 'dist' } },
    middlewares: {
      use: (fn: (req: unknown, res: unknown, next: () => void) => void) => {
        mw = fn
      },
    },
  })
  const headers: Record<string, string> = {}
  const res = {
    statusCode: 200,
    setHeader: (k: string, v: string) => {
      headers[k] = v
    },
    removeHeader: (k: string) => {
      delete headers[k]
    },
    getHeaderNames: () => Object.keys(headers),
    end: () => undefined,
  }
  let passedOn = false
  mw({ method: 'GET', url }, res, () => {
    passedOn = true
  })
  return { headers, status: res.statusCode, passedOn }
}

describe('the 404 a preview serves', () => {
  it('does not let a missing data file inherit the long cache of /data/*', () => {
    // This shipped: a 404 under /data/* carried max-age=3600 with a day of
    // stale-while-revalidate, so the page said "โหลดข้อมูลไม่สำเร็จ" for an hour after the file
    // was in place — and only in preview, which is the divergence this plugin exists to remove.
    const r = serve('/data/ratchakitcha/agg/cube.json')
    expect(r.status).toBe(404)
    expect(r.headers['Cache-Control']).toBe('no-store')
    expect(r.headers['Content-Type']).toBe('text/html; charset=utf-8')
  })

  it('keeps no rule from _headers on the 404 at all', () => {
    expect(serve('/data/nope.json').headers['X-Content-Type-Options']).toBeUndefined()
  })

  it('leaves a file that exists to be served with its headers', () => {
    const r = serve('/data/real.json')
    expect(r.passedOn).toBe(true)
    expect(r.status).toBe(200)
    expect(r.headers['Cache-Control']).toContain('max-age=3600')
  })
})
