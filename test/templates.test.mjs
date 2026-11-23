import test from "node:test";
import assert from "node:assert/strict";
import { handle, HttpError } from "../server/generate.js";
import { parseTemplates, parseTemplateProblem, templatePrompt, templateProblemPrompt } from "../ai/tasks.js";
import { readTemplates, generateSimilarProblem, TEMPLATE_IMAGES, MAX_PROBLEMS_PER_TEMPLATE } from "../src/upload/templates.js";

const rejects = (p, code) => assert.rejects(p, (e) => e instanceof HttpError && e.code === code);
const user = { id: "u1", email: "student@example.com" };
const img = (page) => ({ page, mediaType: "image/jpeg", data: "AAAA" });

function memCache() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (r) => { if (!m.has(r.key)) m.set(r.key, r.result); } };
}

function deps(text, { cache = null, month = 0 } = {}) {
  const calls = [], rows = [];
  return {
    calls, rows, user, env: {}, cache, log: () => {},
    spend: async () => ({ month, today: 0, minute: 0 }),
    record: async (r) => rows.push(r),
    ai: {
      name: "fake", models: { fast: "m-fast", strong: "m-strong" },
      complete: async (req) => {
        calls.push(req);
        return { text, usage: { inputTokens: 200, outputTokens: 150 }, model: req.tier === "strong" ? "m-strong" : "m-fast", costUsd: 0.005 };
      },
    },
  };
}

// ----- Parsers

test("parsers: parseTemplates caps at 12 and drops malformed items", () => {
  const many = Array.from({ length: 15 }, (_, k) => ({
    title: `  Typ ${k + 1} `, topic: " Elasticita ", prompt: `Zadanie ${k + 1}`,
    method: [" Krok 1 ", "", 42], varies: " ceny ", example: " E = -1 ",
  }));
  many.push({ title: "Bez zadania", prompt: "" });
  const r = parseTemplates(JSON.stringify({ templates: many, unreadable: "s. 2 rozmazaná" }));
  assert.equal(r.templates.length, 12);
  assert.deepEqual(r.templates[0], {
    title: "Typ 1", topic: "Elasticita", prompt: "Zadanie 1",
    method: ["Krok 1"], varies: "ceny", example: "E = -1",
  });
  assert.equal(r.unreadable, "s. 2 rozmazaná");
  assert.match(templatePrompt({ title: "Zošit", text: "Príklad 1" }), /<material_text>\nPríklad 1/);
});

test("parsers: parseTemplateProblem validates required fields and check spec", () => {
  const ok = parseTemplateProblem(JSON.stringify({
    q: "Vypočítaj 3x + 2 pre x = 4.",
    hints: ["Dosaď x = 4", ""],
    steps: ["3 × 4 + 2 = 12 + 2 = 14", "Kontrola: (14 - 2) / 3 = 4"],
    ans: "14",
    check: { num: 14, tol: 0.01, unit: "" },
    e: "Dodrž poradie operácií.",
  }));
  assert.equal(ok.ans, "14");
  assert.deepEqual(ok.check, { num: 14, tol: 0.01, unit: "" });
  assert.deepEqual(ok.hints, ["Dosaď x = 4"]);
  assert.throws(() => parseTemplateProblem('{"q":"A","steps":[],"ans":"1"}'));
  assert.throws(() => parseTemplateProblem('{"q":"","steps":["1"],"ans":"1"}'));
});

// ----- Server tasks

