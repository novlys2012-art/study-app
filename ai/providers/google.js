// Gemini through its REST API. Not in use (Claude was chosen on 28 Oct); kept so the switch
// in ai/index.js stays real. Needs AI_MODEL_FAST / AI_MODEL_STRONG, there is no default.
export const DEFAULT_MODELS = { fast: null, strong: null };

const API = "https://generativelanguage.googleapis.com/v1beta/models/";

export async function complete({ model, system, prompt, images = [], maxTokens, env }) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set.");
  const res = await fetch(`${API}${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [...images.map((im) => ({ inline_data: { mime_type: im.mediaType, data: im.data } })), { text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || "").join("");
  return {
    text,
    truncated: cand?.finishReason === "MAX_TOKENS",
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
