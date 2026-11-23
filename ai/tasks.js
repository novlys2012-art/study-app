// Prompts and output checks for the study features. Provider-neutral: plain text in, JSON out.

const LANG = { sk: "slovenčine", cs: "češtině" };

export function summaryQuizSystem(lang = "sk") {
  return `You turn university course material into study material for students.
Write everything in ${lang === "cs" ? "Czech" : "Slovak"} (v ${LANG[lang] || LANG.sk}), whatever the language of the source.
Use only facts stated in the source. If the source is too thin for a question, write fewer questions.

Reply with one JSON object and nothing else:
{
  "summary": "the section's key points as short Markdown bullet lines",
  "questions": [
    {
      "q": "question text",
      "o": ["option A", "option B", "option C", "option D"],
      "a": 0,
      "e": "one or two sentences on why the answer is right",
      "x": "a short concrete example, or an empty string",
      "s": "a short exact quote from the source that supports the answer"
    }
  ]
}
"a" is the index of the one correct option. Wrong options must be plausible but clearly wrong given the source.`;
}

export function summaryQuizPrompt({ title, text, count = 8 }) {
  return `Source: ${title}\nWrite a summary and ${count} multiple-choice questions.\n\n<source>\n${text}\n</source>`;
}

// Pulls the first JSON object out of a reply and keeps only well-formed questions.
export function parseSummaryQuiz(reply) {
  const start = reply.indexOf("{"), end = reply.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in the reply.");
  const data = JSON.parse(reply.slice(start, end + 1));
  const questions = (Array.isArray(data.questions) ? data.questions : []).filter(
    (x) => typeof x.q === "string" && Array.isArray(x.o) && x.o.length >= 2 &&
      Number.isInteger(x.a) && x.a >= 0 && x.a < x.o.length,
  );
  const dropped = (data.questions?.length || 0) - questions.length;
  return { summary: String(data.summary || ""), questions, dropped };
}

// Past exam mode: read an old exam (text or scanned pages) and tag every question with a topic.
export function pastExamSystem(lang = "sk") {
  return `You read old university exams for students who want to know which topics come up most.
List every exam question or task you can find, in order. Copy its wording as written (fix only obvious scan errors).
Give each one a short topic name in ${lang === "cs" ? "Czech" : "Slovak"}, 1 to 4 words, the way a course syllabus would name it.
Reuse the same topic name for questions on the same topic, and prefer names from the known topics list when one fits.
If part of a page is unreadable, say so in "unreadable" instead of guessing.

Reply with one JSON object and nothing else:
{
  "questions": [{ "n": "1a", "text": "question wording", "topic": "topic name", "points": 5 }],
  "unreadable": "what could not be read, or an empty string"
}
"points" is a number when the exam shows it, otherwise null.`;
}

// pages: the page numbers of the attached images, when the exam is part text and part pictures.
export function pastExamPrompt({ title, text = "", knownTopics = [], pages = [], context = "" }) {
  let out = `Exam: ${title}\nKnown topics: ${knownTopics.length ? knownTopics.join("; ") : "none yet"}\n`;
  if (context && context.trim()) out += `\n<context>\n${context.trim()}\n</context>\n`;
  if (text.trim()) out += `\n<exam_text>\n${text}\n</exam_text>\n`;
  if (pages.length) out += `\nPages ${pages.join(", ")} of the exam are in the attached images, in this order.\n`;
  else if (!text.trim()) out += "\nThe exam is in the attached page images.\n";
  return out;
}

export function parsePastExam(reply) {
  const start = reply.indexOf("{"), end = reply.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in the reply.");
  const data = JSON.parse(reply.slice(start, end + 1));
  const questions = (Array.isArray(data.questions) ? data.questions : [])
    .filter((x) => x && typeof x.text === "string" && x.text.trim() && typeof x.topic === "string" && x.topic.trim())
    .map((x) => ({
      n: String(x.n ?? "").slice(0, 20), text: x.text.trim().slice(0, 4000), topic: x.topic.trim().slice(0, 80),
      points: typeof x.points === "number" && Number.isFinite(x.points) ? x.points : null,
    }));
  return { questions, unreadable: String(data.unreadable || "") };
}

