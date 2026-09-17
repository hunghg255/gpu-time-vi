import { expect, it } from "vitest";
import { labelId, Role, type Label } from "../src/labels.js";
import { readDuration, readNumber } from "../src/quantity.js";
import { tokenize } from "../src/tokenizer.js";
import type { PredictionToken as Token } from "../src/types.js";

// "3 ngày" → [NUM, O, UNIT]: whitespace is O, every other token gets its role
// from the parallel list.
function label(text: string, roles: Label[]): Token[] {
  let position = 0;
  return tokenize(text).map((token) => ({
    ...token,
    label: token.kind === 3 ? Role.O : (labelId[roles[position++]] as Role),
    clauseStart: false,
    score: 1,
  }));
}

it("reads digits, decimals and spoken compounds", () => {
  expect(readNumber(label("15", ["NUM"]), 0)).toMatchObject({
    value: 15,
    next: 1,
  });
  expect(readNumber(label("1,5", ["NUM", "GLUE", "NUM"]), 0)).toMatchObject({
    value: 1.5,
    next: 3,
  });
  expect(readNumber(label("2.5", ["NUM", "GLUE", "NUM"]), 0)).toMatchObject({
    value: 2.5,
    next: 3,
  });
  expect(
    readNumber(label("hai mươi mốt", ["NUM", "NUM", "NUM"]), 0),
  ).toMatchObject({ value: 21, next: 5 });
  expect(readNumber(label("mười lăm", ["NUM", "NUM"]), 0)).toMatchObject({
    value: 15,
    next: 3,
  });
  expect(readNumber(label("vài", ["NUM"]), 0)).toMatchObject({
    value: 3,
    approximate: true,
  });
  // Two digit runs are two numbers.
  expect(readNumber(label("15 3", ["NUM", "NUM"]), 0)).toMatchObject({
    value: 15,
    next: 1,
  });
  expect(readNumber(label("giờ", ["UNIT"]), 0).value).toBeNaN();
});

it("reads a duration with a trailing half and chained components", () => {
  expect(readDuration(label("3 ngày", ["NUM", "UNIT"]), 0)).toEqual({
    duration: { amount: 3, unit: "day" },
    next: 3,
  });
  expect(
    readDuration(label("2 tiếng rưỡi", ["NUM", "UNIT", "NUM"]), 0),
  ).toEqual({ duration: { amount: 2.5, unit: "hour" }, next: 5 });
  expect(
    readDuration(label("1 tiếng 30 phút", ["NUM", "UNIT", "NUM", "UNIT"]), 0),
  ).toEqual({
    duration: {
      amount: 1,
      unit: "hour",
      components: [{ amount: 30, unit: "minute" }],
    },
    next: 7,
  });
  expect(
    readDuration(label("hai mươi phút", ["NUM", "NUM", "UNIT"]), 0),
  ).toEqual({ duration: { amount: 20, unit: "minute" }, next: 5 });
  expect(readDuration(label("2 quý", ["NUM", "UNIT"]), 0)).toEqual({
    duration: { amount: 6, unit: "month" },
    next: 3,
  });
  expect(readDuration(label("vài ngày", ["NUM", "UNIT"]), 0)).toEqual({
    duration: { amount: 3, unit: "day" },
    next: 3,
    approximate: true,
  });
});

it("refuses fractions of calendar units and missing units", () => {
  expect(
    readDuration(label("2 ngày rưỡi", ["NUM", "UNIT", "NUM"]), 0),
  ).toBeUndefined();
  expect(readDuration(label("3", ["NUM"]), 0)).toBeUndefined();
  expect(readDuration(label("0 ngày", ["NUM", "UNIT"]), 0)).toBeUndefined();
});
