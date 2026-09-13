import { renderHook, waitFor } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import { h } from 'preact'
import { DataClient } from './client'
import { ClientContext, useLoad } from './context'

function withClient(files: Record<string, unknown>) {
  const client = new DataClient({
    fetchImpl: (input: RequestInfo | URL) => {
      const key = (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).replace(
        /^\/data\//,
        '',
      )
      const body = files[key]
      return Promise.resolve(
        body === undefined ? new Response('', { status: 404 }) : new Response(JSON.stringify(body)),
      )
    },
  })
  return ({ children }: { children: preact.ComponentChildren }) =>
    h(ClientContext.Provider, { value: client, children })
}

describe('useLoad', () => {
  it('goes loading → ok and reloads when deps change', async () => {
    const wrapper = withClient({ 'agg/topic/a.json': { slug: 'a' }, 'agg/topic/b.json': { slug: 'b' } })
    const { result, rerender } = renderHook(
      ({ slug }: { slug: string }) => useLoad((c) => c.topic(slug), [slug]),
      {
        wrapper,
        initialProps: { slug: 'a' },
      },
    )
    expect(result.current.state).toBe('loading')
    await waitFor(() => {
      expect(result.current).toMatchObject({ state: 'ok', data: { slug: 'a' } })
    })
    rerender({ slug: 'b' })
    await waitFor(() => {
      expect(result.current).toMatchObject({ state: 'ok', data: { slug: 'b' } })
    })
  })
  it('reports errors as state, never throws into render', async () => {
    const wrapper = withClient({})
    const { result } = renderHook(() => useLoad((c) => c.topic('missing'), []), { wrapper })
    await waitFor(() => {
      expect(result.current.state).toBe('error')
    })
  })
})
