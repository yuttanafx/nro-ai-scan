// อ่านข้อมูลจาก Supabase แบบอ่านอย่างเดียว (GET เท่านั้น) เฉพาะตารางและคอลัมน์ที่แอดมินอนุญาตในหน้าตั้งค่า
// ตัวแปรที่ปลั๊กอิน Supabase บน Vercel ใส่ให้ ชื่ออาจต่างกันตามเวอร์ชัน จึงรองรับหลายชื่อ
// ค่าเชื่อมต่อมาจาก lib/secrets (แอดมินกรอกในหน้าตั้งค่า หรือจาก Environment Variables ที่ปลั๊กอิน Supabase บน Vercel ใส่ให้)
export type Db = { url: string; key: string };
export const toDb = (s: { supabaseUrl: string; supabaseKey: string }): Db | null =>
  s.supabaseUrl && s.supabaseKey ? { url: s.supabaseUrl.replace(/\/+$/, ""), key: s.supabaseKey } : null;

const headers = (db: Db) => {
  // คีย์แบบเก่าเป็น JWT (eyJ...) ต้องส่งเป็น Bearer ด้วย คีย์แบบใหม่ (sb_...) ส่งแค่ apikey
  return { apikey: db.key, ...(db.key.startsWith("eyJ") ? { Authorization: `Bearer ${db.key}` } : {}) };
};

const ID = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike"];
// ตารางที่อนุญาต: ชื่อตาราง หรือ ตาราง(คอลัมน์1,คอลัมน์2) เพื่อจำกัดคอลัมน์ เช่น cases(id,title,status), contacts
export type Allowed = Record<string, string[] | null>; // null = ทุกคอลัมน์

export function parseTables(s: string): Allowed {
  const out: Allowed = {};
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s || ""))) {
    const cols = (m[2] || "").split(",").map((x) => x.trim()).filter((x) => ID.test(x));
    out[m[1]] = cols.length ? cols : null;
  }
  return out;
}

let schemaCache: { at: number; url: string; defs: Record<string, Record<string, string>> } | null = null;
async function liveSchema(db: Db) {
  if (schemaCache && schemaCache.url === db.url && Date.now() - schemaCache.at < 5 * 60 * 1000) return schemaCache.defs;
  try {
    const r = await fetch(`${db.url}/rest/v1/`, { headers: { ...headers(db), Accept: "application/openapi+json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return null;
    const j: any = await r.json();
    const defs: Record<string, Record<string, string>> = {};
    for (const [t, d] of Object.entries<any>(j.definitions || {})) {
      defs[t] = Object.fromEntries(Object.entries<any>(d.properties || {}).map(([c, p]) => [c, String(p.format || p.type || "")]));
    }
    schemaCache = { at: Date.now(), url: db.url, defs };
    return defs;
  } catch { return null; }
}

// ข้อความโครงสร้างตารางที่อนุญาต ส่งให้ AI ใช้วางแผนการค้น (ไม่เปิดเผยคอลัมน์ที่ถูกซ่อน)
export async function schemaText(db: Db, allowed: Allowed, note: string) {
  const defs = await liveSchema(db);
  const lines = Object.entries(allowed).map(([t, cols]) => {
    const all = defs?.[t];
    const use = cols || (all ? Object.keys(all) : null);
    return use ? `${t}(${use.map((c) => (all?.[c] ? `${c} ${all[c]}` : c)).join(", ")})` : `${t}(ไม่ทราบคอลัมน์)`;
  });
  return lines.join("\n") + (note.trim() ? `\n\nหมายเหตุจากผู้ดูแล:\n${note.slice(0, 6000)}` : "");
}

type Q = { table?: unknown; select?: unknown; filters?: unknown; order?: unknown; limit?: unknown };

// รัน “แผนการค้น” ที่ AI ร่างมา หลังตรวจทุกอย่างกับรายการที่อนุญาต
export async function runQueries(db: Db, plan: unknown, allowed: Allowed) {
  const qs: Q[] = Array.isArray((plan as any)?.queries) ? (plan as any).queries.slice(0, 2) : [];
  const results: { table: string; rows?: unknown[]; error?: string }[] = [];
  for (const q of qs) {
    const table = String(q.table || "");
    if (!ID.test(table) || !(table in allowed)) { results.push({ table, error: "table_not_allowed" }); continue; }
    const only = allowed[table];
    const okCol = (c: string) => ID.test(c) && (!only || only.includes(c));
    let cols = (Array.isArray(q.select) ? q.select : []).map(String).filter(okCol).slice(0, 20);
    if (!cols.length) cols = only ? only.slice(0, 20) : [];
    const params: string[] = [`select=${cols.length ? cols.join(",") : "*"}`];
    for (const f of (Array.isArray(q.filters) ? q.filters : []).slice(0, 6) as any[]) {
      const col = String(f?.col || ""), op = String(f?.op || "eq");
      if (!okCol(col) || !OPS.includes(op)) continue;
      let v = String(f?.val ?? "").slice(0, 200);
      if (op === "like" || op === "ilike") v = v.replace(/%/g, "*");
      params.push(`${col}=${op}.${encodeURIComponent(v)}`);
    }
    const ord: any = q.order;
    if (ord && okCol(String(ord.col || ""))) params.push(`order=${ord.col}.${ord.desc ? "desc" : "asc"}`);
    params.push(`limit=${Math.min(20, Math.max(1, Number(q.limit) || 10))}`);
    try {
      const r = await fetch(`${db.url}/rest/v1/${table}?${params.join("&")}`, { headers: headers(db), signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!r.ok) { results.push({ table, error: `db_${r.status}` }); continue; }
      results.push({ table, rows: await r.json() });
    } catch { results.push({ table, error: "db_unreachable" }); }
  }
  return results;
}
