import test from "node:test";
import assert from "node:assert/strict";
import { matchSummaryBlock, buildWrongStudyPack } from "../src/app/md.js";

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

test("buildWrongStudyPack groups missed questions by summary file, extracts matched excerpts and relevant key terms", () => {
  const files = [
    {
      name: "Bio_01.pdf",
      title: "Glykolýza",
      summary: "### Úvod\nGlykolýza prebieha v cytoplazme bez kyslíka.\n- Kyselina **mliečna sa tvorí** pri anaeróbnej glykolýze vo svaloch.",
      keyTerms: [
        { term: "Glykolýza", meaning: "Štiepenie glukózy na pyruvát." },
        { term: "Ribozóm", meaning: "Organela syntézy bielkovín." },
      ],
    },
  ];
  const topics = { t1: "Metabolizmus", t2: "Genetika" };
  const wrong = [
    {
      t: "t1",
      q: "Kde vzniká kyselina mliečna?",
      o: ["Pri anaeróbnej glykolýze vo svaloch", "V jadre"],
      a: 0,
      e: "Obnovuje NAD+ bez kyslíka.",
      x: "Šprint.",
      s: "Kyselina mliečna sa tvorí pri anaeróbnej glykolýze vo svaloch (Bio_01.pdf, s. 2)",
    },
    {
      t: "t2",
      q: "Aká je funkcia DNA?",
      o: ["Uchováva genetickú informáciu", "Prenáša kyslík"],
      a: 0,
      e: "Kóduje syntézu bielkovín.",
      x: "",
      s: "",
    },
  ];
  const pack = buildWrongStudyPack(wrong, files, topics);
  assert.equal(pack.fileCount, 1);
  assert.equal(pack.sections.length, 2);
  assert.equal(pack.sections[0].fi, 0);
  assert.equal(pack.sections[0].title, "Glykolýza");
  assert.equal(pack.sections[0].items[0].excerpt, "Kyselina mliečna sa tvorí pri anaeróbnej glykolýze vo svaloch.");
  assert.equal(pack.sections[0].items[0].phrase, "Kyselina mliečna sa tvorí pri anaeróbnej glykolýze vo svaloch");
  assert.equal(pack.sections[1].fi, -1);
  assert.equal(pack.sections[1].title, "Genetika");
  assert.deepEqual(pack.keyTerms.map((k) => k.term), ["Glykolýza"]);
});

test("buildWrongStudyPack formats missed worked problems with answer and steps", () => {
  const files = [{ name: "Stat.pdf", title: "Testy", summary: "- **t-test** porovnáva výberový priemer s hodnotou μ₀.", keyTerms: [] }];
  const wrong = [{
    kind: "problem",
    t: "t1",
    q: "Vypočítaj t-štatistiku pre x̄ = 12, μ₀ = 10, s = 4, n = 16.",
    steps: ["SE = 4 / √16 = 1", "t = (12 - 10) / 1 = 2"],
    ans: "t = 2",
    e: "Delí sa √n, nie n.",
    s: "t-test porovnáva výberový priemer (Stat.pdf, s. 4)",
  }];
  const pack = buildWrongStudyPack(wrong, files, { t1: "Hypotézy" });
  assert.equal(pack.fileCount, 1);
  assert.deepEqual(pack.sections[0].items[0].correct, ["t = 2"]);
  assert.deepEqual(pack.sections[0].items[0].steps, ["SE = 4 / √16 = 1", "t = (12 - 10) / 1 = 2"]);
});
