import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

test("every UI string key is defined in sk.json, and every sk.json key is used", async () => {
  const sk = JSON.parse(await read("../src/i18n/sk.json"));
  const html = await read("../index.html");
  let code = "";
  for (const dir of ["app", "upload"]) {
    for (const f of await readdir(new URL(`../src/${dir}/`, import.meta.url))) code += await read(`../src/${dir}/${f}`);
  }
  const used = new Set([
    ...[...html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map((m) => m[1]),
    ...[...code.matchAll(/\bt\("([^"]+)"/g)].map((m) => m[1]),
  ]);
  // Keys picked at runtime from a list, e.g. t(k) over ["setup.statSeen", ...] or t(cond ? "a" : "b").
  for (const m of code.matchAll(/"((?:home|subject|setup|quiz|end|upload|study)\.[A-Za-z_.]*[A-Za-z_])"/g)) used.add(m[1]);
  // Keys built from an error code, t("upload.err." + e.code): the prefix is skipped, every key under it counts as used.
  for (const k of Object.keys(sk)) if (k.startsWith("upload.err.")) used.add(k);
  assert.deepEqual([...used].filter((k) => !k.endsWith(".") && !(k in sk)), []);
  assert.deepEqual(Object.keys(sk).filter((k) => !used.has(k)), []);
});

test("cs.json only uses keys that exist in sk.json", async () => {
  const sk = JSON.parse(await read("../src/i18n/sk.json"));
  const cs = JSON.parse(await read("../src/i18n/cs.json"));
  assert.deepEqual(Object.keys(cs).filter((k) => !(k in sk)), []);
});
