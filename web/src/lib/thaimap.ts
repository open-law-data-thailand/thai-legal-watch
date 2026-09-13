/** The province outlines the map draws. Built from Natural Earth 1:10m Admin 1 (public domain)
 *  by `scripts/build_provinces_map.py`; already projected, so this module only fetches it. */
export interface ProvinceMap {
  source: string
  width: number
  height: number
  provinces: Record<string, string>
}

export const MAP_URL = '/map/thailand-provinces.json'

let cached: Promise<ProvinceMap> | null = null

export function loadProvinceMap(fetchImpl: typeof fetch = fetch): Promise<ProvinceMap> {
  cached ??= fetchImpl(MAP_URL)
    .then(async (r) => {
      if (!r.ok) throw new Error(`โหลดแผนที่ไม่สำเร็จ (${r.status})`)
      return (await r.json()) as ProvinceMap
    })
    .catch((e: unknown) => {
      cached = null
      throw e
    })
  return cached
}

/** Counts across provinces are very skewed (Bangkok has 25× the median), so a linear ramp would
 *  paint 70 provinces the same colour. Quantile bins keep the map readable; the legend says so. */
export function quantileBins(values: number[], bins = 5): number[] {
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return []
  const out: number[] = []
  for (let i = 1; i < bins; i++) {
    const at = Math.floor((i * sorted.length) / bins)
    out.push(sorted[Math.min(at, sorted.length - 1)] ?? 0)
  }
  return out
}

/** 0 … bins.length, where 0 is the lightest band. */
export function binOf(value: number, cuts: number[]): number {
  let i = 0
  while (i < cuts.length && value >= (cuts[i] ?? Infinity)) i++
  return i
}
