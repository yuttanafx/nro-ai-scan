import { isAuthed, isUser } from "@/lib/auth";
import { loadCfg } from "@/lib/config";
import { ask } from "@/lib/ai";
import { ipOf, limited } from "@/lib/rate";

export const maxDuration = 60;
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    // โหมดร่างฟิลด์จากฐานข้อมูลอ้างอิง (ผู้ดูแลเท่านั้น)
    if (body.mode === "fields") {
      if (!(await isAuthed())) return Response.json({ error: "unauthorized" }, { status: 401 });
      const ref = String(body.ref || "").slice(0, 12000);
      const out = await ask(
        `จากโครงสร้างฐานข้อมูลด้านล่าง ร่างฟิลด์ที่ควรให้ AI ดึงออกจากคำพูดของมนุษย์ เพื่อบันทึกลงฐานข้อมูลนี้ได้ ` +
        `ตอบเป็น JSON array ของ {"key":"ชื่อฟิลด์ภาษาอังกฤษแบบ snake_case ตรงกับชื่อคอลัมน์ถ้ามี","desc":"คำอธิบายภาษาไทยว่าให้ดึงอะไร"} ` +
        `ไม่เกิน 12 รายการ ไม่รวมคอลัมน์ที่ระบบสร้างเอง เช่น id, created_at\n\n${ref}`
      );
      const arr = (Array.isArray(out) ? out : out.fields || [])
        .filter((f: any) => f && f.key).slice(0, 12)
        .map((f: any) => ({ key: String(f.key).trim().replace(/\s+/g, "_"), desc: String(f.desc || "") }));
      return Response.json({ fields: arr });
    }

    // ต้องล็อกอิน (ผู้ใช้ทั่วไปหรือแอดมิน) ถึงสั่ง AI สรุปได้ กันคนเรียก API ข้ามป๊อปอัพ
    if (!(await isUser())) return Response.json({ error: "login_required" }, { status: 401 });
    if (limited("analyze:" + ipOf(req), 10, 60 * 1000)) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }
    const text = String(body.text || "").slice(0, 20000);
    if (!text.trim()) return Response.json({ error: "empty" }, { status: 400 });

    const cfg = await loadCfg();
    const spec = cfg.fields.map((f) => `- ${f.key}: ${f.desc || "ดึงข้อมูลที่เกี่ยวข้อง"}`).join("\n");
    const ref = cfg.ref.trim()
      ? `\n\nฐานข้อมูลอ้างอิง (ใช้เป็นกรอบ ให้ค่าที่ดึงสอดคล้องกับตารางและคอลัมน์เหล่านี้):\n${cfg.ref.slice(0, 12000)}`
      : "";
    const fields = await ask(
      `สรุปคำพูดด้านล่างตามฟิลด์ที่กำหนด ตอบเป็น JSON object เท่านั้น มี key ตามชื่อฟิลด์ทุกตัว ` +
      `ค่าเป็นข้อความหรืออาร์เรย์ของข้อความ ใช้ภาษาเดียวกับคำพูด ถ้าไม่มีข้อมูลให้ใส่ "-"\n\nฟิลด์:\n${spec}\n\nคำพูด:\n${text}${ref}`
    );

    let webhook: "skipped" | "sent" | "failed" = "skipped";
    if (cfg.webhook) {
      try {
        const r = await fetch(cfg.webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(cfg.auth ? { Authorization: cfg.auth } : {}) },
          body: JSON.stringify({
            event: "transcript.summary", at: new Date().toISOString(),
            fields, transcript: text, source: cfg.ghUrl || null,
          }),
          signal: AbortSignal.timeout(10000),
        });
        webhook = r.ok ? "sent" : "failed";
      } catch { webhook = "failed"; }
    }
    return Response.json({ fields, webhook });
  } catch (e: any) {
    if (String(e?.message).startsWith("no_key:"))
      return Response.json({ error: "no_key", provider: String(e.message).slice(7) }, { status: 503 });
    console.error("analyze error", e);
    return Response.json({ error: "analyze_failed" }, { status: 500 });
  }
}
