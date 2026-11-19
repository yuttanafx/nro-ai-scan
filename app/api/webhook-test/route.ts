import { isAuthed } from "@/lib/auth";
import { loadCfg } from "@/lib/config";

export async function POST() {
  if (!(await isAuthed())) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const cfg = await loadCfg();
  if (!cfg.webhook) return Response.json({ ok: false, error: "ยังไม่ได้ตั้ง Webhook URL" });
  try {
    const r = await fetch(cfg.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.auth ? { Authorization: cfg.auth } : {}) },
      body: JSON.stringify({ event: "webhook.test", at: new Date().toISOString(), schema: cfg.fields }),
      signal: AbortSignal.timeout(10000),
    });
    return Response.json({ ok: r.ok, status: r.status });
  } catch {
    return Response.json({ ok: false, error: "เชื่อมต่อปลายทางไม่ได้" });
  }
}
