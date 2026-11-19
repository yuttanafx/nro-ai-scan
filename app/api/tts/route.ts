import { isUser } from "@/lib/auth";
import { loadCfg } from "@/lib/config";
import { getSecrets } from "@/lib/secrets";
import { ipOf, limited } from "@/lib/rate";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const AZURE_DEFAULT: Record<string, string> = {
  "th-TH": "th-TH-PremwadeeNeural", "en-US": "en-US-JennyNeural", "ja-JP": "ja-JP-NanamiNeural", "zh-CN": "zh-CN-XiaoxiaoNeural",
};
const xml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string));

// แปลงข้อความเป็นไฟล์เสียง mp3 ผ่านบริการที่แอดมินเลือก (OpenAI หรือ Azure) คีย์อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
export async function POST(req: Request) {
  if (!(await isUser())) return Response.json({ error: "login_required" }, { status: 401 });
  if (limited("tts:" + ipOf(req), 30, 60 * 1000)) return Response.json({ error: "rate_limited" }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 800);
  if (!text) return Response.json({ error: "empty" }, { status: 400 });

  const cfg = await loadCfg();
  const sec = await getSecrets();
  try {
    let r: Response;
    if (cfg.tts === "openai") {
      if (!sec.openai) return Response.json({ error: "no_key", provider: "openai" }, { status: 503 });
      const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
      r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${sec.openai}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, voice: cfg.ttsVoice || "marin", input: text, response_format: "mp3",
          ...(model.startsWith("gpt-4o") ? { instructions: "Speak clearly in a natural, friendly conversational tone, in the same language as the text." } : {}),
        }),
        signal: AbortSignal.timeout(25000),
      });
    } else if (cfg.tts === "azure") {
      if (!sec.azureKey || !sec.azureRegion) return Response.json({ error: "no_key", provider: "azure" }, { status: 503 });
      const voice = cfg.ttsVoice || AZURE_DEFAULT[cfg.lang] || AZURE_DEFAULT["th-TH"];
      const lang = voice.split("-").slice(0, 2).join("-");
      r = await fetch(`https://${sec.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": sec.azureKey, "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "orb",
        },
        body: `<speak version='1.0' xml:lang='${lang}'><voice name='${voice}'>${xml(text)}</voice></speak>`,
        signal: AbortSignal.timeout(25000),
      });
    } else {
      return Response.json({ error: "browser_voice" }, { status: 400 });
    }
    if (!r.ok) {
      console.error("tts provider", cfg.tts, r.status, (await r.text()).slice(0, 200));
      return Response.json({ error: "tts_failed", status: r.status }, { status: 502 });
    }
    return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("tts error", e);
    return Response.json({ error: "tts_failed" }, { status: 502 });
  }
}
