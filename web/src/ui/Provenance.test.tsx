import { expect, it } from 'vitest'
import { render } from '@testing-library/preact'
import { Provenance } from './Provenance'

const build = {
  code: { repo: 'https://github.com/o/r', sha: 'abcdef1234567890' },
  dataset: { repo: 'https://huggingface.co/datasets/o/d', sha: '1025158771624e7c' },
}

it('shows both commits, shortened, linked to the commit itself', () => {
  const { container } = render(<Provenance build={build} />)
  const links = [...container.querySelectorAll('a')]
  expect(links.map((a) => a.getAttribute('href'))).toEqual([
    'https://github.com/o/r/commit/abcdef1234567890',
    'https://huggingface.co/datasets/o/d/commit/1025158771624e7c',
  ])
  expect(links.map((a) => a.textContent)).toEqual(['abcdef1', '1025158'])
  // the full sha is still reachable
  expect(links[0]?.getAttribute('title')).toBe('abcdef1234567890')
})

it('shows whichever half it has', () => {
  const { container } = render(<Provenance build={{ code: build.code }} />)
  expect(container.querySelectorAll('a')).toHaveLength(1)
  expect(container.textContent).toContain('โค้ด')
  expect(container.textContent).not.toContain('ชุดข้อมูล')
})

it('says nothing at all rather than linking to nothing', () => {
  // a shell variable that did not expand arrives as whitespace
  for (const b of [undefined, {}, { code: { repo: 'https://x/y', sha: '   ' } }, { code: { sha: '' } }])
    expect(render(<Provenance build={b} />).container.textContent).toBe('')
})

it('prints the sha without a link when there is no repository to point at', () => {
  const { container } = render(<Provenance build={{ code: { sha: 'deadbeef00' } }} />)
  expect(container.querySelectorAll('a')).toHaveLength(0)
  expect(container.textContent).toContain('deadbee')
})
