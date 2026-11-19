import crypto from "crypto";
import { cookies } from "next/headers";

export const COOKIE = "orb_session";
export type Role = "admin" | "user";
export type Session = { role: Role; name: string };

const secret = () => process.env.SESSION_SECRET || "";
const sign = (v: string) => crypto.createHmac("sha256", secret()).update(v).digest("hex");
const sha = (v: string) => crypto.createHash("sha256").update(v).digest();

export function safeEq(a: string, b: string) {
  return crypto.timingSafeEqual(sha(a), sha(b));
}

// โทเคน = base64url({r: บทบาท, n: ชื่อ, e: หมดอายุ}) + "." + ลายเซ็น HMAC
export function makeToken(role: Role, name: string) {
  const payload = Buffer.from(JSON.stringify({ r: role, n: name.slice(0, 60), e: Date.now() + 7 * 24 * 3600 * 1000 })).toString("base64url");
  return payload + "." + sign(payload);
}

export function readToken(token?: string): Session | null {
  if (!token || !secret()) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEq(sig, sign(payload))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!(Number(p.e) > Date.now())) return null;
    if (p.r !== "admin" && p.r !== "user") return null;
    return { role: p.r, name: String(p.n || "") };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  return readToken(c.get(COOKIE)?.value);
}
// แอดมินเท่านั้น: ใช้กับหน้าตั้งค่าและ API ที่แก้การตั้งค่า
export async function isAuthed() {
  return (await getSession())?.role === "admin";
}
// ผู้ใช้ทั่วไปหรือแอดมิน: ใช้กับการเปิดไมค์และสั่งสรุป
export async function isUser() {
  return !!(await getSession());
}

// รายชื่อผู้ใช้ทั่วไปจาก env: USERS="somchai:รหัส1,somsri:รหัส2" (คั่นชื่อกับรหัสด้วย : รหัสผ่านมี : ได้)
export function userList(): { u: string; p: string }[] {
  return (process.env.USERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(":");
      return i > 0 ? { u: s.slice(0, i).trim(), p: s.slice(i + 1) } : null;
    })
    .filter((x): x is { u: string; p: string } => !!x && !!x.p);
}