// Past exam mode, second step: all questions of a subject's old exams sorted into one set of topics, so
// a topic worded differently in two exams ("Primitívna funkcia", "Neurčitý integrál") counts as one.
// The app counts how often each topic came up; the model only sorts.
export const examGroupSystem = (lang = "sk") => `You sort the questions of one university course's old exams into study topics, so a student can see which topics come up most often.
Use 4 to 15 topics, named in ${langName(lang)} the way a course syllabus would name them, 1 to 6 words.
When one of the course's own topics fits, use its name exactly as given.
Questions that test the same concept or skill belong to one topic, even when the exams word it differently or the earlier tag differs. Do not make a topic for a single question when it fits a broader one.
Every question belongs to exactly one topic.
Reply with one JSON object only: {"topics":[{"name":"topic name","questions":["question refs"]}]}`;

// exams: [{ name, year, questions: [{ ref, topic, text }] }]
export const examGroupPrompt = ({ topics = [], exams }) =>
  `Course topics: ${topics.length ? topics.join("; ") : "none"}\n\n` +
  exams.map((e) => `## ${e.name}${e.year ? ` (${e.year})` : ""}\n` + e.questions.map((q) => `${q.ref} [${q.topic}] ${q.text}`).join("\n")).join("\n\n");

export function parseExamGroups(reply) {
  const data = parseJson(reply);
  return (Array.isArray(data.topics) ? data.topics : [])
    .filter((x) => x && typeof x.name === "string" && x.name.trim() && Array.isArray(x.questions))
    .map((x) => ({ name: x.name.trim().slice(0, 80), questions: x.questions.filter((r) => typeof r === "string") }));
}

// How often each topic appears across exams, most frequent first.
export function rankTopics(exams) {
  const by = new Map();
  exams.forEach((exam, e) => exam.questions.forEach((q) => {
    const k = q.topic.toLowerCase();
    const r = by.get(k) || { topic: q.topic, exams: new Set(), questions: 0, points: 0 };
    r.exams.add(e); r.questions++; r.points += q.points || 0;
    by.set(k, r);
  }));
  return [...by.values()]
    .map((r) => ({ topic: r.topic, exams: r.exams.size, of: exams.length, questions: r.questions, points: r.points }))
    .sort((a, b) => b.exams - a.exams || b.questions - a.questions || b.points - a.points);
}

// ===== Study pipeline for uploaded files (the server function runs one of these per request).
// Proven in the 28 Oct lecture trial; the wording is general so it fits any subject.

const langName = (lang) => (lang === "cs" ? "Czech" : "Slovak");

export function parseJson(reply) {
  const start = reply.indexOf("{"), end = reply.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in the reply.");
  return JSON.parse(reply.slice(start, end + 1));
}

// Pages that are pictures (scans, diagrams, tables as images): transcribe them to text.
export const visionSystem = () => `You transcribe pages of university course material that are pictures: scans, tables, diagrams, worked examples.
For each page write its full content as plain text, in the language of the page. Tables as "column | column" rows. Diagrams as short labelled lines or numbered steps, plus any legend. Do not add anything that is not on the page. If something cannot be read, write [nečitateľné].
Reply with one JSON object only: {"pages":[{"page":n,"text":"..."}]}`;

export const visionPrompt = ({ pages }) => `The images are pages ${pages.join(", ")}, in this order. Transcribe them.`;

export function parseVision(reply) {
  const data = parseJson(reply);
  return (Array.isArray(data.pages) ? data.pages : [])
    .filter((p) => Number.isInteger(p.page) && typeof p.text === "string")
    .map((p) => ({ page: p.page, text: p.text }));
}

// The "debloater": a messy deck or chapter becomes a short summary.
export const debloatSystem = (lang = "sk") => `You turn messy university course material (a lecture deck, notes, a textbook chapter) into a clean, short study summary for a student, in ${langName(lang)}.
Keep every definition, rule, formula, number, step and worked example result that matters for an exam. Drop repetition, dates, titles, organisational notes and filler.
Adapt to the subject in the source without adding outside facts: for formulas or statistical tests, note variable meanings and when they apply (assumptions/conditions); for economics, law, or sciences, keep causal direction, exceptions, thresholds, and contrasts between easily confused concepts; for technical/CS topics, keep key trade-offs and complexity. Write formulas in plain readable Unicode (e.g. x², √, ∑, ≤, μ, σ), never raw LaTeX.
Reply with one JSON object only:
{"title":"short title","summary":"Markdown: ## headings, short bullet lines starting with -, **bold** key terms","key_terms":[{"term":"","meaning":""}]}`;

