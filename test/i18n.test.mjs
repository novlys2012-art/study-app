import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

test("every data-i18n key in index.html has a Slovak string, and the reverse", async () => {
  const html = await read("../index.html");
  const sk = JSON.parse(await read("../src/i18n/sk.json"));
  const used = new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]));
  assert.deepEqual([...used].filter((k) => !(k in sk)), []);
  assert.deepEqual(Object.keys(sk).filter((k) => !used.has(k)), []);
});

test("cs.json only uses keys that exist in sk.json", async () => {
  const sk = JSON.parse(await read("../src/i18n/sk.json"));
  const cs = JSON.parse(await read("../src/i18n/cs.json"));
  assert.deepEqual(Object.keys(cs).filter((k) => !(k in sk)), []);
});