test("server: template task runs on strong tier and validates text/images", async () => {
  const reply = JSON.stringify({
    templates: [{ title: "Výpočet DPH", topic: "Účtovníctvo", prompt: "Faktúra 100 € + 20 % DPH", method: ["Vynásob 0,20"], varies: "suma", example: "20 €" }],
    unreadable: "",
  });
  const d = deps(reply);
  const out = await handle({ task: "template", input: { title: "Cvičenie 1", text: "[1]\nFaktúra 100 €", knownTopics: ["Účtovníctvo"] } }, d);
  assert.equal(d.calls[0].tier, "strong");
  assert.equal(d.calls[0].effort, "medium");
  assert.equal(out.result.templates.length, 1);

  await handle({ task: "template", input: { title: "Foto zošita", images: [img(1), img(2)] } }, d);
  assert.equal(d.calls[1].images.length, 2);
  assert.match(d.calls[1].prompt, /attached page images/);

  await rejects(handle({ task: "template", input: { title: "Empty", text: " " } }, d), "bad_input");
  await rejects(handle({ task: "template", input: { text: "x", images: Array.from({ length: 7 }, (_, k) => img(k + 1)) } }, d), "too_large");
});

test("server: template_problem enforces variant 1|2, routes math to strong, and hits ai_cache", async () => {
  const reply = JSON.stringify({
    q: "Vypočítaj elasticitu pri poklese ceny z 20 € na 18 €.",
    hints: ["Použi vzorec E = (ΔQ/Q) / (ΔP/P)."],
    steps: ["ΔP/P = -2/20 = -0,10", "E = 0,20 / -0,10 = -2"],
    ans: "E = -2",
    check: { num: -2, tol: 0.02, unit: "" },
    e: "Pozor na znamienko.",
  });
  const cache = memCache();
  const mathTpl = { title: "Elasticita", topic: "Mikro", prompt: "Cena vzrástla z 10 € na 12 € (20 %).", method: ["E = %ΔQ / %ΔP"], varies: "ceny" };

  const d1 = deps(reply, { cache });
  await rejects(handle({ task: "template_problem", input: { template: mathTpl, variant: 0 } }, d1), "bad_input");
  await rejects(handle({ task: "template_problem", input: { template: mathTpl, variant: 3 } }, d1), "bad_input");
  await rejects(handle({ task: "template_problem", input: { template: mathTpl, variant: "1" } }, d1), "bad_input");
  await rejects(handle({ task: "template_problem", input: { template: { title: "X" }, variant: 1 } }, d1), "bad_input");

  // Variant 1 ignores avoid, routes numeric template to strong, and populates ai_cache.
  const r1 = await handle({ task: "template_problem", input: { template: mathTpl, variant: 1, avoid: "should-be-ignored", context: "x".repeat(8000) } }, d1);
  assert.equal(r1.cached, false);
  assert.equal(d1.calls[0].tier, "strong");
  assert.equal(d1.calls[0].effort, "medium");
  assert.doesNotMatch(d1.calls[0].prompt, /<avoid>/);
  assert.ok(d1.calls[0].prompt.length < 7000, "context is trimmed to keep per-problem tokens low");

  // Repeated variant 1 hits ai_cache even over monthly cap.
  const r1Again = await handle({ task: "template_problem", input: { template: mathTpl, variant: 1, context: "x".repeat(8000) } }, { ...d1, spend: async () => ({ month: 5, today: 0, minute: 0 }) });
  assert.equal(r1Again.cached, true);
  assert.equal(d1.calls.length, 1);

  // Variant 2 includes <avoid> and is distinct in cache.
  await handle({ task: "template_problem", input: { template: mathTpl, variant: 2, avoid: r1.result.q } }, d1);
  assert.equal(d1.calls.length, 2);
  assert.match(d1.calls[1].prompt, /<avoid>/);

  // Conceptual non-numeric template stays on fast tier.
  const lawTpl = { title: "Neplatnosť právneho úkonu", topic: "Občianske právo", prompt: "Posúď, či je zmluva uzatvorená v omyle relatívne neplatná.", method: ["Urč druh vady vôle"], varies: "skutkový dej" };
  const d2 = deps(reply);
  await handle({ task: "template_problem", input: { template: lawTpl, variant: 1 } }, d2);
  assert.equal(d2.calls[0].tier, "fast");
  assert.equal(d2.calls[0].effort, undefined);
  assert.match(templateProblemPrompt({ template: lawTpl, variant: 2, avoid: "Prípad A" }), /variant 2 of 2/);
});

