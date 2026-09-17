import { describe, expect, it } from "vitest";
import { defineParser, resolve } from "../src/schedule.js";
import type { Clause } from "../src/types.js";

import { promotedModel } from "./gold.ts";

// Windows, timezones, date order, whitespace and spans through the model.
describe.skipIf(!promotedModel)("parser model", () => {
  it("preserves every clause when a schedule spans several inference windows", async () => {
    const forms = [
      "thứ hai lúc 9 giờ sáng",
      "thứ ba lúc 10 giờ sáng",
      "thứ tư lúc 11 giờ sáng",
    ];
    const days = ["MO", "TU", "WE"] as const;
    const clauses: Clause[] = Array.from({ length: 40 }, (_, index) => ({
      date: { kind: "weekday", days: [days[index % 3]] },
      time: { start: { hour: 9 + (index % 3), minute: 0 } },
    }));
    const text = clauses.map((_, index) => forms[index % 3]).join(" và ");
    const parser = await defineParser({ backend: "cpu", tokens: true });
    try {
      const result = await parser.parse(text);
      expect(result.tokens!.length).toBeGreaterThan(128);
      expect(result.expressions).toHaveLength(1);
      expect(result.expressions[0].schedule).toEqual({ clauses });
      expect(result.expressions[0].text).toBe(text);
    } finally {
      parser.dispose();
    }
  });

  it("resolves one timezone-free prediction using each caller's timezone", async () => {
    const parser = await defineParser({ backend: "cpu" });
    try {
      const result = await parser.parse("3 giờ chiều mai");
      const schedule = result.expressions[0].schedule!;
      expect(schedule).toEqual({
        clauses: [
          {
            date: { kind: "relativeDay", offset: 1 },
            time: { start: { hour: 15, minute: 0 } },
          },
        ],
      });
      const original = structuredClone(schedule);
      const reference = "2026-09-17T00:30:00+07:00";
      const hanoi = resolve(schedule, {
        reference,
        timeZone: "Asia/Ho_Chi_Minh",
      });
      const newYork = resolve(schedule, {
        reference,
        timeZone: "America/New_York",
      });
      expect(hanoi.occurrences[0].start).toBe("2026-09-18T15:00:00+07:00");
      expect(newYork.occurrences[0].start).toBe("2026-09-17T15:00:00-04:00");
      expect(schedule).toEqual(original);
      expect(() =>
        resolve(schedule, { reference, timeZone: "not-a-zone" }),
      ).toThrow(RangeError);
    } finally {
      parser.dispose();
    }
  });

  it("parses the user's shorthand using trained predictions, not oracle labels", async () => {
    const parser = await defineParser({ backend: "cpu", tokens: true });
    const result = await parser.parse(
      "thứ bảy chủ nhật từ 1 giờ đến 8 giờ tối và thứ hai từ 10 giờ tối đến 12 giờ đêm",
    );
    expect(result.expressions).toHaveLength(1);
    expect(result.expressions[0].schedule).toEqual({
      clauses: [
        {
          date: { kind: "weekday", days: ["SA", "SU"] },
          time: {
            start: { hour: 13, minute: 0 },
            end: { hour: 20, minute: 0 },
          },
        },
        {
          date: { kind: "weekday", days: ["MO"] },
          time: { start: { hour: 22, minute: 0 }, end: { hour: 0, minute: 0 } },
        },
      ],
    });
    const dates = resolve(result.expressions[0].schedule!, {
      reference: "2026-09-17T09:00:00+07:00",
      timeZone: "Asia/Ho_Chi_Minh",
    });
    expect(dates.occurrences.map((occurrence) => occurrence.start)).toEqual([
      "2026-09-19T13:00:00+07:00",
      "2026-09-20T13:00:00+07:00",
      "2026-09-21T22:00:00+07:00",
    ]);
    expect(dates.occurrences[2].end).toBe("2026-09-22T00:00:00+07:00");
    parser.dispose();
  });

  it("passes dateOrder through to AST assembly without changing neural token predictions", async () => {
    const monthFirst = await defineParser({
      backend: "cpu",
      dateOrder: "MDY",
      tokens: true,
    });
    const dayFirst = await defineParser({
      backend: "cpu",
      dateOrder: "DMY",
      tokens: true,
    });
    try {
      const [a, b] = await Promise.all([
        monthFirst.parse("03/04/2026"),
        dayFirst.parse("03/04/2026"),
      ]);
      expect(a.tokens).toEqual(b.tokens);
      expect(a.expressions[0].schedule).toEqual({
        clauses: [{ date: { kind: "calendar", month: 3, day: 4, year: 2026 } }],
      });
      expect(b.expressions[0].schedule).toEqual({
        clauses: [{ date: { kind: "calendar", month: 4, day: 3, year: 2026 } }],
      });
    } finally {
      monthFirst.dispose();
      dayFirst.dispose();
    }
  });

  it("ignores boundary whitespace during inference while preserving every source token", async () => {
    const parser = await defineParser({ backend: "cpu", tokens: true });
    try {
      const source = " \thôm nay\n";
      const plain = await parser.parse("hôm nay");
      const padded = await parser.parse(source);
      expect(padded.expressions[0].schedule).toEqual(
        plain.expressions[0].schedule,
      );
      expect(padded.expressions[0].start).toBe(2);
      expect(padded.expressions[0].end).toBe(9);
      expect(padded.tokens?.map((token) => token.text).join("")).toBe(source);
      expect((await parser.parse(" \n\t")).expressions).toEqual([]);
    } finally {
      parser.dispose();
    }
  });

  it("reports where each resolved expression was read from", async () => {
    const { defineParser: defineResolvingParser } =
      await import("../src/index.js");
    const parser = await defineResolvingParser({ backend: "cpu" });
    const text = "ăn tối lúc 8 giờ ở Nobu";
    const result = await parser.parse(text, {
      reference: "2026-09-17T09:00:00+07:00",
    });
    expect(result.spans).toHaveLength(1);
    const [span] = result.spans;
    expect(span.text).toBe("8 giờ");
    expect(text.slice(span.start, span.end)).toBe(span.text);
    parser.dispose();
  });

  it("omits a span when nothing resolved", async () => {
    const { defineParser: defineResolvingParser } =
      await import("../src/index.js");
    const parser = await defineResolvingParser({ backend: "cpu" });
    const result = await parser.parse("Tom thích ăn cá.", {
      reference: "2026-09-17T09:00:00+07:00",
    });
    expect(result.spans).toEqual([]);
    parser.dispose();
  });
});
