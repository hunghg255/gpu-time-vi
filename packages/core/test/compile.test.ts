import { expect, it } from "vitest";
import { compile } from "../src/compile.js";
import { tokenize } from "../src/tokenizer.js";
import { LABELS, type Label } from "../src/labels.js";
import type { Token } from "../src/types.js";

const short: Record<string, Label> = {
  DB: "DIR_BEFORE",
  DA: "DIR_AFTER",
  RD: "REL_DAY",
  DE: "DEICTIC",
  WD: "WEEKDAY",
  DG: "DAYGROUP",
  MON: "MONTH",
  YR: "YEAR",
  H: "HOUR",
  MIN: "MINUTE",
  MER: "MERIDIEM",
  TN: "TIME_NAMED",
  DP: "DAYPART",
  RS: "RANGE_START",
  RE: "RANGE_END",
  REC: "RECUR",
  TM: "TIMES",
  BS: "BOUND_START",
  BE: "BOUND_END",
  EX: "EXCEPT",
  HOL: "HOLIDAY",
  J: "JOIN",
  G: "GLUE",
  CO: "CLOCK_OFFSET",
  LUN: "LUNAR",
};

/** Label the non-whitespace tokens of `text` with `roles`; "|" starts a clause. */
function label(text: string, roles: string, scores = 1): Token[] {
  const codes = roles.split(/\s+/);
  let position = 0;
  return tokenize(text).map((token) => {
    if (token.kind === 3)
      return { ...token, label: "O" as Label, clauseStart: false, score: 1 };
    const code = codes[position++];
    const name = code.replace(/^\|/, "");
    const value = (short[name] ?? name) as Label;
    if (!LABELS.includes(value)) throw new Error(`Unknown role ${code}`);
    return {
      ...token,
      label: value,
      clauseStart: code.startsWith("|"),
      score: scores,
    };
  });
}
const parse = (text: string, roles: string, options = {}) =>
  compile(text, label(text, roles), options);
const codesOf = (text: string, roles: string) =>
  parse(text, roles)[0].diagnostics.map((value) => value.code);

it("rejects clock components out of range", () => {
  expect(codesOf("27 giờ", "H G")).toContain("invalid-time");
  expect(codesOf("2 giờ 99", "H G MIN")).toContain("invalid-time");
  expect(codesOf("3 giờ kém", "H G CO")).toContain("invalid-time");
  expect(parse("27 giờ", "H G")[0].schedule).toBeNull();
});

it("rejects impossible dates and reads year-first numerics as year/month/day", () => {
  expect(codesOf("32/13", "DOM G MON")).toEqual(
    expect.arrayContaining(["invalid-date"]),
  );
  expect(codesOf("31/4", "DOM G MON")).toContain("invalid-date");
  expect(parse("2026-13-01", "YR G MON G DOM")[0].schedule).toBeNull();
  expect(parse("2026-03-15", "YR G MON G DOM")[0].schedule).toEqual({
    clauses: [{ date: { kind: "calendar", year: 2026, month: 3, day: 15 } }],
  });
});

it("reads ambiguous numeric dates day first unless asked otherwise", () => {
  const dmy = parse("3/4", "DOM G MON")[0].schedule;
  expect(dmy).toEqual({
    clauses: [{ date: { kind: "calendar", month: 4, day: 3 } }],
  });
  const mdy = parse("3/4", "DOM G MON", { dateOrder: "MDY" })[0].schedule;
  expect(mdy).toEqual({
    clauses: [{ date: { kind: "calendar", month: 3, day: 4 } }],
  });
  // An unambiguous day stays a day whatever the order.
  expect(parse("15/3", "DOM G MON", { dateOrder: "MDY" })[0].schedule).toEqual({
    clauses: [{ date: { kind: "calendar", month: 3, day: 15 } }],
  });
});

it("needs a date after a recurrence bound or exception", () => {
  expect(codesOf("mỗi thứ hai đến", "REC WD WD BE")).toContain("invalid-bound");
  expect(codesOf("mỗi ngày trừ", "REC UNIT EX")).toContain("invalid-bound");
});

it("needs a quantity after a bare direction", () => {
  expect(codesOf("sau", "DA")).toContain("invalid-shift");
  expect(codesOf("3 nữa", "NUM DA")).toContain("invalid-quantity");
});

