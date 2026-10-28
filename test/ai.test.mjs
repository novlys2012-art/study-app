import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { parseSummaryQuiz, parsePastExam, rankTopics } from "../ai/tasks.js";
import { getProvider } from "../ai/index.js";
import { costUsd } from "../ai/prices.js";
import { extract, extractImages, stripRepeated, toSections } from "../scripts/lib/extract.mjs";

test("parseSummaryQuiz keeps valid questions and counts the rest", () => {
  const reply = 'Here:\n{"summary":"- a","questions":[{"q":"Q1","o":["x","y"],"a":1},{"q":"bad","o":["x"],"a":3}]}';
  const out = parseSummaryQuiz(reply);
  assert.equal(out.summary, "- a");
  assert.equal(out.questions.length, 1);
  assert.equal(out.dropped, 1);
  assert.throws(() => parseSummaryQuiz("no json"));
});

test("getProvider picks defaults and rejects unknown or unconfigured providers", () => {
  assert.deepEqual(getProvider({}).models, { fast: "claude-haiku-5-5", strong: "claude-sonnet-5-5" });
  assert.throws(() => getProvider({ AI_PROVIDER: "nope" }), /Unknown AI_PROVIDER/);
  assert.throws(() => getProvider({ AI_PROVIDER: "google" }), /AI_MODEL_FAST/);
  assert.equal(getProvider({ AI_PROVIDER: "google", AI_MODEL_FAST: "m1", AI_MODEL_STRONG: "m2" }).models.fast, "m1");
});

test("costUsd uses the price table", () => {
  assert.equal(costUsd("anthropic", "claude-haiku-5-5", { inputTokens: 1e6, outputTokens: 1e6 }), 0.6);
  assert.equal(costUsd("google", "unknown", { inputTokens: 1, outputTokens: 1 }), null);
});

test("stripRepeated removes footers and page numbers", () => {
  const pages = ["A\nFooter\n1", "B\nFooter\n2", "C\nFooter\n3", "D\nFooter\n4"];
  assert.deepEqual(stripRepeated(pages), ["A", "B", "C", "D"]);
});

test("toSections splits by size and keeps page ranges", () => {
  const secs = toSections(["x".repeat(30), "y".repeat(30), "z".repeat(30)], 15);
  assert.deepEqual(secs.map((s) => [s.from, s.to]), [[1, 1], [2, 2], [3, 3]]);
});

test("extract reads slide text and speaker notes from a PPTX", async () => {
  const zip = new JSZip();
  zip.file("ppt/slides/slide2.xml", "<p:sld><a:p><a:r><a:t>Druhý</a:t></a:r></a:p></p:sld>");
  zip.file("ppt/slides/slide1.xml", "<p:sld><a:p><a:r><a:t>Prvý </a:t></a:r><a:r><a:t>slajd</a:t></a:r></a:p></p:sld>");
  zip.file("ppt/notesSlides/notesSlide1.xml", "<p:notes><a:p><a:r><a:t>Poznámka</a:t></a:r></a:p></p:notes>");
  const path = join(await mkdtemp(join(tmpdir(), "pptx-")), "t.pptx");
  await writeFile(path, await zip.generateAsync({ type: "nodebuffer" }));
  assert.deepEqual(await extract(path), ["Prvý slajd\n[Poznámky] Poznámka", "Druhý"]);
});

test("parsePastExam keeps questions with a topic", () => {
  const out = parsePastExam('{"questions":[{"n":1,"text":"Derivuj x^2","topic":"Derivácie","points":3},{"n":2,"text":"?","topic":""}],"unreadable":""}');
  assert.deepEqual(out.questions, [{ n: "1", text: "Derivuj x^2", topic: "Derivácie", points: 3 }]);
});

test("rankTopics orders by how many exams a topic appears in", () => {
  const q = (topic, points = 0) => ({ topic, points });
  const ranking = rankTopics([
    { questions: [q("Integrály", 5), q("Limity", 2), q("Integrály", 3)] },
    { questions: [q("integrály", 4)] },
  ]);
  assert.deepEqual(ranking.map((r) => [r.topic, r.exams, r.questions, r.points]), [["Integrály", 2, 3, 12], ["Limity", 1, 1, 2]]);
});

test("extractImages returns DOCX pictures in document order and skips icons", async () => {
  const zip = new JSZip();
  const big = Buffer.alloc(6000, 1), icon = Buffer.alloc(100, 1);
  zip.file("word/_rels/document.xml.rels", '<Relationships><Relationship Id="r1" Target="media/b.png"/><Relationship Id="r2" Target="media/a.png"/><Relationship Id="r3" Target="media/i.png"/></Relationships>');
  zip.file("word/document.xml", '<w:document><a:blip r:embed="r1"/><a:blip r:embed="r3"/><a:blip r:embed="r2"/></w:document>');
  zip.file("word/media/a.png", big); zip.file("word/media/b.png", big); zip.file("word/media/i.png", icon);
  const path = join(await mkdtemp(join(tmpdir(), "docx-")), "t.docx");
  await writeFile(path, await zip.generateAsync({ type: "nodebuffer" }));
  assert.deepEqual((await extractImages(path)).map((x) => [x.name, x.mediaType]), [["word/media/b.png", "image/png"], ["word/media/a.png", "image/png"]]);
});
