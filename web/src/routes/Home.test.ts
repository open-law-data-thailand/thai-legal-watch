import { describe, expect, it } from 'vitest'
import type { Taxonomy } from '../data/types'
import { doorways } from './Home'

const tax = (topics: Record<string, { thai: string | null; parent: string | null; n: number }>) =>
  ({
    topics: Object.fromEntries(Object.entries(topics).map(([k, v]) => [k, { ...v, children: [] }])),
    actions: {},
    govlevels: {},
    action_counts: {},
    govlevel_counts: {},
  }) as unknown as Taxonomy

describe('doorways', () => {
  it('offers the biggest subjects, largest first', () => {
    const t = tax({
      a: { thai: 'ก', parent: null, n: 10 },
      b: { thai: 'ข', parent: null, n: 30 },
      c: { thai: 'ค', parent: null, n: 20 },
    })
    expect(doorways(t).map((d) => d.slug)).toEqual(['b', 'c', 'a'])
  })

  it('never offers a sub-topic: the front page is for people who do not know the tree', () => {
    const t = tax({
      a: { thai: 'ก', parent: null, n: 10 },
      a1: { thai: 'ก๑', parent: 'a', n: 99 },
    })
    expect(doorways(t).map((d) => d.slug)).toEqual(['a'])
  })

  it('skips a subject with no documents or no name, rather than printing a slug at a reader', () => {
    const t = tax({
      a: { thai: 'ก', parent: null, n: 10 },
      empty: { thai: 'ว่าง', parent: null, n: 0 },
      unnamed: { thai: null, parent: null, n: 50 },
    })
    expect(doorways(t).map((d) => d.slug)).toEqual(['a'])
  })

  it('stops at a number of choices somebody can actually read', () => {
    const many = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`t${i}`, { thai: `หมวด ${i}`, parent: null, n: 100 - i }]),
    )
    expect(doorways(tax(many))).toHaveLength(10)
    expect(doorways(tax(many), 4)).toHaveLength(4)
  })
})
