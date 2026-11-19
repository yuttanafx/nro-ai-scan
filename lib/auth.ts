import crypto from "crypto";
import { cookies } from "next/headers";

export const COOKIE = "orb_session";
const secret = () => process.env.SESSION_SECRET || "";
const sign = (v: string) => crypto.createHmac("sha256", secret()).update(v).digest("hex");
const sha = (v: string) => crypto.createHash("sha256").update(v).digest();

export function safeEq(a: string, b: string) {
  return crypto.timingSafeEqual(sha(a), sha(b));
}
export function makeToken() {
  const exp = String(Date.now() + 7 * 24 * 3600 * 1000);
  return exp + "." + sign(exp);
}
export function verify(token?: string) {
  if (!token || !secret()) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  return safeEq(sig, sign(exp)) && Number(exp) > Date.now();
}
export async function isAuthed() {
  const c = await cookies();
  return verify(c.get(COOKIE)?.value);
}
