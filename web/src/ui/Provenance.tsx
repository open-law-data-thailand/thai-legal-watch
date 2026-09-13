/** Which code read which data. A site that publishes numbers about the law should let a reader
 *  find the exact pair of commits behind the one they are looking at. */
import type { BuildInfo } from '../data/types'

// trim first: a shell variable that did not expand arrives as whitespace, and "a commit link
// to nothing" is worse than showing no commit at all
const short = (sha: string | undefined) => {
  const t = sha?.trim()
  return t ? t.slice(0, 7) : null
}

function commitUrl(repo: string | undefined, sha: string | undefined): string | null {
  if (!repo?.trim() || !sha?.trim()) return null
  // GitHub and Hugging Face happen to spell a commit the same way
  return `${repo.trim().replace(/\/$/, '')}/commit/${sha.trim()}`
}

export function Provenance({ build, className }: { build: BuildInfo | undefined; className?: string }) {
  const code = short(build?.code?.sha)
  const data = short(build?.dataset?.sha)
  if (!code && !data) return null
  const codeUrl = commitUrl(build?.code?.repo, build?.code?.sha)
  const dataUrl = commitUrl(build?.dataset?.repo, build?.dataset?.sha)
  return (
    <span class={className}>
      {code && (
        <>
          โค้ด{' '}
          {codeUrl ? (
            <a href={codeUrl} title={build?.code?.sha}>
              <code>{code}</code>
            </a>
          ) : (
            <code>{code}</code>
          )}
        </>
      )}
      {code && data && ' · '}
      {data && (
        <>
          ชุดข้อมูล{' '}
          {dataUrl ? (
            <a href={dataUrl} title={build?.dataset?.sha}>
              <code>{data}</code>
            </a>
          ) : (
            <code>{data}</code>
          )}
        </>
      )}
    </span>
  )
}
