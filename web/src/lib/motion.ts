import { useEffect, useState } from 'preact/hooks'

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Counts from 0 to `target` over ~700 ms with an ease-out; instant when motion is reduced. */
export function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(reducedMotion() ? target : 0)
  useEffect(() => {
    if (reducedMotion() || target === 0) {
      setV(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [target, ms])
  return v
}
