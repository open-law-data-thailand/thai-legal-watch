/** Copy one string to the clipboard and say so.
 *
 *  A feed address is only useful once it is inside another program, so the copy either works or
 *  has to admit it did not: `navigator.clipboard` is absent over plain http and can be refused
 *  by permission, and a button that silently does nothing leaves the reader pasting an empty
 *  clipboard into their reader and blaming the feed. */
import { useEffect, useRef, useState } from 'preact/hooks'

export function CopyButton({
  text,
  label,
  done = 'คัดลอกแล้ว',
  klass = 'btn',
}: {
  text: string
  label: string
  done?: string
  klass?: string
}) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )
  const reset = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setState('idle')
    }, 1600)
  }
  const copy = () => {
    const clip = navigator.clipboard
    if (!clip) {
      setState('fail')
      reset()
      return
    }
    clip.writeText(text).then(
      () => {
        setState('ok')
        reset()
      },
      () => {
        setState('fail')
        reset()
      },
    )
  }
  return (
    <button type="button" class={klass} onClick={copy}>
      {state === 'ok' ? done : state === 'fail' ? 'คัดลอกไม่ได้ — กดค้างที่ลิงก์แทน' : label}
    </button>
  )
}
