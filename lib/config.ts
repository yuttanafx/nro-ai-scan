import { kvGet, kvSet } from "@/lib/store";
export type Field = { key: string; desc: string };
export type Tts = "browser" | "openai" | "azure";
export const TTS_MODES: Tts[] = ["browser", "openai", "azure"];
export type Provider = "anthropic" | "openai" | "gemini";
export const PROVIDERS: Provider[] = ["anthropic", "openai", "gemini"];
export type Cfg = { webhook: string; auth: string; lang: string; ghUrl: string; ref: string; provider: Provider; model: string; tables: string; tts: Tts; ttsVoice: string; fields: Field[] };

export const DEFAULT: Cfg = {
  webhook: "", auth: "", lang: "th-TH", ghUrl: "", ref: "", provider: "anthropic", model: "", tables: "", tts: "browser", ttsVoice: "",
  fields: [
    { key: "summary", desc: "สรุปใจความสำคัญไม่เกิน 3 ประโยค" },
    { key: "topics", desc: "หัวข้อหลักที่พูดถึง เป็นรายการ" },
    { key: "action_items", desc: "งานหรือสิ่งที่ต้องทำต่อ เป็นรายการ" },
    { key: "sentiment", desc: "อารมณ์โดยรวมของผู้พูด" },
  ],
};

const KEY = "orb_config";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function sanitize(c: Partial<Cfg>): Cfg {
  const webhook = str(c.webhook, 500).trim();
  const fields = (Array.isArray(c.fields) ? c.fields : [])
    .map((f) => ({ key: str(f?.key, 60).trim().replace(/\s+/g, "_"), desc: str(f?.desc, 300).trim() }))
    .filter((f) => f.key)
    .slice(0, 30);
  return {
    webhook: /^https?:\/\//.test(webhook) ? webhook : "",
    auth: str(c.auth, 500).trim(),
    lang: ["th-TH", "en-US", "ja-JP", "zh-CN"].includes(c.lang || "") ? (c.lang as string) : "th-TH",
    ghUrl: str(c.ghUrl, 2000).trim(),
    ref: str(c.ref, 12000),
    provider: PROVIDERS.includes(c.provider as Provider) ? (c.provider as Provider) : "anthropic",
    model: str(c.model, 100).trim(),
    tables: str(c.tables, 2000).trim(),
    tts: TTS_MODES.includes(c.tts as Tts) ? (c.tts as Tts) : "browser",
    ttsVoice: str(c.ttsVoice, 60).trim().replace(/[^A-Za-z0-9_-]/g, ""),
    fields: fields.length ? fields : DEFAULT.fields,
  };
}

export async function loadCfg(): Promise<Cfg> {
  try {
    const raw = await kvGet(KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch {}
  return DEFAULT;
}

export async function saveCfg(c: Partial<Cfg>): Promise<Cfg> {
  const clean = sanitize(c);
  await kvSet(KEY, JSON.stringify(clean));
  return clean;
}