// ----- Client upload & generation pipeline

test("readTemplates: handles text, <=6 images directly, >6 images via vision, and partial failures", async () => {
  const calls = [];
  const call = async (task, input) => {
    calls.push({ task, input });
    if (task === "vision") return input.images.map((im) => ({ page: im.page, text: `Strana ${im.page}: Vzorový výpočet` }));
    if (task === "template") {
      if (input.title === "Prázdny") return { templates: [], unreadable: "" };
      return {
        templates: [{ title: `Vzor z ${input.title}`, topic: "Štatistika", prompt: "Vypočítaj priemer", method: ["Sčítaj a vydeľ"], varies: "čísla", example: "5" }],
        unreadable: "",
      };
    }
    throw new Error("unexpected " + task);
  };
  const textDoc = { name: "Cvicenie_1", pages: ["Príklad 1: priemer"], images: [], skipped: 0 };
  const photoDoc = (n) => ({ name: "Zosit", pages: Array(n).fill(""), images: Array.from({ length: n }, (_, k) => img(k + 1)), skipped: 0 });

  const out = await readTemplates({
    items: [
      { doc: textDoc, name: "Cvicenie_1" },
      { doc: photoDoc(TEMPLATE_IMAGES), name: "Foto6" },
      { doc: photoDoc(9), name: "VelkyZosit" },
      { doc: textDoc, name: "Prázdny" },
    ],
    knownTopics: ["Pravdepodobnosť"],
    context: "x̄ = ∑xᵢ / n",
    call,
    retry: { base: 0 },
  });

  assert.deepEqual(calls.map((c) => c.task), ["template", "template", "vision", "vision", "vision", "template", "template"]);
  assert.equal(calls[1].input.images.length, TEMPLATE_IMAGES);
  assert.deepEqual(calls[5].input.images, []);
  assert.match(calls[5].input.text, /\[9\]\nStrana 9/);
  assert.equal(out.added, 3);
  assert.equal(out.templates.length, 3);
  assert.deepEqual(out.failed.map((f) => [f.name, f.code]), [["Prázdny", "no_templates"]]);
  assert.ok(out.templates.every((t) => /^tp[0-9a-f]{8}$/.test(t.id) && Array.isArray(t.problems) && t.problems.length === 0));
});

test("generateSimilarProblem: creates variant 1, variant 2 with avoid, and blocks a 3rd", async () => {
  const seen = [];
  const call = async (task, input) => {
    seen.push({ task, input });
    return {
      q: `Nové zadanie #${input.variant}`,
      hints: ["Nápoveda"],
      steps: ["Krok 1", "Krok 2"],
      ans: `${input.variant * 10}`,
      check: { num: input.variant * 10, tol: 0.01, unit: "" },
      e: "Pozor na jednotky.",
    };
  };
  const tpl = { id: "tp1", title: "Priemer", topic: "Štatistika", prompt: "Priemer z 2, 4", method: ["Sčítaj"], varies: "čísla", example: "3", problems: [] };

  const p1 = await generateSimilarProblem({ tpl, context: "c".repeat(7000), call, retry: { base: 0 } });
  assert.equal(p1.variant, 1);
  assert.equal(seen[0].task, "template_problem");
  assert.equal(seen[0].input.avoid, undefined);
  assert.equal(seen[0].input.context.length, 6000);

  tpl.problems.push(p1);
  const p2 = await generateSimilarProblem({ tpl, call, retry: { base: 0 } });
  assert.equal(p2.variant, 2);
  assert.equal(seen[1].input.avoid, "Nové zadanie #1");

  tpl.problems.push(p2);
  assert.equal(tpl.problems.length, MAX_PROBLEMS_PER_TEMPLATE);
  await assert.rejects(generateSimilarProblem({ tpl, call, retry: { base: 0 } }), (e) => e.code === "max_variants");
  assert.equal(seen.length, 2, "a 3rd attempt never calls the server");
});