it("has no fixed date for the middle of a year but reads mid-week", () => {
  expect(codesOf("giữa năm", "EDGE UNIT")).toContain("unsupported-edge");
  expect(parse("giữa tuần", "EDGE UNIT")[0].schedule).toEqual({
    clauses: [{ date: { kind: "weekday", days: ["WE"], modifier: "this" } }],
  });
});

it("repeats a lunar day on the solar calendar with a warning", () => {
  const [expression] = parse("mùng 1 hàng tháng", "LUN DOM REC UNIT");
  expect(expression.schedule).toEqual({
    clauses: [
      { recurrence: { freq: "monthly", interval: 1, byMonthDay: [1] } },
    ],
  });
  expect(expression.diagnostics.map((value) => value.code)).toContain(
    "lunar-ignored",
  );
});

it("reads a lunar date range", () => {
  expect(
    parse("từ mùng 1 đến mùng 3 Tết", "RS LUN DOM RE LUN DOM HOL")[0].schedule,
  ).toEqual({
    clauses: [
      {
        date: {
          kind: "calendarRange",
          from: { month: 1, day: 1 },
          to: { month: 1, day: 3 },
          lunar: true,
        },
      },
    ],
  });
});

it("splits two expressions separated by prose and keeps their offsets", () => {
  const text =
    "họp lúc 9h sáng mai và nhớ gọi cho khách hàng trước 5 giờ chiều thứ sáu";
  const expressions = parse(
    text,
    "O O H G MER RD O O O O O O DB H G MER WD WD",
  );
  expect(expressions).toHaveLength(2);
  expect(expressions[0].text).toBe("9h sáng mai");
  expect(expressions[0].schedule).toEqual({
    clauses: [
      {
        date: { kind: "relativeDay", offset: 1 },
        time: { start: { hour: 9, minute: 0 } },
      },
    ],
  });
  expect(expressions[1].text).toBe("trước 5 giờ chiều thứ sáu");
  expect(expressions[1].schedule).toEqual({
    clauses: [
      {
        date: { kind: "weekday", days: ["FR"] },
        time: {
          start: { hour: 0, minute: 0 },
          end: { hour: 17, minute: 0 },
          open: "start",
        },
      },
    ],
  });
});

it("keeps a short aside inside one expression and reports it", () => {
  const [expression] = parse("thứ hai nhé lúc 9h", "WD WD O O H G");
  expect(expression.schedule).toEqual({
    clauses: [
      {
        date: { kind: "weekday", days: ["MO"] },
        time: { start: { hour: 9, minute: 0 } },
      },
    ],
  });
  expect(expression.diagnostics).toEqual([
    expect.objectContaining({ code: "filler-ignored", severity: "warning" }),
  ]);
});

it("flags a low-confidence expression", () => {
  const [expression] = compile("mai", label("mai", "RD", 0.3));
  expect(expression.confidence).toBe(0.3);
  expect(expression.diagnostics.map((value) => value.code)).toContain(
    "low-confidence",
  );
});

it("keeps clause boundaries from the model", () => {
  const [expression] = parse("t2 9h t4 10h", "WD WD H G |WD WD H G");
  expect(expression.schedule?.clauses).toHaveLength(2);
});

it("folds a day part said before the hour onto the clock", () => {
  expect(parse("tối 8h", "MER H G")[0].schedule).toEqual({
    clauses: [{ time: { start: { hour: 20, minute: 0 } } }],
  });
  expect(parse("sáng 12 giờ", "MER H G")[0].schedule).toEqual({
    clauses: [{ time: { start: { hour: 0, minute: 0 } } }],
  });
  expect(parse("đêm 12 giờ", "DP H G")[0].schedule).toEqual({
    clauses: [{ time: { start: { hour: 0, minute: 0 } } }],
  });
});

it("reads an approximate shift from the qualifier before the quantity", () => {
  expect(parse("tầm 3 ngày nữa", "O NUM UNIT DA")[0].schedule).toEqual({
    clauses: [
      {
        shift: {
          amount: 3,
          unit: "day",
          direction: "after",
          approximate: true,
        },
      },
    ],
  });
});