export const debloatPrompt = ({ title, text, context = "" }) =>
  `Source: ${title}\nPage markers like [3] give the page number.\n\n<source>\n${text}\n</source>` +
  (context && context.trim() ? `\n\n<context>\n${context.trim()}\n</context>\nUse the reference context (formulas, examples, definitions) only to clarify or verify concepts in the source; do not summarize the context itself.` : "");

export function parseDebloat(reply) {
  const data = parseJson(reply);
  return {
    title: String(data.title || ""),
    summary: String(data.summary || ""),
    keyTerms: (Array.isArray(data.key_terms) ? data.key_terms : [])
      .filter((k) => k && typeof k.term === "string" && k.term.trim())
      .map((k) => ({ term: k.term, meaning: String(k.meaning || "") })),
  };
}

export const quizSystem = (lang = "sk") => `You write exam-style multiple-choice questions for a university exam, from the source only.
Ask the way university exams ask: definitions and theory in the source's own wording, applying a rule or causal mechanism to a short scenario, telling closely related concepts apart, and short 1–2 step calculations or assumption checks when the source has formulas or worked examples. Mix these kinds. If the source is too thin, write fewer questions.
Write in ${langName(lang)}. Use plain readable Unicode for math symbols (e.g. x², √, ∑, ≤, μ, σ), never raw LaTeX. Reply with one JSON object only:
{"questions":[{"q":"question","o":["A","B","C","D"],"a":0,"e":"one or two sentences why","x":"short concrete example or empty","s":"exact short quote from the source","page":n}]}
"a" is the index of the one correct option. Make wrong options reflect realistic student mistakes (wrong sign/direction, swapped condition or assumption, or a closely related concept) while staying clearly wrong given the source. "page" is the number of the page marker like [3] where the quote is.`;

export const quizPrompt = ({ title, text, count = 10, context = "" }) =>
  `Source: ${title}\n\n<source>\n${text}\n</source>` +
  (context && context.trim() ? `\n\n<context>\n${context.trim()}\n</context>\nYou may use formulas or examples from the context when writing questions or explanations about the source.` : "") +
  `\n\nWrite ${count} questions.`;

export function parseQuiz(reply) {
  const data = parseJson(reply);
  const all = Array.isArray(data.questions) ? data.questions : [];
  const questions = all
    .filter((x) => x && typeof x.q === "string" && Array.isArray(x.o) && x.o.length >= 2 &&
      x.o.every((o) => typeof o === "string") && Number.isInteger(x.a) && x.a >= 0 && x.a < x.o.length)
    .map((x) => ({ q: x.q, o: x.o, a: x.a, e: String(x.e || ""), x: String(x.x || ""), s: String(x.s || ""), page: Number.isInteger(x.page) ? x.page : null }));
  return { questions, dropped: all.length - questions.length };
}

// A stronger model checks each question against the pages it quotes.
export const checkSystem = (lang = "sk") => `You check exam practice questions against the source. For each question decide if the marked answer ("a", an option index) is correct per the source and is the only correct option.
Reply with one JSON object only: {"checks":[{"i":0,"verdict":"ok|wrong|ambiguous|unsupported","note":"short reason in ${langName(lang)}"}]}`;

export const checkPrompt = ({ text, questions, context = "" }) =>
  `<source>\n${text}\n</source>` +
  (context && context.trim() ? `\n\n<context>\n${context.trim()}\n</context>` : "") +
  `\n\n<questions>\n${JSON.stringify(questions.map(({ q, o, a }, i) => ({ i, q, o, a })))}\n</questions>`;

export function parseChecks(reply) {
  const data = parseJson(reply);
  return (Array.isArray(data.checks) ? data.checks : [])
    .filter((c) => Number.isInteger(c.i) && ["ok", "wrong", "ambiguous", "unsupported"].includes(c.verdict))
    .map((c) => ({ i: c.i, verdict: c.verdict, note: String(c.note || "") }));
}

