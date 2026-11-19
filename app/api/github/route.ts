import dns from "dns/promises";
import net from "net";
import { isAuthed } from "@/lib/auth";
import { getSecrets } from "@/lib/secrets";

export const maxDuration = 60;

const OK_EXT = /\.(sql|prisma|json|ya?ml|md|csv|graphql)$/i;
const MAX_TOTAL = 12000;
const MAX_LINKS = 5;

function parseGh(u: string) {
  let m: RegExpMatchArray | null;
  if ((m = u.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)\/blob\/([^/]+)\/(.+?)(?:[?#].*)?$/)))
    return { o: m[1], r: m[2], b: m[3], p: m[4] };
  if ((m = u.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+?))?)?\/?(?:[?#].*)?$/)))
    return { o: m[1], r: m[2], b: m[3] || "", p: m[4] || "" };
  return null;
}

// กันการยิงเข้าเครือข่ายภายใน (SSRF)
function privateIp(ip: string) {
  if (net.isIPv6(ip)) return ip === "::1" || /^(fc|fd|fe80)/i.test(ip) || ip.startsWith("::ffff:127.");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
async function safeUrl(u: string) {
  const x = new URL(u);
  if (!/^https?:$/.test(x.protocol)) throw new Error("bad_url");
  if (net.isIP(x.hostname) ? privateIp(x.hostname) : (await dns.lookup(x.hostname, { all: true })).some((r) => privateIp(r.address)))
    throw new Error("blocked");
  return x;
}

function htmlToText(h: string) {
  return h
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|br)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t\u00a0]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

async function getPage(u: string, hops = 0): Promise<string> {
  const x = await safeUrl(u);
  const r = await fetch(x, {
    redirect: "manual", signal: AbortSignal.timeout(15000), cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; orb-reader)", Accept: "text/html,text/plain,application/json,*/*" },
  });
  if (r.status >= 300 && r.status < 400 && r.headers.get("location") && hops < 3)
    return getPage(new URL(r.headers.get("location")!, x).toString(), hops + 1);
  if (!r.ok) throw new Error("http_" + r.status);
  const ct = r.headers.get("content-type") || "";
  if (/pdf|image|zip|octet/i.test(ct)) throw new Error("unsupported");
  const buf = await r.arrayBuffer();
  if (buf.byteLength > 3_000_000) throw new Error("too_big");
  let cs = (ct.match(/charset=([\w-]+)/i) || [])[1];
  if (!cs) cs = (new TextDecoder("latin1").decode(buf.slice(0, 2000)).match(/charset=["']?([\w-]+)/i) || [])[1];
  let txt: string;
  try { txt = new TextDecoder(cs || "utf-8").decode(buf); } catch { txt = new TextDecoder("utf-8").decode(buf); }
  return /html/i.test(ct) || /^\s*<(!doctype|html)/i.test(txt) ? htmlToText(txt) : txt;
}

async function getGithub(g: { o: string; r: string; b: string; p: string }, budget: number) {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "orb" };
  const ghToken = (await getSecrets()).github;
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
  const r = await fetch(`https://api.github.com/repos/${g.o}/${g.r}/contents/${g.p}${g.b ? `?ref=${encodeURIComponent(g.b)}` : ""}`,
    { headers, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 404 ? "not_found" : "github_" + r.status);
  let list: any = await r.json();
  if (!Array.isArray(list)) list = [list];
  const score = (f: any) => (/schema|model|migrat|database|db|table|entity/i.test(f.name) ? 0 : 2) + (/\.(sql|prisma)$/i.test(f.name) ? 0 : 1);
  const files = list.filter((f: any) => f.type === "file" && f.download_url && f.size < 80000 && OK_EXT.test(f.name))
    .sort((a: any, b: any) => score(a) - score(b)).slice(0, 5);
  if (!files.length) throw new Error("nofiles");
  let out = "";
  for (const f of files) {
    if (out.length >= budget) break;
    const t = await fetch(f.download_url, { headers: ghToken ? { Authorization: headers.Authorization } : {}, signal: AbortSignal.timeout(15000) });
    if (t.ok) out += `### ${f.path}\n${(await t.text()).slice(0, 6000)}\n\n`;
  }
  return out.slice(0, budget);
}

// ผู้ดูแลเท่านั้น: ดึงเนื้อหาจากลิงก์ (GitHub หรือเว็บไซต์ทั่วไป) ฝั่งเซิร์ฟเวอร์ มาเป็นฐานข้อมูลอ้างอิง
export async function POST(req: Request) {
  if (!(await isAuthed())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { url } = await req.json().catch(() => ({ url: "" }));
  const urls = String(url || "").split(/[\s,]+/).filter((u) => /^https?:\/\//.test(u)).slice(0, MAX_LINKS);
  if (!urls.length) return Response.json({ error: "bad_url" }, { status: 400 });

  const per = Math.floor(MAX_TOTAL / urls.length);
  let out = "", lastErr = "";
  for (const u of urls) {
    try {
      const g = parseGh(u);
      const body = g ? await getGithub(g, per) : `### ${u}\n${(await getPage(u)).slice(0, per - u.length - 6)}\n\n`;
      out += body;
    } catch (e: any) { lastErr = e?.message || "fetch_failed"; }
  }
  if (!out.trim()) return Response.json({ error: lastErr || "fetch_failed" }, { status: 502 });
  return Response.json({ text: out.slice(0, MAX_TOTAL) });
}
