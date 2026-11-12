import test from "node:test";
import assert from "node:assert/strict";
import { handle, HttpError } from "../server/generate.js";
import { readExams, groupExams, guessYear, EXAM_IMAGES } from "../src/upload/exams.js";
import { rankExams, rankedRound, matchTopic, examWeight, yearSpan, retagTopic, retagQuestion } from "../src/app/exams.js";
import { parsePastExam, parseExamGroups, pastExamPrompt } from "../ai/tasks.js";

const rejects = (p, code) => assert.rejects(p, (e) => e instanceof HttpError && e.code === code);
const user = { id: "u1", email: "s@example.com" };
function deps(text) {
  const calls = [];
  return {
    calls, user, env: {}, log: () => {},
    spend: async () => ({ month: 0, today: 0, minute: 0 }), record: async () => {},
    ai: { name: "fake", models: { fast: "m", strong: "m2" }, complete: async (req) => { calls.push(req); return { text, usage: { inputTokens: 1, outputTokens: 1 }, model: "m2", costUsd: 0.01 }; } },
  };
}
const img = (page) => ({ page, mediaType: "image/jpeg", data: "AAAA" });

// ----- Server tasks

test("server: an exam is read by the strong model, from text, pictures or both", async () => {
  const d = deps('{"questions":[{"n":"1","text":"Definujte limitu.","topic":"Limita","points":5}],"unreadable":""}');
  const out = await handle({ task: "exam", input: { title: "MAT 2023", text: "[1]\n1. Definujte limitu. (5 b.)", knownTopics: ["Limita", "Limita", " ", 7] } }, d);
  assert.deepEqual(out.result.questions, [{ n: "1", text: "Definujte limitu.", topic: "Limita", points: 5 }]);
  assert.equal(d.calls[0].tier, "strong");
  assert.match(d.calls[0].prompt, /Known topics: Limita\n/, "topic names are cleaned and kept once");
  await handle({ task: "exam", input: { title: "Scan", images: [img(1), img(2)] } }, d);
  assert.equal(d.calls[1].images.length, 2);
  assert.match(d.calls[1].prompt, /attached page images/);
  await handle({ task: "exam", input: { title: "Mixed", text: "[1]\nText", images: [img(2)] } }, d);
  assert.match(d.calls[2].prompt, /Pages 2 of the exam are in the attached images/);
  await rejects(handle({ task: "exam", input: { title: "Empty", text: " " } }, d), "bad_input");
  await rejects(handle({ task: "exam", input: { text: "x", images: Array.from({ length: 7 }, (_, k) => img(k + 1)) } }, d), "too_large");
  await rejects(handle({ task: "exam", input: { text: "x".repeat(60_001) } }, d), "too_large");
});

