/** Parse a gazette citation the way lawyers write it: "เล่ม 143 ตอนพิเศษ 219 ง หน้า 23",
 *  "เล่ม ๑๔๓ ตอนที่ ๑๗ ก หน้า ๔", "143/219ง/23". Thai digits welcome. */
export interface Citation {
  volume: number
  part: string
  page: number | null
}

const TH = '๐๑๒๓๔๕๖๗๘๙'
const arab = (s: string) => s.replace(/[๐-๙]/g, (c) => String(TH.indexOf(c)))

export function parseCitation(input: string): Citation | null {
  const s = arab(input).replace(/\s+/g, ' ').trim()
  const long =
    /เล่ม\s*(\d{1,3})\s*ตอน\s*(พิเศษ|ที่)?\s*(\d{1,4})\s*([กขคง])(?:\s*(พิเศษ))?(?:\s*หน้า\s*(\d{1,4}))?/.exec(
      s,
    )
  if (long) {
    const special = long[2] === 'พิเศษ' || long[5] === 'พิเศษ'
    return {
      volume: Number(long[1]),
      part: `${long[3]} ${long[4]}${special ? ' พิเศษ' : ''}`,
      page: long[6] ? Number(long[6]) : null,
    }
  }
  const short = /^(\d{1,3})\s*\/\s*(\d{1,4})\s*([กขคง])\s*(พ|พิเศษ)?\s*(?:\/\s*(\d{1,4}))?$/.exec(s)
  if (short)
    return {
      volume: Number(short[1]),
      part: `${short[2]} ${short[3]}${short[4] ? ' พิเศษ' : ''}`,
      page: short[5] ? Number(short[5]) : null,
    }
  return null
}

/** Volume n of the gazette is year 1883 + n (เล่ม 143 = 2026). */
export const yearOfVolume = (volume: number) => 1883 + volume

/** Among the documents of one ตอน, the cited page belongs to the document that starts at or before it. */
export function pickByPage<T extends { pg: number | null }>(docs: T[], page: number | null): T | null {
  const inPart = docs.filter((d) => d.pg !== null).sort((a, b) => (a.pg ?? 0) - (b.pg ?? 0))
  if (!inPart.length) return docs[0] ?? null
  if (page === null) return inPart[0] ?? null
  let best: T | null = null
  for (const d of inPart) if ((d.pg ?? 0) <= page) best = d
  return best ?? inPart[0] ?? null
}
