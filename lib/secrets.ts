import crypto from "crypto";
import { kvGet, kvSet, persistent } from "@/lib/store";

// คีย์/ค่าเชื่อมต่อที่แอดมินกรอกในหน้าตั้งค่า เก็บแบบเข้ารหัส AES-256-GCM (กุญแจมาจาก SESSION_SECRET)
// ลำดับการใช้: ค่าที่แอดมินบันทึกไว้ → ถ้าไม่มี ใช้ Environment Variables
// ถ้าเปลี่ยน SESSION_SECRET ค่าที่บันทึกไว้จะถอดรหัสไม่ได้ ต้องกรอกใหม่
export const FIELDS = ["anthropic", "openai", "gemini", "github", "azureKey", "azureRegion", "supabaseUrl", "supabaseKey"] as const;
export type SecretKey = (typeof FIELDS)[number];
export type Resolved = Record<SecretKey, string>;
// ไม่ใช่ความลับ ส่งกลับไปแสดงในหน้าตั้งค่าได้
export const PLAIN: SecretKey[] = ["azureRegion", "supabaseUrl"];

const e = (...n: string[]) => n.map((x) => process.env[x]).find(Boolean) || "";
const ENV: Record<SecretKey, () => string> = {
  anthropic: () => e("ANTHROPIC_API_KEY"),
  openai: () => e("OPENAI_API_KEY"),
  gemini: () => e("GEMINI_API_KEY", "GOOGLE_API_KEY"),
  github: () => e("GITHUB_TOKEN"),
  azureKey: () => e("AZURE_SPEECH_KEY"),
  azureRegion: () => e("AZURE_SPEECH_REGION"),
  supabaseUrl: () => e("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  supabaseKey: () => e("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"),
};

const STORE_KEY = "orb_secrets";
const aesKey = () => crypto.createHash("sha256").update("orb-secrets:" + (process.env.SESSION_SECRET || "")).digest();

function encrypt(obj: unknown) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", aesKey(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function decrypt(b64: string): Partial<Record<SecretKey, string>> {
  const raw = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", aesKey(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8"));
}

type Saved = Partial<Record<SecretKey, string>>;
const gc = globalThis as unknown as { __orbSecCache?: { at: number; saved: Saved } | null };
async function loadSaved() {
  const cache = gc.__orbSecCache;
  if (cache && Date.now() - cache.at < 15000) return cache.saved;
  let saved: Partial<Record<SecretKey, string>> = {};
  try {
    const raw = process.env.SESSION_SECRET ? await kvGet(STORE_KEY) : null;
    if (raw) saved = decrypt(raw);
  } catch { saved = {}; }
  gc.__orbSecCache = { at: Date.now(), saved };
  return saved;
}

export async function getSecrets(): Promise<Resolved> {
  const saved = await loadSaved();
  const out = {} as Resolved;
  for (const k of FIELDS) out[k] = (saved[k] || ENV[k]() || "").trim();
  return out;
}

// สถานะสำหรับหน้าตั้งค่าแอดมิน: ไม่ส่งค่าลับกลับไป ส่งแค่ว่าตั้งไว้หรือยัง กับ 4 ตัวท้าย
export async function secretStatus() {
  const saved = await loadSaved();
  const fields: Record<string, { set: boolean; source: "saved" | "env" | "none"; hint?: string; value?: string }> = {};
  for (const k of FIELDS) {
    const sv = saved[k], ev = ENV[k](), v = sv || ev;
    const f: { set: boolean; source: "saved" | "env" | "none"; hint?: string; value?: string } = { set: !!v, source: sv ? "saved" : ev ? "env" : "none" };
    if (PLAIN.includes(k)) f.value = v || "";
    else if (v && v.length >= 16) f.hint = v.slice(-4);
    fields[k] = f;
  }
  const r = await getSecrets();
  return {
    fields, persistent: persistent(), canSave: !!process.env.SESSION_SECRET && !needsStore(), needsStore: needsStore(),
    keys: { anthropic: !!r.anthropic, openai: !!r.openai, gemini: !!r.gemini, github: !!r.github, azure: !!(r.azureKey && r.azureRegion), supabase: !!(r.supabaseUrl && r.supabaseKey) },
  };
}

// บน Vercel แต่ละ API เป็นคนละฟังก์ชัน หน่วยความจำไม่ใช้ร่วมกัน ถ้าไม่มีที่เก็บถาวร คีย์ที่บันทึกจะใช้ไม่ได้จริง จึงไม่ให้บันทึก
const needsStore = () => !!process.env.VERCEL && !persistent();

export async function saveSecrets(patch: Partial<Record<string, unknown>>, clear: unknown[]) {
  if (!process.env.SESSION_SECRET) throw new Error("no_session_secret");
  if (needsStore()) throw new Error("no_store");
  const saved = { ...(await loadSaved()) };
  for (const k of FIELDS) {
    if (clear.includes(k)) { delete saved[k]; continue; }
    const v = typeof patch[k] === "string" ? (patch[k] as string).trim() : "";
    if (!v) continue;
    if (v.length > 600 || /\s/.test(v)) throw new Error("bad_value:" + k);
    if (k === "azureRegion" && !/^[a-z0-9-]{2,40}$/.test(v)) throw new Error("bad_value:" + k);
    if (k === "supabaseUrl" && !/^https?:\/\/[^\s/]+/.test(v)) throw new Error("bad_value:" + k);
    saved[k] = k === "supabaseUrl" ? v.replace(/\/+$/, "") : v;
  }
  await kvSet(STORE_KEY, encrypt(saved));
  gc.__orbSecCache = null;
}
