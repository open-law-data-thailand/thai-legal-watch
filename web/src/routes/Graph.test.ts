import { expect, it } from 'vitest'
import type { Graph } from '../data/types'
import { buildModel, focusOf, type GraphNode, type YearGraph } from './Graph'

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
  const m = buildModel(g, null, { minEdge: 100, agencies: true })
  const env = m.nodes.find((n) => n.id === 't:environment'),
    pol = m.nodes.find((n) => n.id === 't:pollution'),
    bk = m.nodes.find((n) => n.id === 't:bankruptcy')
  expect(env?.category).toBe(pol?.category)
  expect(env?.root).toBe('environment')
  expect(env?.category).not.toBe(bk?.category)
  expect((bk?.symbolSize ?? 0) > (env?.symbolSize ?? 0)).toBe(true)
})

it('drops edges and agencies under the threshold, keeps the tree edges', () => {
  const m = buildModel(g, null, { minEdge: 100, agencies: true })
  expect(m.links.filter((l) => l.value >= 100)).toHaveLength(2)
  expect(
    m.links.some((l) => l.source === 't:pollution' && l.target === 't:environment' && l.value === 0),
  ).toBe(true)
  expect(m.nodes.filter((n) => n.kind === 'agency').map((n) => n.id)).toEqual(['a:a1'])
  expect(buildModel(g, null, { minEdge: 100, agencies: false }).nodes.every((n) => n.kind === 'topic')).toBe(
    true,
  )
})

it('a year graph keeps every topic node but takes sizes and edges from that year', () => {
  const y: YearGraph = {
    year: '2024',
    topics: [{ slug: 'pollution', n: 10 }],
    agencies: [{ id: 'a1', name: 'อบต.', n: 3 }],
    topic_agency: [{ t: 'pollution', a: 'a1', n: 7 }],
    topic_topic: [],
  }
  const m = buildModel(g, y, { minEdge: 5, agencies: true })
  expect(m.nodes.filter((n) => n.kind === 'topic')).toHaveLength(3)
  expect(m.nodes.find((n) => n.id === 't:bankruptcy')?.value).toBe(0)
  expect(m.nodes.find((n) => n.id === 't:pollution')?.value).toBe(10)
  expect(m.links.filter((l) => l.value > 0)).toHaveLength(1)
})

it('focus dims rather than removes: family and text filters', () => {
  const m = buildModel(g, null, { minEdge: 100, agencies: true })
  const env = m.nodes.find((n) => n.id === 't:environment') as GraphNode
  const ag = m.nodes.find((n) => n.kind === 'agency') as GraphNode
  expect(focusOf(env, { families: new Set(['environment']), q: '' })).toBe(true)
  expect(focusOf(env, { families: new Set(['bankruptcy']), q: '' })).toBe(false)
  expect(focusOf(ag, { families: new Set(['environment']), q: '' })).toBe(false)
  expect(focusOf(env, { families: new Set(), q: 'สิ่ง แวด' })).toBe(true)
  expect(focusOf(env, { families: new Set(), q: 'ล้ม' })).toBe(false)
})
