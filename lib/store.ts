// ที่เก็บค่าแบบ key-value: Upstash Redis ถ้าตั้งไว้ ไม่งั้นเก็บในหน่วยความจำ (หายเมื่อเซิร์ฟเวอร์รีสตาร์ต)
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
// ใช้ globalThis เพื่อให้ทุก route ในโปรเซสเดียวกันเห็นค่าเดียวกัน (ข้ามฟังก์ชันบน Vercel ไม่ได้ ต้องต่อ Upstash)
const g = globalThis as unknown as { __orbMem?: Map<string, string> };
const mem = (g.__orbMem ||= new Map<string, string>());

export const persistent = () => !!(url && token);

export async function kvGet(key: string): Promise<string | null> {
  try {
    if (url && token) {
      const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const j = await r.json();
      return typeof j.result === "string" ? j.result : null;
    }
    return mem.get(key) ?? null;
  } catch { return null; }
}

export async function kvSet(key: string, value: string): Promise<void> {
  if (url && token) {
    const r = await fetch(`${url}/set/${key}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: value });
    if (!r.ok) throw new Error("store_failed");
  } else mem.set(key, value);
}
