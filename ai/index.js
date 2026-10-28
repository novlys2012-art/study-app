// One entry point for every AI call. Claude is the chosen provider (28 Oct); the switch stays so
// another provider can be added without touching callers:
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

  // tier "fast" for summaries, quizzes and topics; "strong" for checks and scanned past exams.
  async function complete({ tier = "fast", system, prompt, images, effort, maxTokens = 16000 }) {
    const model = models[tier];
    const out = await impl.complete({ model, system, prompt, images, effort, maxTokens, env });
    return { ...out, provider: name, model, costUsd: costUsd(name, model, out.usage) };
  }
  return { name, models, complete };
}
