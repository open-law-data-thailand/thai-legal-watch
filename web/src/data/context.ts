import { createContext } from 'preact'
import { useContext, useEffect, useState } from 'preact/hooks'
import { DataClient } from './client'

export const ClientContext = createContext<DataClient>(new DataClient())
export const useClient = () => useContext(ClientContext)

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
