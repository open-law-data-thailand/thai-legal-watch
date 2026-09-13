#!/usr/bin/env node
/** Point dist/data at a real pipeline build. Fixture data from `npm run e2e` lives in
 *  public/data and vite copies it into dist on the next build, which is how a preview ends up
 *  quietly serving 40 synthetic documents — so remove both, every time. */
import { existsSync, lstatSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const target = resolve(process.argv[2] ?? process.env.TLW_DATA ?? `${homedir()}/olw-build/tlw-dist`)
if (!existsSync(target)) {
  console.error(
    `no pipeline output at ${target}\n` +
      `run: tlw-build --root ~/olw-build/data --out ${target} --years 2005-2026`,
  )
  process.exit(1)
}
// `npm run e2e` rebuilds dist from fixtures, which replaces this symlink and also leaves the
// fixture static pages in public/ for the next build to copy back in. Clear all of it, not just
// the data: a preview that serves 160 synthetic documents next to a real page is worse than one
// that plainly fails, and it has fooled three sessions now.
for (const p of [
  'public/data',
  'dist/data',
  'public/directory.html',
  'public/sitemap.xml',
  'public/ratchakitcha',
])
  if (existsSync(p) || lstatSync(p, { throwIfNoEntry: false })) rmSync(p, { recursive: true, force: true })
symlinkSync(target, 'dist/data')
console.log(`dist/data -> ${target}`)
