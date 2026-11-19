import { isAuthed } from "@/lib/auth";
import { loadCfg, saveCfg } from "@/lib/config";

export const dynamic = "force-dynamic";

// ทุกคนอ่านได้เฉพาะภาษากับชื่อฟิลด์ ส่วน Webhook, Authorization, ฐานข้อมูลอ้างอิง เห็นเฉพาะผู้ดูแล
export async function GET() {
  const cfg = await loadCfg();
  if (await isAuthed()) return Response.json({ config: cfg, admin: true });
  return Response.json({ config: { lang: cfg.lang, fields: cfg.fields }, admin: false });
}

export async function PUT(req: Request) {
  if (!(await isAuthed())) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const saved = await saveCfg(await req.json());
    return Response.json({ config: saved });
  } catch {
    return Response.json({ error: "store_failed" }, { status: 500 });
  }
}
