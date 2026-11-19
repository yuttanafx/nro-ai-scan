// จำกัดอัตราแบบง่ายในหน่วยความจำ (ต่อ instance) — ถ้าเปิดสาธารณะจริง แนะนำ Upstash Ratelimit
const hits = new Map<string, number[]>();
export function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}
export function ipOf(req: Request) {
  return (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
}
