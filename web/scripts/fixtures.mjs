// Regenerate public/data from the pipeline's synthetic dataset so e2e never touches the network.
// The static facet pages are moved out of the data tree the same way infra/deploy.sh moves them,
// so the preview e2e runs against has the same shape as a real deployment: /directory,
// /sitemap.xml and /<source>/topic/<slug> at the site root.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const web = resolve(import.meta.dirname, '..')
const pipeline = resolve(web, '../pipeline')
const py = existsSync(resolve(pipeline, '.venv/bin/python'))
  ? resolve(pipeline, '.venv/bin/python')
  : 'python3'
const data = resolve(web, 'public/data')

// anything a previous run left at the site root
for (const p of ['public/directory.html', 'public/sitemap.xml', 'public/ratchakitcha'])
  rmSync(resolve(web, p), { recursive: true, force: true })

// four years, so e2e reaches the whole-archive paths that only appear when a filter's matches are
// spread over more months than one round of shard fetches covers
execFileSync(py, ['-m', 'tlw_pipeline.fixtures', '--out', data, '--years', '2021,2022,2023,2024'], {
  cwd: pipeline,
  stdio: 'inherit',
})

const site = resolve(data, '_site')
if (existsSync(site)) {
  cpSync(site, resolve(web, 'public'), { recursive: true })
  rmSync(site, { recursive: true, force: true })
}
