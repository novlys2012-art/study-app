import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { parseSummaryQuiz } from "../ai/tasks.js";
import { getProvider } from "../ai/index.js";
import { costUsd } from "../ai/prices.js";
import { extract, stripRepeated, toSections } from "../scripts/lib/extract.mjs";

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
