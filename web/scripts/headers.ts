/** Make `vite preview` behave like Cloudflare Pages: the same headers, and the same answer for a
 *  path that is not a file.
 *
 *  Both halves exist because of bugs that reached production and could not be seen from here.
 *  The Content-Security-Policy named four Hugging Face hosts by hand, the redirect went to a
 *  fifth, and the browser blocked the document text — every test passed, because a preview server
 *  sends no policy at all. And an unmatched path answered 200 with the application, a soft 404,
 *  because vite preview falls back to `index.html` where Pages serves `404.html`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

export interface Rule {
  /** the path pattern as written in `_headers` */
  path: string
  headers: [string, string][]
}

/** Cloudflare's `_headers` format: a path on its own line, then indented `Name: value` lines.
 *  `#` starts a comment. Only what this site actually uses is supported. */
export function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd()
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      rules.push({ path: line.trim(), headers: [] })
      continue
    }
    const at = line.indexOf(':')
    const rule = rules[rules.length - 1]
    if (at > 0 && rule) rule.headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()])
  }
  return rules.filter((r) => r.headers.length > 0)
}

/** Cloudflare matches `*` against any run of characters, including `/`. Later rules win for a
 *  header they both set, which is how the per-source feed blocks override `/data/*`. */
export function matches(pattern: string, path: string): boolean {
  const rx = new RegExp(
    '^' +
      pattern
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$',
  )
  return rx.test(path)
}

export function headersFor(rules: Rule[], path: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rules) if (matches(r.path, path)) for (const [k, v] of r.headers) out[k] = v
  return out
}

/** What Cloudflare Pages serves for a path: the file, `<path>.html`, `<path>/index.html`, or
 *  nothing — and "nothing" means the 404 page, not the application. */
export function resolveAsset(root: string, path: string): string | null {
  const rel = decodeURIComponent(path).replace(/^\/+/, '')
  const isFile = (p: string) => existsSync(p) && statSync(p).isFile()
  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    if (!candidate || candidate.includes('..')) continue
    const full = join(root, candidate)
    if (isFile(full)) return full
  }
  return null
}

export function productionHeaders(file = '../infra/_headers'): Plugin {
  let rules: Rule[] = []
  let root = 'dist'
  return {
    name: 'tlw-production-headers',
    configurePreviewServer(server) {
      root = resolve(server.config.root, server.config.build.outDir)
      try {
        rules = parseHeaders(readFileSync(resolve(process.cwd(), file), 'utf8'))
      } catch {
        // a checkout without infra/ is still a usable preview, just an unguarded one
      }
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0] ?? '/'
        for (const [k, v] of Object.entries(headersFor(rules, path))) res.setHeader(k, v)

        // Pages answers an unmatched path with 404.html, not with the application. vite preview
        // falls back to index.html, which is how a soft 404 went unnoticed in production.
        // Pages does this for any unmatched path, not only for ones that asked for HTML — which
        // is why the data client checks the content type of what comes back rather than the
        // status. Matching that here keeps the client's guard honest.
        const notFound = join(root, '404.html')
        if (
          (req.method === 'GET' || req.method === 'HEAD') &&
          path !== '/' &&
          existsSync(notFound) &&
          !resolveAsset(root, path)
        ) {
          // Pages does NOT apply `_headers` to a 404 — it answers `Cache-Control: no-store`,
          // verified against the deployed site. Leaving the matched rules on meant a missing
          // file under `/data/*` was cached as a 404 for an hour, with a day of
          // stale-while-revalidate behind it: the page kept saying "โหลดข้อมูลไม่สำเร็จ" long
          // after the file was there, and only here, which is the exact divergence this
          // plugin exists to remove.
          for (const name of res.getHeaderNames()) res.removeHeader(name)
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(readFileSync(notFound))
          return
        }
        next()
      })
    },
  }
}
