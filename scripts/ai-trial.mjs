// Phase 0: run summary and quiz generation on real course files and log tokens and cost.
// Usage:
//   node scripts/ai-trial.mjs --dry-run files...      extract and count only, no AI calls
//   ANTHROPIC_API_KEY=... node scripts/ai-trial.mjs files...
//   AI_PROVIDER=google AI_MODEL_FAST=... GEMINI_API_KEY=... node scripts/ai-trial.mjs files...
// Options: --lang sk|cs, --questions N (per section), --sections N (limit per file).
// Results go to trial-output/<file>.json and a summary table is printed at the end.
import { mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { extract, stripRepeated, toSections } from "./lib/extract.mjs";
import { getProvider } from "../ai/index.js";
import { summaryQuizSystem, summaryQuizPrompt, parseSummaryQuiz } from "../ai/tasks.js";

const { values: opt, positionals: files } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean" },
    lang: { type: "string", default: "sk" },
    questions: { type: "string", default: "8" },
    sections: { type: "string" },
  },
});
if (!files.length) { console.error("Give at least one PDF, PPTX, DOCX or TXT file."); process.exit(1); }

const ai = opt["dry-run"] ? null : getProvider();
const rows = [];
await mkdir("trial-output", { recursive: true });

for (const file of files) {
  const pages = stripRepeated(await extract(file));
  let sections = toSections(pages);
  if (opt.sections) sections = sections.slice(0, Number(opt.sections));
  const chars = sections.reduce((s, x) => s + x.text.length, 0);
  const row = { file: basename(file), pages: pages.length, sections: sections.length, estTokens: Math.round(chars / 4), questions: 0, dropped: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, seconds: 0 };
  const results = [];
  if (ai) {
    const t0 = Date.now();
    for (const sec of sections) {
      const res = await ai.complete({
        tier: "fast",
        system: summaryQuizSystem(opt.lang),
        prompt: summaryQuizPrompt({ title: `${row.file}, ${sec.from}–${sec.to}`, text: sec.text, count: Number(opt.questions) }),
      });
      let parsed;
      try { parsed = parseSummaryQuiz(res.text); } catch (e) { parsed = { error: e.message, raw: res.text }; }
      results.push({ from: sec.from, to: sec.to, ...parsed, usage: res.usage, truncated: res.truncated });
      row.questions += parsed.questions?.length || 0;
      row.dropped += parsed.dropped || 0;
      row.inputTokens += res.usage.inputTokens;
      row.outputTokens += res.usage.outputTokens;
      row.costUsd = res.costUsd == null || row.costUsd == null ? null : row.costUsd + res.costUsd;
    }
    row.seconds = Math.round((Date.now() - t0) / 1000);
    row.provider = `${ai.name}:${ai.models.fast}`;
    await writeFile(`trial-output/${row.file}.json`, JSON.stringify({ ...row, results }, null, 2));
  }
  rows.push(row);
}
console.table(rows);
