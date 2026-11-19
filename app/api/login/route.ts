import { NextResponse } from "next/server";
import { COOKIE, makeToken, safeEq } from "@/lib/auth";
import { ipOf, limited } from "@/lib/rate";

export async function POST(req: Request) {
  if (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }
  if (limited("login:" + ipOf(req), 8, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { u, p } = await req.json().catch(() => ({}));
  const okU = safeEq(String(u || ""), process.env.ADMIN_USER || "admin");
  const okP = safeEq(String(p || ""), process.env.ADMIN_PASSWORD);
  if (!(okU && okP)) return NextResponse.json({ error: "invalid" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeToken(), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 3600,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
