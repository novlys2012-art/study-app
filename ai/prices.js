// USD per million tokens. Keep in step with the provider comparison in the roadmap.
// This list is also the gate for running a model: ai/index.js refuses a model that has no price here,
// because its calls would be logged at $0 and never count toward the spending caps.
export const PRICES = {
  "anthropic:claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "anthropic:claude-sonnet-5-5": { input: 2, output: 10 },
};

export const hasPrice = (provider, model) => Object.hasOwn(PRICES, `${provider}:${model}`);

export function costUsd(provider, model, usage) {
  const p = PRICES[`${provider}:${model}`];
  if (!p) return null;
  return (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1e6;
}
