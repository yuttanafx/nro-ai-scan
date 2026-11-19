export type Field = { key: string; desc: string };
export type Cfg = { webhook: string; auth: string; lang: string; ghUrl: string; ref: string; fields: Field[] };

export const DEFAULT: Cfg = {
  webhook: "", auth: "", lang: "th-TH", ghUrl: "", ref: "",
  fields: [
    { key: "summary", desc: "สรุปใจความสำคัญไม่เกิน 3 ประโยค" },
    { key: "topics", desc: "หัวข้อหลักที่พูดถึง เป็นรายการ" },
    { key: "action_items", desc: "งานหรือสิ่งที่ต้องทำต่อ เป็นรายการ" },
    { key: "sentiment", desc: "อารมณ์โดยรวมของผู้พูด" },
  ],
};

const KEY = "orb_config";
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
let mem: Cfg | null = null;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function sanitize(c: Partial<Cfg>): Cfg {
  const webhook = str(c.webhook, 500).trim();
  const fields = (Array.isArray(c.fields) ? c.fields : [])
    .map((f) => ({ key: str(f?.key, 60).trim().replace(/\s+/g, "_"), desc: str(f?.desc, 300).trim() }))
    .filter((f) => f.key)
    .slice(0, 30);
  return {
    webhook: /^https?:\/\//.test(webhook) ? webhook : "",
    auth: str(c.auth, 500).trim(),
    lang: ["th-TH", "en-US", "ja-JP", "zh-CN"].includes(c.lang || "") ? (c.lang as string) : "th-TH",
    ghUrl: str(c.ghUrl, 500).trim(),
    ref: str(c.ref, 12000),
    fields: fields.length ? fields : DEFAULT.fields,
  };
}

export async function loadCfg(): Promise<Cfg> {
  try {
    if (url && token) {
      const r = await fetch(`${url}/get/${KEY}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const j = await r.json();
      if (j.result) return sanitize(JSON.parse(j.result));
    } else if (mem) return mem;
  } catch {}
  return DEFAULT;
}

export async function saveCfg(c: Partial<Cfg>): Promise<Cfg> {
  const clean = sanitize(c);
  if (url && token) {
    const r = await fetch(`${url}/set/${KEY}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(clean),
    });
    if (!r.ok) throw new Error("store_failed");
  } else mem = clean;
  return clean;
}
