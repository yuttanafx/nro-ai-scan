import { NextResponse } from "next/server";
import { COOKIE, makeToken, safeEq, userList, type Role } from "@/lib/auth";
import { ipOf, limited } from "@/lib/rate";

// as: "admin" = หน้าตั้งค่า (รับเฉพาะแอดมิน) | ไม่ระบุ = ป๊อปอัพตอนเปิดไมค์ (ผู้ใช้ทั่วไปหรือแอดมินก็ได้)
export async function POST(req: Request) {
  const adminPw = process.env.ADMIN_PASSWORD;
  const users = userList();
  if (!process.env.SESSION_SECRET || (!adminPw && !users.length)) {
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }
  if (limited("login:" + ipOf(req), 8, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { u, p, as } = await req.json().catch(() => ({}));
  const U = String(u || ""), P = String(p || "");

  // ตรวจทุกบัญชีเสมอ (ไม่หยุดเมื่อเจอ) เพื่อไม่ให้เวลาตอบบอกใบ้ว่าชื่อไหนมีอยู่
  let role: Role | null = null, name = "";
  const okAdmin = !!adminPw && safeEq(U, process.env.ADMIN_USER || "admin") && safeEq(P, adminPw);
  if (okAdmin) { role = "admin"; name = U; }
  let okUser = false;
  for (const x of users) {
    if (safeEq(U, x.u) && safeEq(P, x.p)) { okUser = true; name = U; }
  }
  if (!role && okUser) role = "user";

  if (!role) return NextResponse.json({ error: "invalid" }, { status: 401 });
  if (as === "admin" && role !== "admin") return NextResponse.json({ error: "not_admin" }, { status: 403 });

  const res = NextResponse.json({ ok: true, role, name });
  res.cookies.set(COOKIE, makeToken(role, name), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 3600,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
