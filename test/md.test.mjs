import test from "node:test";
import assert from "node:assert/strict";
import { matchSummaryBlock } from "../src/app/md.js";

test("matchSummaryBlock prefers exact quote match ignoring case and diacritics", () => {
  const blocks = [
    "Úvod do makroekonómie a základné pojmy.",
    "Ak cena statku rastie, požadované množstvo klesá pri iných nezmenených podmienkach.",
    "Ponuka vyjadruje vzťah medzi cenou a ponúkaným množstvom.",
  ];
  const hit = matchSummaryBlock(blocks, {
    quote: "pozadovane mnozstvo klesa",
    extras: ["Zákon dopytu"],
  });
  assert.deepEqual(hit, { index: 1, phrase: "pozadovane mnozstvo klesa" });
});

test("matchSummaryBlock falls back to weighted stem overlap when paraphrased", () => {
  const blocks = [
    "Elasticita meria citlivosť dopytu na zmenu ceny.",
    "Trhová rovnováha nastáva pri vyrovnaní ponuky a dopytu.",
  ];
  const hit = matchSummaryBlock(blocks, {
    quote: "rovnováha na trhu nastáva keď sa ponuka rovná dopytu",
    extras: ["rovnovážna cena"],
  });
  assert.deepEqual(hit, { index: 1, phrase: "" });
});

test("matchSummaryBlock returns null when no block is related", () => {
  const blocks = ["Úvodná kapitola o bunkovom delení."];
  assert.equal(matchSummaryBlock(blocks, { quote: "kvantová fyzika fotónov" }), null);
});
