import Anthropic from "@anthropic-ai/sdk";
import { loadCfg } from "@/lib/config";
import { getSecrets } from "@/lib/secrets";

const DEFAULT_MODEL = {
  anthropic: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  openai: process.env.OPENAI_MODEL || "gpt-6-luna",
  gemini: process.env.GEMINI_MODEL || "gemini-3.5-flash",
} as const;

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(55000),
  });
  if (!r.ok) throw new Error(`provider_${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// เรียก AI ตามเจ้าที่เลือกในหน้าตั้งค่า (Claude / GPT / Gemini) คืนเป็นข้อความ
export async function askText(prompt: string, opt: { json?: boolean; maxTokens?: number } = {}) {
  const cfg = await loadCfg();
  const sec = await getSecrets();
  const p = cfg.provider;
  const model = cfg.model || DEFAULT_MODEL[p];
  const max = opt.maxTokens || 2000;
  if (p === "openai") {
    const key = sec.openai;
    if (!key) throw new Error("no_key:openai");
    const j: any = await post("https://api.openai.com/v1/responses", { Authorization: `Bearer ${key}` },
      { model, input: prompt, max_output_tokens: Math.max(max, 1000) * 2 });
    return (j.output || []).flatMap((o: any) => o.content || []).map((c: any) => c.text || "").join("");
  }
  if (p === "gemini") {
    const key = sec.gemini;
    if (!key) throw new Error("no_key:gemini");
    const j: any = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { "x-goog-api-key": key },
      { contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: Math.max(max, 1000) * 2, ...(opt.json ? { responseMimeType: "application/json" } : {}) } });
    return (j.candidates?.[0]?.content?.parts || []).map((x: any) => x.text || "").join("");
  }
  if (!sec.anthropic) throw new Error("no_key:anthropic");
  const client = new Anthropic({ apiKey: sec.anthropic });
  const msg = await client.messages.create({ model, max_tokens: max, messages: [{ role: "user", content: prompt }] });
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

// เหมือน askText แต่แกะ JSON ออกมาให้
export async function ask(prompt: string, maxTokens?: number) {
  const text = await askText(prompt, { json: true, maxTokens });
  const m = text.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : text);
}
