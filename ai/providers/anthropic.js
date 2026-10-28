import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODELS = { fast: "claude-haiku-5-5", strong: "claude-sonnet-5-5" };

let client;

export async function complete({ model, system, prompt, maxTokens }) {
  // Cloud sessions reserve ANTHROPIC_API_KEY, so the key can also be saved there as STUDY_APP_ANTHROPIC_KEY.
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || process.env.STUDY_APP_ANTHROPIC_KEY });
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    // The instructions are the same on every call, so they are cached once a file has several sections.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this section.");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return {
    text,
    truncated: res.stop_reason === "max_tokens",
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  };
}
