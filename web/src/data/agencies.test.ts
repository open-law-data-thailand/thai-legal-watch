import { describe, expect, it } from 'vitest'
import { decodeAgencies } from './agencies'
import type { AgencyIndexFile, AgencyIndexItem } from './types'

/** Mirror of the pipeline's encoder, so the test states the format rather than trusting it. */
function encode(rows: AgencyIndexItem[], minPage: number): AgencyIndexFile {
  const sorted = [...rows].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  let prev = ''
  const name = sorted.map((r) => {
    let k = 0
    while (k < Math.min(prev.length, r.name.length) && prev[k] === r.name[k]) k++
    prev = r.name
    return `${k}|${r.name.slice(k)}`
  })
  return { min_page: minPage, id: sorted.map((r) => r.id), name, n: sorted.map((r) => r.n) }
}

describe('decodeAgencies', () => {
  const rows: AgencyIndexItem[] = [
    { id: 'a', name: 'สำนักงานจังหวัดตาก', n: 9 },
    { id: 'b', name: 'สำนักงานจังหวัดตรัง', n: 4 },
    { id: 'c', name: '5|ชื่อที่ดูเหมือนตัวนับ', n: 1 },
  ]

  it('gives every name back exactly, most documents first', () => {
    const got = decodeAgencies(encode(rows, 5))
    expect(got.map((r) => [r.id, r.name])).toEqual([
      ['a', 'สำนักงานจังหวัดตาก'],
      ['b', 'สำนักงานจังหวัดตรัง'],
      ['c', '5|ชื่อที่ดูเหมือนตัวนับ'],
    ])
  })

  it('marks a page exactly when the count reaches the threshold', () => {
    expect(decodeAgencies(encode(rows, 5)).map((r) => r.page)).toEqual([true, undefined, undefined])
    expect(decodeAgencies(encode(rows, 4)).map((r) => r.page)).toEqual([true, true, undefined])
  })

  it('passes an already-decoded array through, for a build that predates the encoding', () => {
    const old: AgencyIndexItem[] = [{ id: 'a', name: 'ก', n: 3, page: true }]
    expect(decodeAgencies(old)).toBe(old)
  })
})
