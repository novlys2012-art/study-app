// USD per million tokens. Keep in step with the provider comparison in the roadmap;
// a model missing here still runs, its cost is just logged as unknown.
export const PRICES = {
  "anthropic:claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "anthropic:claude-sonnet-5-5": { input: 2, output: 10 },
};

export function costUsd(provider, model, usage) {
  const p = PRICES[`${provider}:${model}`];
  if (!p) return null;
  return (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1e6;
}