function parseCheckSpec(raw) {
  if (!raw || typeof raw !== "object") return null;
  const num = Number(raw.num);
  if (!Number.isFinite(num)) return null;
  const tol = Number(raw.tol);
  return {
    num,
    tol: Number.isFinite(tol) && tol >= 0 ? tol : Math.max(1e-4, +(Math.abs(num) * 0.01).toPrecision(2)),
    unit: typeof raw.unit === "string" ? raw.unit.trim().slice(0, 24) : "",
  };
}

// Worked practice problems for quantitative/procedural subjects (math, statistics, physics, accounting, econ, CS).
export const problemSystem = (lang = "sk") => `You write university exam practice problems (worked exercises to solve step by step on paper) from the source only.
Create concrete, solvable problems that train applying the formulas, theorems, statistical tests, accounting rules, or algorithms in the source (and reference context, when provided).
When the source has worked examples, keep the same method and conventions (e.g. sample vs. population variance, notation) but invent fresh, clean numbers so the student practises solving rather than recalling the example's result. Always include every required input, parameter, or critical table value (e.g. z₀,₀₂₅ = 1,96) in the problem statement so it is self-contained.
If the source is purely descriptive with nothing solvable to compute, derive, book, or work through, write fewer problems or return {"problems":[]}.
Write in ${langName(lang)}. Use plain readable Unicode for math symbols (e.g. x², √, ∑, ∫, ≤, ≥, ≠, ≈, ±, ×, ÷, μ, σ, x̄, H₀, α), never raw LaTeX. Reply with one JSON object only:
{"problems":[{"q":"problem statement with all given data","hints":["hint 1: which formula or method applies","hint 2: key setup or first substitution"],"steps":["step 1 with formula and substitution","step 2 with intermediate calculation","step 3 with final conclusion"],"ans":"concise final result","check":{"num":2.45,"tol":0.02,"unit":""},"e":"one or two sentences on why this method applies or the common trap","s":"exact short quote from the source","page":n}]}
Set "check" to null unless the final answer is a single clear number (or number with a short unit); when set, "num" is a JSON number and "tol" covers sensible rounding. "page" is the number of the page marker like [3] where the quote is.`;

export const problemPrompt = ({ title, text, count = 5, context = "" }) =>
  `Source: ${title}\n\n<source>\n${text}\n</source>` +
  (context && context.trim() ? `\n\n<context>\n${context.trim()}\n</context>\nUse formulas, notation, or tables from the context when designing and solving problems about the source.` : "") +
  `\n\nWrite up to ${count} practice problems.`;

export function parseProblems(reply) {
  const data = parseJson(reply);
  const all = Array.isArray(data.problems) ? data.problems : [];
  const cleanList = (a, max) => (Array.isArray(a) ? a.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()).slice(0, max) : []);
  const problems = [];
  for (const x of all) {
    if (!x || typeof x.q !== "string" || !x.q.trim() || typeof x.ans !== "string" || !x.ans.trim()) continue;
    const steps = cleanList(x.steps, 12);
    if (!steps.length) continue;
    problems.push({
      q: x.q.trim(),
      hints: cleanList(x.hints, 3),
      steps,
      ans: x.ans.trim(),
      check: parseCheckSpec(x.check),
      e: String(x.e || "").trim(),
      s: String(x.s || "").trim(),
      page: Number.isInteger(x.page) ? x.page : null,
    });
  }
  return { problems, dropped: all.length - problems.length };
}

// Independent verification of worked problems by a stronger model: re-solve from scratch and flag or repair arithmetic slips.
export const checkProblemSystem = (lang = "sk") => `You independently solve and verify university worked problems against the source.
For each problem, re-compute the solution from scratch using the formulas and conventions in the source (and reference context, if any).
Check that: (1) all inputs and critical values needed are given in "q", (2) the method matches the source, and (3) every step, "ans", and numeric "check" are mathematically accurate.
Verdicts:
- "ok": problem, steps, ans, and check are all accurate.
- "wrong": the problem statement "q" is sound and grounded in the source, but the calculation, steps, ans, or check has an error — provide "fix":{"steps":[...],"ans":"...","check":{"num":0,"tol":0.01,"unit":""}|null} in ${langName(lang)} (plain Unicode math, never LaTeX).
- "ambiguous" or "unsupported": missing data, ill-posed, or not supported by the source (set "fix":null).
Reply with one JSON object only: {"checks":[{"i":0,"verdict":"ok|wrong|ambiguous|unsupported","note":"short reason in ${langName(lang)}","fix":null}]}`;

