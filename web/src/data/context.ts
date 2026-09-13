import { createContext } from 'preact'
import { useContext, useEffect, useMemo, useState } from 'preact/hooks'
import { DataClient } from './client'
import { hrefFor } from '../router'

export const ClientContext = createContext<DataClient>(new DataClient())
export const useClient = () => useContext(ClientContext)

/** Links for the source currently being read. Shared components used the default-source `href`,
 *  so on any second data source every topic pill, document link, feed button and filter change
 *  would have thrown the reader back to ratchakitcha — the one thing the source-scoped URL scheme
 *  exists to prevent. */
export function useHref(): ReturnType<typeof hrefFor> {
  const c = useClient()
  return useMemo(() => hrefFor(c.source), [c.source])
}

export type Loaded<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; error: unknown }

/** Load once per dependency change; never leaves a stale result on screen. */
export function useLoad<T>(load: (c: DataClient) => Promise<T>, deps: unknown[]): Loaded<T> {
  const c = useClient()
  const [st, setSt] = useState<Loaded<T>>({ state: 'loading' })
  useEffect(() => {
    let live = true
    setSt({ state: 'loading' })
    load(c).then(
      (data) => {
        if (live) setSt({ state: 'ok', data })
      },
      (error: unknown) => {
        if (live) setSt({ state: 'error', error })
      },
    )
    return () => {
      live = false
    }
    // This is the hook the rule is configured to check *callers* of; inside its own body the
    // dependency array is a parameter, so it cannot be verified here. `load` is deliberately not
    // a dependency: callers pass an inline closure, and including it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return st
}
