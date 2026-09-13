// Regenerate public/data from the pipeline's synthetic dataset so e2e never touches the network.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
const pipeline = resolve(import.meta.dirname, '../../pipeline')
const py = existsSync(resolve(pipeline, '.venv/bin/python'))
  ? resolve(pipeline, '.venv/bin/python')
  : 'python3'
execFileSync(py, ['-m', 'tlw_pipeline.fixtures', '--out', resolve(import.meta.dirname, '../public/data')], {
  cwd: pipeline,
  stdio: 'inherit',
})
