// Phase 0: run summary and quiz generation on real course files and log tokens and cost.
// Usage:
//   node scripts/ai-trial.mjs --dry-run files...      extract and count only, no AI calls
//   ANTHROPIC_API_KEY=... node scripts/ai-trial.mjs files...
//   AI_PROVIDER=google AI_MODEL_FAST=... GEMINI_API_KEY=... node scripts/ai-trial.mjs files...
//   npm run trial -- --mode exam old-exams...       past exam mode: tag each exam question with a topic
//                                                   and rank topics by how many exams they appear in
// Options: --lang sk|cs, --questions N (per section), --sections N (limit per file).
// Results go to trial-output/<file>.json and a summary table is printed at the end.
import { mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { extract, extractImages, stripRepeated, toSections } from "./lib/extract.mjs";
import { getProvider } from "../ai/index.js";
import { summaryQuizSystem, summaryQuizPrompt, parseSummaryQuiz, pastExamSystem, pastExamPrompt, parsePastExam, rankTopics } from "../ai/tasks.js";

const { values: opt, positionals: files } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean" },
    mode: { type: "string", default: "quiz" },
    lang: { type: "string", default: "sk" },
    questions: { type: "string", default: "8" },
    sections: { type: "string" },
  },
});
if (!files.length) { console.error("Give at least one PDF, PPTX, DOCX or TXT file."); process.exit(1); }

const ai = opt["dry-run"] ? null : getProvider();
const rows = [];
await mkdir("trial-output", { recursive: true });

if (opt.mode === "exam") {
  const exams = [];
  for (const file of files) {
    const text = stripRepeated(await extract(file).catch(() => [])).join("\n\n");
    // Scans: use the page images when the file has (almost) no text of its own.
    const images = text.trim().length < 200 ? await extractImages(file) : [];
    const row = { file: basename(file), textChars: text.length, images: images.length, questions: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    if (ai) {
      const known = [...new Set(exams.flatMap((e) => e.questions.map((q) => q.topic)))];
      const res = await ai.complete({
        tier: "strong",
        system: pastExamSystem(opt.lang),
        prompt: pastExamPrompt({ title: row.file, text: images.length ? "" : text, knownTopics: known }),
        images,
      });
      let parsed;
      try { parsed = parsePastExam(res.text); } catch (e) { parsed = { questions: [], unreadable: "", error: e.message, raw: res.text }; }
      exams.push(parsed);
      Object.assign(row, { questions: parsed.questions.length, ...res.usage, costUsd: res.costUsd, provider: `${ai.name}:${ai.models.strong}` });
      await writeFile(`trial-output/${row.file}.exam.json`, JSON.stringify({ ...row, ...parsed }, null, 2));
    }
    rows.push(row);
  }
  console.table(rows);
  if (exams.length) {
    const ranking = rankTopics(exams);
    await writeFile("trial-output/topic-ranking.json", JSON.stringify(ranking, null, 2));
    console.table(ranking.map((r) => ({ topic: r.topic, exams: `${r.exams} of ${r.of}`, questions: r.questions, points: r.points })));
  }
  process.exit(0);
}

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
