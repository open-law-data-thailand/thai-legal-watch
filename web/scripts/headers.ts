/** Serve `infra/_headers` from `vite preview`, so what the e2e runs against is what Cloudflare
 *  will send.
 *
 *  This exists because of a bug that reached production: the Content-Security-Policy named four
 *  Hugging Face hosts by hand, the redirect went to a fifth, and the browser blocked the document
 *  text. Every test passed, because a preview server sends no policy at all — the one environment
 *  where the rule applies was the one environment nobody could test in.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

export function productionHeaders(file = '../infra/_headers'): Plugin {
  let rules: Rule[] = []
  return {
    name: 'tlw-production-headers',
    configurePreviewServer(server) {
      try {
        rules = parseHeaders(readFileSync(resolve(process.cwd(), file), 'utf8'))
      } catch {
        // a checkout without infra/ is still a usable preview, just an unguarded one
        return
      }
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0] ?? '/'
        for (const [k, v] of Object.entries(headersFor(rules, path))) res.setHeader(k, v)
        next()
      })
    },
  }
}
