import { expect, it } from 'vitest'
import type { Graph } from '../data/types'
import { buildModel, rootOf } from './Graph'

const g: Graph = {
  topics: [
    { slug: 'environment', thai: 'สิ่งแวดล้อม', parent: null, n: 1000 },
    { slug: 'pollution', thai: 'มลพิษ', parent: 'environment', n: 800 },
    { slug: 'bankruptcy', thai: 'ล้มละลาย', parent: null, n: 400000 },
  ],
  agencies: [
    { id: 'a1', name: 'อบต.', n: 50 },
    { id: 'a2', name: 'ศาล', n: 5 },
  ],
  topic_agency: [
    { t: 'pollution', a: 'a1', n: 300 },
    { t: 'bankruptcy', a: 'a2', n: 5 },
  ],
  topic_topic: [
    { a: 'bankruptcy', b: 'environment', n: 999 },
    { a: 'environment', b: 'pollution', n: 10 },
  ],
}

it('colours by root ancestor and sizes by log of count', () => {
  const parent = { environment: null, pollution: 'environment', bankruptcy: null }
  expect(rootOf('pollution', parent)).toBe('environment')
  const m = buildModel(g, { minEdge: 100, agencies: true })
  const env = m.nodes.find((n) => n.id === 't:environment'),
    pol = m.nodes.find((n) => n.id === 't:pollution'),
    bk = m.nodes.find((n) => n.id === 't:bankruptcy')
  expect(env?.category).toBe(pol?.category)
  expect(env?.category).not.toBe(bk?.category)
  expect((bk?.symbolSize ?? 0) > (env?.symbolSize ?? 0)).toBe(true)
})

it('drops edges and agencies under the threshold, keeps the tree edges', () => {
  const m = buildModel(g, { minEdge: 100, agencies: true })
  expect(m.links.filter((l) => l.value >= 100)).toHaveLength(2)
  expect(
    m.links.some((l) => l.source === 't:pollution' && l.target === 't:environment' && l.value === 0),
  ).toBe(true)
  expect(m.nodes.filter((n) => n.kind === 'agency').map((n) => n.id)).toEqual(['a:a1'])
  expect(buildModel(g, { minEdge: 100, agencies: false }).nodes.every((n) => n.kind === 'topic')).toBe(true)
})
