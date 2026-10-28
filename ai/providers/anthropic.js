import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODELS = { fast: "claude-haiku-5-5", strong: "claude-sonnet-5-5" };

let client;

// images: [{ mediaType: "image/png", data: <base64> }], sent before the prompt text.
// env: where the key comes from (process.env in scripts, the Edge Function's secrets on the server).
// Cloud sessions reserve ANTHROPIC_API_KEY, so the key can also be saved as STUDY_APP_ANTHROPIC_KEY.
export async function complete({ model, system, prompt, images = [], maxTokens, effort, env }) {
  const apiKey = env.ANTHROPIC_API_KEY || env.STUDY_APP_ANTHROPIC_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  if (client?.apiKey !== apiKey) client = new Anthropic({ apiKey });
  // Streaming keeps long answers (a whole deck's summary) clear of HTTP timeouts.
  const res = await client.messages.stream({
    model,
    max_tokens: maxTokens,
    ...(effort ? { output_config: { effort } } : {}),
    // The instructions are the same on every call, so they are cached once a file has several sections.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [
        ...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } })),
        { type: "text", text: prompt },
      ],
    }],
  }).finalMessage();
  if (res.stop_reason === "refusal") throw new Error("The model declined this section.");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return {
    text,
    truncated: res.stop_reason === "max_tokens",
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  };
}
