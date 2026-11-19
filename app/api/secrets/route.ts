import { isAuthed } from "@/lib/auth";
import { saveSecrets, secretStatus } from "@/lib/secrets";

export const dynamic = "force-dynamic";

// แอดมินเท่านั้น และไม่ส่งค่าคีย์กลับไปเด็ดขาด
export async function GET() {
  if (!(await isAuthed())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await secretStatus());
}

export async function PUT(req: Request) {
  if (!(await isAuthed())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    await saveSecrets(b?.set && typeof b.set === "object" ? b.set : {}, Array.isArray(b?.clear) ? b.clear : []);
  } catch (e: any) {
    const m = String(e?.message || "");
    if (m.startsWith("bad_value:")) return Response.json({ error: "bad_value", field: m.slice(10) }, { status: 400 });
    if (m === "no_store") return Response.json({ error: "no_store" }, { status: 400 });
    if (m === "no_session_secret") return Response.json({ error: "no_session_secret" }, { status: 500 });
    return Response.json({ error: "store_failed" }, { status: 500 });
  }
  return Response.json(await secretStatus());
}