test("server: the group task sends cut question wording and checks its size", async () => {
  const d = deps('{"topics":[{"name":"Limita","questions":["e1#1","zzz"]},{"name":"","questions":[]}]}');
  const exams = [{ name: "A", year: 2024, questions: [{ ref: "e1#1", topic: "Limity", text: "x ".repeat(400) }] }];
  const out = await handle({ task: "group", input: { topics: ["Limita"], exams } }, d);
  assert.deepEqual(out.result, [{ name: "Limita", questions: ["e1#1", "zzz"] }]);
  assert.equal(d.calls[0].tier, "strong");
  assert.match(d.calls[0].prompt, /Course topics: Limita/);
  assert.match(d.calls[0].prompt, /## A \(2024\)\ne1#1 \[Limity\] /);
  assert.ok(d.calls[0].prompt.length < 500, "wording is cut to a few hundred characters");
  await rejects(handle({ task: "group", input: { exams: [] } }, d), "bad_input");
  const many = [{ name: "B", questions: Array.from({ length: 601 }, (_, k) => ({ ref: "r" + k, topic: "T", text: "q" })) }];
  await rejects(handle({ task: "group", input: { exams: many } }, d), "too_large");
});

test("parsers: exam questions need wording and a topic; groups need a name", () => {
  const r = parsePastExam('{"questions":[{"n":1,"text":" A ","topic":" T ","points":"5"},{"text":"","topic":"T"},{"text":"B"}],"unreadable":"s. 2"}');
  assert.deepEqual(r, { questions: [{ n: "1", text: "A", topic: "T", points: null }], unreadable: "s. 2" });
  assert.deepEqual(parseExamGroups('{"topics":[{"name":"X","questions":["a",3]},{"name":"Y"}]}'), [{ name: "X", questions: ["a"] }]);
  assert.match(pastExamPrompt({ title: "T", text: "abc" }), /<exam_text>\nabc/);
});

// ----- Reading exams on the device (with a fake server)

function fakeServer({ fail = {} } = {}) {
  const calls = [];
  const call = async (task, input) => {
    calls.push({ task, input });
    if (fail[task]) { const e = fail[task](input); if (e) throw e; }
    if (task === "vision") return input.images.map((im) => ({ page: im.page, text: `Strana ${im.page}: Vypočítajte deriváciu.` }));
    if (task === "exam") {
      const topic = /integr/i.test(input.title) ? "Neurčitý integrál" : "Derivácia";
      return { questions: [{ n: "1", text: `Otázka z ${input.title}`, topic, points: 4 }, { n: "2", text: "Limita v bode", topic: "Limita funkcie", points: null }], unreadable: "" };
    }
    if (task === "group") {
      // Puts every question tagged "Neurčitý integrál" or "Primitívna funkcia" into one topic.
      const refs = (re) => input.exams.flatMap((e) => e.questions.filter((q) => re.test(q.topic)).map((q) => q.ref));
      return [{ name: "Primitívna funkcia", questions: refs(/integr|primit/i) }, { name: "Derivácia", questions: refs(/deriv/i) }];
    }
    throw new Error("unexpected task " + task);
  };
  return { calls, call };
}
const textDoc = (name) => ({ name, pages: ["1. Vypočítajte deriváciu funkcie.", "2. Limita v bode 0."], images: [], skipped: 0 });
const photoDoc = (n) => ({ name: "IMG", pages: Array(n).fill(""), images: Array.from({ length: n }, (_, k) => img(k + 1)), skipped: 0 });

test("reading exams: text in one call, few photos in the same call, many photos transcribed first", async () => {
  const { calls, call } = fakeServer();
  const steps = [];
  const out = await readExams({
    items: [{ doc: textDoc("MAT 2023"), name: "MAT 2023", year: 2023 }, { doc: photoDoc(EXAM_IMAGES), name: "Fotky", year: null }, { doc: photoDoc(9), name: "Sken integrál", year: 2019 }],
    knownTopics: ["Limita funkcie"], call, onStep: (d, t) => steps.push([d, t]),
  });
  assert.deepEqual(calls.map((c) => c.task), ["exam", "exam", "vision", "vision", "vision", "exam", "group"]);
  assert.match(calls[0].input.text, /^\[1\]\n1\. Vypočítajte/);
  assert.deepEqual(calls[0].input.images, []);
  assert.equal(calls[1].input.images.length, EXAM_IMAGES, "up to six photos go with the exam call");
  assert.deepEqual(calls[5].input.images, [], "more photos are read as text after the transcription");
  assert.match(calls[5].input.text, /\[9\]\nStrana 9/);
  assert.deepEqual(calls[1].input.knownTopics, ["Limita funkcie", "Derivácia"], "topics found in one exam are offered to the next");
  assert.equal(out.added, 3);
  assert.equal(out.exams.length, 3);
  assert.deepEqual(out.exams.map((e) => e.year), [2023, null, 2019]);
  assert.equal(out.exams[2].questions[0].topic, "Primitívna funkcia", "the group call names the topic for all exams");
  assert.equal(out.exams[0].questions[1].topic, "Limita funkcie", "a question the group left out keeps its tag");
  assert.ok(out.exams.every((e) => /^x[0-9a-f]{10}$/.test(e.id) && e.questions.every((q) => /^q[0-9a-f]{10}$/.test(q.id))));
  assert.deepEqual(steps.at(-1), [7, 7]);
});

test("reading exams: earlier exams are sorted again with the new ones, but a topic the student chose stays", async () => {
  const { calls, call } = fakeServer();
  const earlier = [{ id: "x1", name: "Old", year: 2018, questions: [
    { id: "q1", text: "Integrál", topic: "Neurčitý integrál" },
    { id: "q2", text: "Integrál 2", topic: "Neurčitý integrál", manual: true },
  ] }];
  const out = await readExams({ items: [{ doc: textDoc("Nová integrál"), name: "Nová integrál", year: 2024 }], earlier, call });
  const group = calls.find((c) => c.task === "group").input;
  assert.equal(group.exams.flatMap((e) => e.questions).length, 3, "the student's own choice is not sent");
  assert.equal(out.exams[0].questions[0].topic, "Primitívna funkcia");
  assert.equal(out.exams[0].questions[1].topic, "Neurčitý integrál");
  assert.equal(out.exams[1].questions[0].topic, "Primitívna funkcia");
});

test("reading exams: an exam with no questions fails alone; a failed sort keeps the tags; a spending limit stops the rest", async () => {
  const empty = fakeServer({ fail: { exam: (input) => (input.title === "Prázdna" ? null : null) } });
  const realCall = empty.call;
  const call = async (task, input) => (task === "exam" && input.title === "Prázdna" ? { questions: [], unreadable: "" } : task === "group" ? Promise.reject(Object.assign(new Error("x"), { code: "server_error" })) : realCall(task, input));
  const out = await readExams({ items: [{ doc: textDoc("Prázdna"), name: "Prázdna" }, { doc: textDoc("integrál"), name: "integrál" }], call, retry: { base: 0 } });
  assert.deepEqual(out.failed.map((f) => [f.name, f.code]), [["Prázdna", "no_questions"]]);
  assert.equal(out.exams[0].questions[0].topic, "Neurčitý integrál", "without the sort, the exam's own tags stay");

  const limit = Object.assign(new Error("limit"), { code: "user_limit" });
  const stop = fakeServer({ fail: { exam: (input) => (input.title === "B" ? limit : null) } });
  const r = await readExams({ items: ["A", "B", "C"].map((n) => ({ doc: textDoc(n), name: n })), call: stop.call, retry: { base: 0 } });
  assert.deepEqual(r.exams.map((e) => e.name), ["A"]);
  assert.deepEqual(r.failed.map((f) => [f.name, f.code]), [["B", "user_limit"], ["C", "user_limit"]]);
  assert.ok(!stop.calls.some((c) => c.task === "group"), "nothing more is paid for after a limit");
  await assert.rejects(readExams({ items: [{ doc: textDoc("B"), name: "B" }], call: stop.call }), (e) => e.code === "user_limit");
});

test("group: questions the student tagged and refs the model made up are left alone", async () => {
  const exams = [{ id: "x", name: "A", questions: [{ id: "q1", text: "a", topic: "T1" }, { id: "q2", text: "b", topic: "T2", manual: true }] }];
  const out = await groupExams({ exams, call: async () => [{ name: "N", questions: ["e1#1", "e1#2", "e9#9"] }] });
  assert.deepEqual(out[0].questions.map((q) => q.topic), ["N", "T2"]);
  const none = await groupExams({ exams: [{ id: "x", name: "A", questions: [{ id: "q", text: "a", topic: "T", manual: true }] }], call: () => assert.fail("no call") });
  assert.equal(none[0].questions[0].topic, "T");
});

test("guessYear reads the year from a file name", () => {
  assert.equal(guessYear("skuska_2023.pdf", 2026), 2023);
  assert.equal(guessYear("MAT 2019-01-15.docx", 2026), 2019);
  assert.equal(guessYear("ZS 2022-2023 riadny", 2026), 2023);
  assert.equal(guessYear("IMG_20240611_101500.jpg", 2026), null, "a camera timestamp is not a year on its own");
  assert.equal(guessYear("test 1985 a 3000", 2026), null);
  assert.equal(guessYear("skuska.pdf", 2026), null);
});

// ----- Ranking on the device

const topics = { t1: "Derivácie funkcií", t2: "Limita funkcie", t3: "Integrály", t0: "Ostatné" };
const exam = (id, year, ...tags) => ({ id, name: id, year, questions: tags.map((topic, k) => ({ id: id + k, text: "?", topic, points: 2 })) });

test("ranking: raw counts per exam, newer exams count more, names matched to the subject's topics", () => {
  assert.equal(examWeight(2025, 2025), 1);
  assert.equal(examWeight(2022, 2025), 0.5);
  assert.equal(examWeight(null, 2025), 1);
  assert.equal(matchTopic("limita funkcie", topics), "t2");
  assert.equal(matchTopic("Derivácie", topics), "t1", "a shorter name inside a topic name");
  assert.equal(matchTopic("Lim", topics), null, "too short to match by part");
  assert.equal(matchTopic("Matice", topics), null);

  const exams = [
    exam("a", 2025, "Limita funkcie", "Limita funkcie", "Matice"),
    exam("b", 2024, "Derivácie", "Matice"),
    exam("c", 2016, "Derivácie"),
    exam("d", 2016, "Derivácie"),
  ];
  const r = rankExams(exams, topics);
  assert.deepEqual(r.map((x) => [x.name, x.topic, x.exams, x.of, x.questions.length]), [
    ["Matice", null, 2, 4, 2],
    ["Derivácie funkcií", "t1", 3, 4, 3],
    ["Limita funkcie", "t2", 1, 4, 2],
  ]);
  assert.ok(r[0].score > r[1].score, "two recent exams beat three where two are nine years old");
  assert.equal(r[2].points, 4);
  assert.equal(yearSpan(exams), "2016–2025");
  assert.equal(yearSpan([exam("x", null)]), "");
});

test("ranked round: the most asked topics first, mistakes and unseen before known, a third of the round per topic", () => {
  const ranking = [{ topic: "t2" }, { topic: null }, { topic: "t1" }];
  const qs = [
    ...Array.from({ length: 10 }, (_, k) => ({ id: "l" + k, t: "t2" })),
    ...Array.from({ length: 10 }, (_, k) => ({ id: "d" + k, t: "t1" })),
    { id: "i0", t: "t3" },
  ];
  const p = { l0: { n: 1, c: 1, l: 1 }, l1: { n: 2, c: 0, l: 0 } };
  const round = rankedRound(ranking, qs, p, 9);
  assert.equal(round.length, 9);
  assert.equal(round[0].id, "l1", "a mistake first");
  assert.deepEqual(round.slice(0, 3).map((x) => x.t), ["t2", "t2", "t2"]);
  assert.deepEqual(round.slice(3, 6).map((x) => x.t), ["t1", "t1", "t1"]);
  assert.ok(!round.some((x) => x.t === "t3"), "topics the exams never asked are left out");
  assert.ok(!round.some((x) => x.id === "l0"), "known questions only fill what is left");
  assert.equal(rankedRound(ranking, qs.slice(0, 1), p, 9).length, 1);
});

test("retagging: one question, or a whole topic, gets a new topic and keeps it", () => {
  const exams = [exam("a", 2025, "Matice", "Limita"), exam("b", 2024, "matice")];
  const one = retagQuestion(exams, "a1", "Derivácie funkcií");
  assert.deepEqual(one[0].questions[1], { ...exams[0].questions[1], topic: "Derivácie funkcií", manual: true });
  const all = retagTopic(exams, "Matice", "Integrály", topics);
  assert.deepEqual(all.flatMap((e) => e.questions.map((q) => [q.topic, !!q.manual])), [["Integrály", true], ["Limita", false], ["Integrály", true]]);
  assert.equal(rankExams(all, topics)[0].topic, "t3");
});
