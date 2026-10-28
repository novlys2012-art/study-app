// One entry point for every AI call, so the provider can be swapped with an env variable:
//   AI_PROVIDER=anthropic|google   AI_MODEL_FAST=...   AI_MODEL_STRONG=...
// To add a provider, add a file in providers/ that exports DEFAULT_MODELS and complete().
import * as anthropic from "./providers/anthropic.js";
import * as google from "./providers/google.js";
import { costUsd } from "./prices.js";

const PROVIDERS = { anthropic, google };

export function getProvider(env = process.env) {
  const name = env.AI_PROVIDER || "anthropic";
  const impl = PROVIDERS[name];
  if (!impl) throw new Error(`Unknown AI_PROVIDER "${name}". Known: ${Object.keys(PROVIDERS).join(", ")}`);
  const models = {
    fast: env.AI_MODEL_FAST || impl.DEFAULT_MODELS.fast,
    strong: env.AI_MODEL_STRONG || impl.DEFAULT_MODELS.strong,
  };
  for (const [tier, m] of Object.entries(models)) {
    if (!m) throw new Error(`Set AI_MODEL_${tier.toUpperCase()} for provider "${name}".`);
  }

  // tier "fast" for summaries, quizzes and topics; "strong" for past exam analysis.
  async function complete({ tier = "fast", system, prompt, maxTokens = 16000 }) {
    const model = models[tier];
    const out = await impl.complete({ model, system, prompt, maxTokens });
    return { ...out, provider: name, model, costUsd: costUsd(name, model, out.usage) };
  }
  return { name, models, complete };
}
