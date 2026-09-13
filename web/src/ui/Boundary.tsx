/** A thrown render is the one failure that leaves nothing at all on screen — no message, no way
 *  back, not even the header. The data contract says fields may be added upstream, so a shape the
 *  site did not expect is a real possibility, not a theoretical one. */
import type { ComponentChildren } from 'preact'
import { useErrorBoundary } from 'preact/hooks'
import { href } from '../router'

export function Boundary({ children }: { children: ComponentChildren }) {
  // preact's types give this a loose tuple; name the halves so the rest of the file stays typed
  const boundary = useErrorBoundary() as [unknown, () => void]
  const error = boundary[0]
  const reset = boundary[1]
  if (!error) return <>{children}</>
  const msg = error instanceof Error ? error.message : 'ข้อผิดพลาดที่ไม่รู้จัก'
  return (
    <div class="error" role="alert">
      <p style="margin:0 0 8px">
        <b>หน้านี้แสดงผลไม่สำเร็จ</b> — {msg}
      </p>
      <p class="muted" style="margin:0 0 10px;font-size:.9rem">
        ข้อมูลอาจมีรูปแบบที่เว็บยังไม่รู้จัก ลองโหลดใหม่ หรือกลับไปหน้าอื่นก่อน ระหว่างนี้ยังอ่านต้นฉบับได้ที่{' '}
        <a href="https://ratchakitcha.soc.go.th/">ราชกิจจานุเบกษา</a>
      </p>
      <p style="margin:0;display:flex;gap:8px;flex-wrap:wrap">
        <button onClick={reset}>ลองแสดงผลใหม่</button>
        <a class="btn" href={href.home()}>
          กลับหน้าแรก
        </a>
      </p>
    </div>
  )
}
