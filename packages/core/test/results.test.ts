import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineParser } from "../src/index.js";
import { promotedModel } from "./gold.ts";

// Public API behaviour through the shipped model: batching, shared contexts,
// timezones, recurrence previews and diagnostics. Waits for a promoted model.
describe.skipIf(!promotedModel)("public results", () => {
  let parser: Awaited<ReturnType<typeof defineParser>>;
  const context = {
    reference: "2026-09-17T09:00:00+07:00",
    timeZone: "Asia/Ho_Chi_Minh",
  };
  beforeAll(async () => {
    parser = await defineParser({ backend: "cpu" });
  });
  afterAll(() => parser.dispose());

  it("keeps batch results equivalent to individual calls and independently mutable", async () => {
    const texts = ["mỗi thứ sáu", "trưa mai", "27 giờ", "trưa mai"];
    const batch = await parser.parseMany(texts, context);
    const single = await Promise.all(
      texts.map((text) => parser.parse(text, context)),
    );
    for (let index = 0; index < texts.length; index++) {
      expect(batch[index].occurrences).toEqual(single[index].occurrences);
      expect(batch[index].rrules).toEqual(single[index].rrules);
      expect(batch[index].diagnostics).toEqual(single[index].diagnostics);
    }
    batch[1].occurrences[0].start = "changed";
    expect(batch[3].occurrences[0].start).toBe(single[3].occurrences[0].start);
  });

  it("keeps resolution failures local to expressions when sharing a context", async () => {
    const results = await parser.parseMany(["cảm ơn mọi người", "ngày mai"], {
      ...context,
      until: "2020-01-01",
    });
    expect(
      results[0].diagnostics.filter((value) => value.severity === "error"),
    ).toEqual([]);
    expect(
      results[1].diagnostics.some((value) => value.code === "resolution-error"),
    ).toBe(true);
  });

  it("defaults the timezone to Asia/Ho_Chi_Minh but rejects a blank one", async () => {
    const result = await parser.parse("ngày mai", {
      reference: context.reference,
    });
    expect(result.occurrences[0].start).toBe("2026-09-18T00:00:00+07:00");
    await expect(
      Reflect.apply(parser.parse, null, [
        "ngày mai",
        { reference: context.reference, timeZone: "" },
      ]),
    ).rejects.toThrow("timeZone");
  });

  it("returns the requested dates and overnight range directly", async () => {
    const result = await parser.parse(
      "thứ bảy chủ nhật từ 1 giờ đến 8 giờ tối và thứ hai từ 10 giờ tối đến 12 giờ đêm",
      context,
    );
    expect(result.occurrences).toEqual([
      {
        start: "2026-09-19T13:00:00+07:00",
        end: "2026-09-19T20:00:00+07:00",
        allDay: false,
      },
      {
        start: "2026-09-20T13:00:00+07:00",
        end: "2026-09-20T20:00:00+07:00",
        allDay: false,
      },
      {
        start: "2026-09-21T22:00:00+07:00",
        end: "2026-09-22T00:00:00+07:00",
        allDay: false,
      },
    ]);
    expect(result).not.toHaveProperty("expressions");
    expect(result).not.toHaveProperty("tokens");
    expect(result.rrules).toEqual([]);
  });

  it("resolves the same language using the caller's local calendar", async () => {
    const reference = "2026-09-17T00:30:00+07:00";
    const hanoi = await parser.parse("3 giờ chiều mai", {
      reference,
      timeZone: "Asia/Ho_Chi_Minh",
    });
    const newYork = await parser.parse("3 giờ chiều mai", {
      reference,
      timeZone: "America/New_York",
    });
    expect(hanoi.occurrences[0].start).toBe("2026-09-18T15:00:00+07:00");
    expect(newYork.occurrences[0].start).toBe("2026-09-17T15:00:00-04:00");
  });

  it("generates bounded recurrence and calendar rules", async () => {
    const result = await parser.parse("mỗi thứ hai lúc 8 giờ tối", {
      ...context,
      limit: 3,
    });
    expect(result.occurrences.map((value) => value.start)).toEqual([
      "2026-09-21T20:00:00+07:00",
      "2026-09-28T20:00:00+07:00",
      "2026-10-05T20:00:00+07:00",
    ]);
    expect(result.truncated).toBe(true);
    expect(result.rrules[0]).toContain("FREQ=WEEKLY");
  });

  it("returns relative dates and duration windows in a batch", async () => {
    const results = await parser.parseMany(
      ["1 ngày nữa", "trong 2 tiếng"],
      context,
    );
    expect(results[0].occurrences[0].start).toBe("2026-09-18T09:00:00+07:00");
    expect(results[1].occurrences[0]).toMatchObject({
      start: context.reference,
      end: "2026-09-17T11:00:00+07:00",
    });
  });

  it("returns diagnostics instead of dates for invalid clock values", async () => {
    const result = await parser.parse("27 giờ", context);
    expect(result.occurrences).toEqual([]);
    expect(
      result.diagnostics.some((value) => value.code === "invalid-time"),
    ).toBe(true);
  });

  it("flags temporal input that produced no expression and stays quiet otherwise", async () => {
    const missed = await parser.parse("giữa năm", context);
    expect(missed.occurrences).toEqual([]);
    expect(missed.diagnostics.length).toBeGreaterThan(0);
    const prose = await parser.parse("buổi họp kéo dài quá", context);
    expect(prose.occurrences).toEqual([]);
    expect(
      prose.diagnostics.filter((value) => value.severity === "error"),
    ).toEqual([]);
  });
});
