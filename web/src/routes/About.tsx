import { useLoad } from '../data/context'
import { ErrorBox, Kicker, Loading } from '../ui/bits'

export function About() {
  const st = useLoad((c) => c.meta(), [])
  return (
    <>
      <Kicker>เกี่ยวกับ</Kicker>
      <h1 style="margin:6px 0 18px">เชื่อได้แค่ไหน และมาจากไหน</h1>
      <div class="two">
        <section>
          <h2 style="font-size:1.05rem">ข้อมูล</h2>
          <p>
            ทุกเอกสาร ป้าย และไฟล์มาจากชุดข้อมูลเปิด{' '}
            <a href="https://huggingface.co/datasets/open-law-data-thailand/soc-ratchakitcha">
              OpenLawData — soc-ratchakitcha
            </a>{' '}
            (ชั้น <code>meta/</code> และ <code>taxonomy/openlawdata-taxonomy/</code>) เว็บนี้เป็นเพียง
            "ผู้อ่าน" ชุดข้อมูลนั้น ไม่ได้แก้หรือเพิ่มข้อมูลเอง และสร้างใหม่ทุกคืนหลังชุดข้อมูลอัปเดต
          </p>
          {st.state === 'ok' && (
            <ul>
              {st.data.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url}>{s.name}</a>
                  {s.layers && <span class="muted"> · {s.layers.join(', ')}</span>}
                  {s.built_from_years && (
                    <span class="muted">
                      {' '}
                      · {s.built_from_years[0]}–{s.built_from_years[s.built_from_years.length - 1]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {st.state === 'loading' && <Loading />}
          {st.state === 'error' && <ErrorBox error={st.error} />}
          <h2 style="font-size:1.05rem;margin-top:22px">การจำแนกหมวดหมู่</h2>
          <p>
            การจำแนกสามแกน (เรื่องอะไร · ทำอะไร · ใครออก) มาจาก rule ที่อ่านผู้ออก ชื่อเรื่อง ประเภทเอกสาร
            และตอนของราชกิจจาฯ — ไม่ใช่ machine learning ป้ายที่ <b>ยืนยัน ✓</b>{' '}
            คือป้ายที่มีหลักฐานเชิงโครงสร้างหรือสองแหล่งอิสระ หมวดที่ขึ้นว่า{' '}
            <span class="pill guess">คาดว่า</span> มาจากข้อความต้นเพียงอย่างเดียว
          </p>
          <table>
            <thead>
              <tr>
                <th>ชุดตรวจ (อ่านด้วยคน)</th>
                <th>ความแม่นของหมวดที่ยืนยัน</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>สุ่มทั่วคลัง 150 ฉบับ</td>
                <td>100% (ช่วงเชื่อมั่น 98.6–100)</td>
              </tr>
              <tr>
                <td>หมวดที่ประชาชนค้นบ่อย 15 หมวด</td>
                <td>97.9%</td>
              </tr>
              <tr>
                <td>หมวด "คาดว่า"</td>
                <td>≈ 61% — เก็บไว้เพื่อไม่ให้พลาด ต้องกรองเอง</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h2 style="font-size:1.05rem">ตัวเลขบนหน้าแรกนับอย่างไร</h2>
          <p>
            นับเฉพาะหมวดที่ยืนยัน หัวข้อลูกนับรวมเข้าหัวข้อแม่ (ขยะ ⊂ มลพิษ ⊂ สิ่งแวดล้อม) "กฎใหม่" = การกระทำ
            ออกกฎ/แก้ไข/ยกเลิก ที่ยืนยันจากประเภทเอกสาร
          </p>
          <h2 style="font-size:1.05rem;margin-top:22px">ข้อมูลส่วนบุคคล</h2>
          <p>
            ประกาศบางประเภท (เช่น ล้มละลาย) มีชื่อบุคคลตามที่ราชกิจจานุเบกษาเผยแพร่
            เว็บนี้แสดงทีละฉบับตามต้นฉบับ ไม่สร้างหน้ารวมข้ามฉบับสำหรับบุคคลธรรมดา และไม่รับข้อมูลใดจากผู้ใช้
          </p>
          <h2 style="font-size:1.05rem;margin-top:22px">ติดตาม</h2>
          <p>
            ทุกหน้าหมวด จังหวัด และหน่วยงานหลักมี Atom feed (ปุ่ม RSS) ใส่ใน RSS reader, Slack หรือ IFTTT ได้
            ไม่ต้องสมัคร
          </p>
          <h2 style="font-size:1.05rem;margin-top:22px">โค้ด</h2>
          <p>เว็บและ pipeline เป็นโอเพนซอร์ส (MIT) — Thai Legal Watch เป็นโครงการในเครือ OpenLawData</p>
        </section>
      </div>
    </>
  )
}
