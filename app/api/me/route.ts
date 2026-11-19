import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
// ok = เป็นแอดมิน (เข้าตั้งค่าได้) | user = ล็อกอินแล้ว (ใช้ไมค์ได้) | name = ชื่อที่ล็อกอิน
export async function GET() {
  const s = await getSession();
  return Response.json({ ok: s?.role === "admin", user: !!s, role: s?.role || null, name: s?.name || "" });
}
