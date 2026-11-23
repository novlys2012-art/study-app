import test from "node:test";
import assert from "node:assert/strict";
import { isProblem, correctAnswers, parseNumericInput, checkNumericAnswer } from "../src/app/problems.js";

test("isProblem and correctAnswers handle both MCQs and worked problems", () => {
  const mcq = { q: "2+2?", o: ["3", "4"], a: 1 };
  const multi = { q: "Párne?", o: ["1", "2", "4"], a: [1, 2] };
  const prob = { kind: "problem", q: "Vypočítaj t", ans: "t = 2,45" };

  assert.equal(isProblem(mcq), false);
  assert.equal(isProblem(prob), true);
  assert.deepEqual(correctAnswers(mcq), ["4"]);
  assert.deepEqual(correctAnswers(multi), ["2", "4"]);
  assert.deepEqual(correctAnswers(prob), ["t = 2,45"]);
  assert.deepEqual(correctAnswers(null), []);
});

test("parseNumericInput normalizes commas, unicode minus, fractions, spaces, units and percent", () => {
  assert.equal(parseNumericInput("2,45"), 2.45);
  assert.equal(parseNumericInput("2.45"), 2.45);
  assert.equal(parseNumericInput("−0,75"), -0.75);
  assert.equal(parseNumericInput("-3/4"), -0.75);
  assert.equal(parseNumericInput("1,5 / 3"), 0.5);
  assert.equal(parseNumericInput("1 250,5 €", "€"), 1250.5);
  assert.equal(parseNumericInput("100 eur"), 100);
  assert.equal(parseNumericInput("9,8 m/s", "m/s"), 9.8);
  assert.equal(parseNumericInput("9,8 m/s^2"), 9.8);
  assert.equal(parseNumericInput("1e-3"), 0.001);
  assert.equal(parseNumericInput("2 + 3"), null);
  assert.equal(parseNumericInput("5%"), 0.05);
  assert.equal(parseNumericInput("5%", "%"), 5);
  assert.equal(parseNumericInput("5", "%"), 5);
  assert.equal(parseNumericInput("1/0"), null);
  assert.equal(parseNumericInput("abc"), null);
  assert.equal(parseNumericInput(""), null);
});

test("checkNumericAnswer respects tolerance and returns null on non-numeric input", () => {
  const spec = { num: 2.45, tol: 0.02, unit: "" };
  assert.equal(checkNumericAnswer("2,45", spec), true);
  assert.equal(checkNumericAnswer("2.47", spec), true);
  assert.equal(checkNumericAnswer("2.48", spec), false);
  assert.equal(checkNumericAnswer("not a number", spec), null);
  assert.equal(checkNumericAnswer("2.45", null), null);
  assert.equal(checkNumericAnswer("5%", { num: 0.05, tol: 0.001, unit: "" }), true);
  assert.equal(checkNumericAnswer("5%", { num: 5, tol: 0.1, unit: "%" }), true);
});
