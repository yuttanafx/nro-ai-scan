# NRO. AI กำลังฟัง (Next.js)

โลโก้จุดไข่ปลาเรืองแสงที่ตอบสนองต่อเสียง + ถอดเสียง + สรุปด้วย Claude ตามกรอบที่ตั้งไว้ + ส่ง Webhook

## ขึ้น Vercel
1. แตก zip แล้ว push ขึ้น GitHub (`git init && git add . && git commit -m init`)
2. Vercel → Add New → Project → เลือก repo นี้ (Framework: Next.js ตรวจอัตโนมัติ)
3. Settings → Environment Variables ใส่ค่าตาม `.env.example`
   - `ANTHROPIC_API_KEY`, `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET` (จำเป็น)
   - Storage → เพิ่ม **Upstash Redis** (Marketplace) เพื่อให้การตั้งค่าไม่หาย ตัวแปรจะถูกใส่ให้เอง
4. Deploy แล้วเปิดเว็บ → ปุ่ม "ตั้งค่า" → ล็อกอินด้วย ADMIN_USER / ADMIN_PASSWORD

รันในเครื่อง: `npm install`, คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่า, `npm run dev`
(ไมค์ต้องใช้ผ่าน HTTPS หรือ localhost เท่านั้น)

## โครงสร้าง
- `app/body.html`, `app/globals.css`, `public/app.js` หน้าเว็บ ลูกบอลและโลโก้จุด ตัวควบคุมฝั่งผู้ใช้
- `app/api/login|logout|me` ล็อกอินฝั่งเซิร์ฟเวอร์ (คุกกี้ httpOnly ที่เซ็นด้วย HMAC)
- `app/api/config` อ่าน/บันทึกการตั้งค่า (คนทั่วไปเห็นแค่ภาษาและชื่อฟิลด์ Webhook และ Authorization เห็นเฉพาะผู้ดูแล)
- `app/api/analyze` เรียก Claude สรุปตามฟิลด์ แล้วส่ง Webhook จากฝั่งเซิร์ฟเวอร์
- `lib/` ระบบ session, ที่เก็บการตั้งค่า, ตัวจำกัดอัตรา
- `public/logo.jpg` โลโก้ (เปลี่ยนไฟล์นี้เพื่อเปลี่ยนโลโก้ ควรเป็นรูปวงกลมพื้นขาว)

## ก่อนเปิดให้คนทั่วไปใช้
- `/api/analyze` เปิดสาธารณะ (คนทั่วไปต้องใช้ได้โดยไม่ล็อกอิน) และจ่ายค่า API ของคุณ มีตัวจำกัด 10 ครั้ง/นาที/IP แต่เป็นแบบในหน่วยความจำ ถ้าเปิดจริงควรใช้ Upstash Ratelimit
- ล็อกอินมีตัวจำกัดการเดารหัสแบบเดียวกัน ใช้รหัสผ่านยาวและไม่ซ้ำ
- การดึงสคีมาจาก GitHub ทำฝั่งเบราว์เซอร์ ใช้ได้เฉพาะ repo สาธารณะ
- การถอดเสียงใช้ Web Speech API ของเบราว์เซอร์ (ดีที่สุดใน Chrome) ถ้าต้องการแม่นยำกว่านี้ ให้เปลี่ยนไปใช้บริการถอดเสียงฝั่งเซิร์ฟเวอร์