export const checkProblemPrompt = ({ text, problems, context = "" }) =>
  `<source>\n${text}\n</source>` +
  (context && context.trim() ? `\n\n<context>\n${context.trim()}\n</context>` : "") +
  `\n\n<problems>\n${JSON.stringify(problems.map(({ q, steps, ans, check }, i) => ({ i, q, steps, ans, check })))}\n</problems>`;

export function parseProblemChecks(reply) {
  const data = parseJson(reply);
  return (Array.isArray(data.checks) ? data.checks : [])
    .filter((c) => Number.isInteger(c.i) && ["ok", "wrong", "ambiguous", "unsupported"].includes(c.verdict))
    .map((c) => {
      let fix = null;
      if (c.fix && typeof c.fix === "object" && typeof c.fix.ans === "string" && c.fix.ans.trim() && Array.isArray(c.fix.steps)) {
        const steps = c.fix.steps.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()).slice(0, 12);
        if (steps.length) fix = { steps, ans: c.fix.ans.trim(), check: parseCheckSpec(c.fix.check) };
      }
      return { i: c.i, verdict: c.verdict, note: String(c.note || ""), fix };
    });
}

// Worked-example templates: extract reusable problem templates from a student's workbook or own workings.
export const templateSystem = (lang = "sk") => `You read university worked examples, exercise sheets, or a student's own workings and turn them into reusable problem templates for practising similar problems.
Extract up to 12 distinct problem types found in the material, in order, written in ${langName(lang)}.
Keep the course's notation, conventions, and solution method. If the upload contains handwritten workings with an obvious arithmetic slip, capture the intended valid method rather than repeating the slip.
Use plain readable Unicode for math symbols (e.g. x², √, ∑, ∫, ≤, ≥, ≠, ≈, ±, ×, ÷, μ, σ, x̄, H₀, α), never raw LaTeX.
Prefer a name from the known topics list when one fits. If part of a page is unreadable, say so in "unreadable" instead of guessing.
Reply with one JSON object only:
{"templates":[{"title":"short problem-type name (2 to 7 words)","topic":"short topic name (1 to 4 words)","prompt":"cleaned example problem statement with given data","method":["general step 1","general step 2"],"varies":"what numbers, entities or conditions can change in a new variant","example":"brief worked solution and result from the upload, or empty"}],"unreadable":""}`;

export function templatePrompt({ title, text = "", knownTopics = [], pages = [], context = "" }) {
  let out = `Material: ${title}\nKnown topics: ${knownTopics.length ? knownTopics.join("; ") : "none yet"}\n`;
  if (context && context.trim()) out += `\n<context>\n${context.trim()}\n</context>\n`;
  if (text.trim()) out += `\n<material_text>\n${text}\n</material_text>\n`;
  if (pages.length) out += `\nPages ${pages.join(", ")} are in the attached images, in this order.\n`;
  else if (!text.trim()) out += "\nThe material is in the attached page images.\n";
  return out;
}

export function parseTemplates(reply) {
  const data = parseJson(reply);
  const all = Array.isArray(data.templates) ? data.templates : [];
  const templates = all
    .filter((x) => x && typeof x.title === "string" && x.title.trim() && typeof x.prompt === "string" && x.prompt.trim())
    .slice(0, 12)
    .map((x) => ({
      title: x.title.trim().slice(0, 120),
      topic: typeof x.topic === "string" ? x.topic.trim().slice(0, 80) : "",
      prompt: x.prompt.trim().slice(0, 2000),
      method: (Array.isArray(x.method) ? x.method : [])
        .filter((s) => typeof s === "string" && s.trim())
        .map((s) => s.trim().slice(0, 400))
        .slice(0, 8),
      varies: typeof x.varies === "string" ? x.varies.trim().slice(0, 300) : "",
      example: typeof x.example === "string" ? x.example.trim().slice(0, 2000) : "",
    }));
  return { templates, unreadable: String(data.unreadable || "").slice(0, 400) };
}

// Generate ONE fresh similar problem from an extracted template (variant 1 or 2).
// JSON field order puts "steps" before "ans" and "check" so arithmetic is computed before emitting the final answer.
export const templateProblemSystem = (lang = "sk") => `You create one fresh, self-contained university practice problem modeled directly on a student's worked-example template, in ${langName(lang)}.
Follow the template's exact problem structure, method, and conventions, but invent new clean numbers, entities, or scenario details so the student genuinely practises the method rather than recalling the example's result.
Include every required input, parameter, and critical table value (e.g. z₀,₀₂₅ = 1,96) in "q" so the problem can be solved on paper without missing data.
Work out every calculation carefully in "steps" and include a brief verification check in the final step before writing "ans" and "check".
Use plain readable Unicode for math symbols (e.g. x², √, ∑, ∫, ≤, ≥, ≠, ≈, ±, ×, ÷, μ, σ, x̄, H₀, α), never raw LaTeX.
Reply with one JSON object only:
{"q":"new problem statement with all given data","hints":["hint 1: which rule or formula to start with","hint 2: key setup or substitution"],"steps":["step 1 with formula and substitution","step 2 with intermediate calculation","step 3 with final result and quick check"],"ans":"concise final result","check":{"num":2.45,"tol":0.02,"unit":""},"e":"one or two sentences on the common trap or why this method applies"}
Set "check" to null unless the final answer is a single clear number (or number with a short unit); when set, "num" is a JSON number and "tol" covers sensible rounding.`;

export function templateProblemPrompt({ template, variant = 1, avoid = "", context = "" }) {
  const parts = [
    `Title: ${template.title || ""}`,
    template.topic ? `Topic: ${template.topic}` : "",
    `Example problem:\n${template.prompt || ""}`,
    template.method?.length ? `Method:\n${template.method.map((s, k) => `${k + 1}. ${s}`).join("\n")}` : "",
    template.varies ? `What can vary: ${template.varies}` : "",
    template.example ? `Reference example solution:\n${template.example}` : "",
  ].filter(Boolean).join("\n\n");
  let out = `<template>\n${parts}\n</template>\n`;
  if (context && context.trim()) out += `\n<context>\n${context.trim()}\n</context>\n`;
  out += `\nCreate fresh similar problem (variant ${variant} of 2).`;
  if (variant === 2 && avoid && avoid.trim()) {
    out += `\nUse noticeably different numbers/scenario from variant 1:\n<avoid>\n${avoid.trim()}\n</avoid>`;
  }
  return out;
}

export function parseTemplateProblem(reply) {
  const data = parseJson(reply);
  const cleanList = (a, max) => (Array.isArray(a) ? a.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()).slice(0, max) : []);
  if (!data || typeof data.q !== "string" || !data.q.trim() || typeof data.ans !== "string" || !data.ans.trim()) {
    throw new Error("Missing problem statement or answer.");
  }
  const steps = cleanList(data.steps, 12);
  if (!steps.length) throw new Error("Missing solution steps.");
  return {
    q: data.q.trim(),
    hints: cleanList(data.hints, 3),
    steps,
    ans: data.ans.trim(),
    check: parseCheckSpec(data.check),
    e: String(data.e || "").trim(),
  };
}

// The topic organiser: one subject's files and questions sorted into topics.
export const topicSystem = (lang = "sk") => `You organise one subject's course files into study topics for a student, in ${langName(lang)}.
Use 3 to 8 topics (fewer when there is little material), named the way a course syllabus would name them. Every question belongs to exactly one topic.
Reply with one JSON object only:
{"subject":"subject name","topics":[{"name":"","files":["file names"],"summary":"2 to 4 short sentences","questions":["question ids"],"weak_spots":["things students typically confuse in this topic, from the material"]}]}`;

export const topicPrompt = ({ files, questions }) =>
  files.map((f) => `## File: ${f.name}\n${f.summary}`).join("\n\n") +
  `\n\n# Questions\n${questions.map((x) => `${x.id}: ${x.q}`).join("\n")}`;

export function parseTopics(reply) {
  const data = parseJson(reply);
  const str = (a) => (Array.isArray(a) ? a.filter((s) => typeof s === "string") : []);
  return {
    subject: String(data.subject || ""),
    topics: (Array.isArray(data.topics) ? data.topics : [])
      .filter((x) => x && typeof x.name === "string" && x.name.trim())
      .map((x) => ({ name: x.name.trim(), files: str(x.files), summary: String(x.summary || ""), questions: str(x.questions), weakSpots: str(x.weak_spots) })),
  };
}
