import { expect, it } from "vitest";
import { lunarMonthLength, lunarToSolar, solarToLunar } from "../src/lunar.js";
import { resolve } from "../src/resolve.js";
import type { Schedule } from "../src/types.js";

// Tết (lunar 1/1) for 2020–2035. Published Vietnamese almanacs agree with
// these; 2030 falls on 2 February in Vietnam (UTC+7) and 3 February in China.
const tet: Record<number, string> = {
  2020: "2020-01-25",
  2021: "2021-02-12",
  2022: "2022-02-01",
  2023: "2023-01-22",
  2024: "2024-02-10",
  2025: "2025-01-29",
  2026: "2026-02-17",
  2027: "2027-02-06",
  2028: "2028-01-26",
  2029: "2029-02-13",
  2030: "2030-02-02",
  2031: "2031-01-23",
  2032: "2032-02-11",
  2033: "2033-01-31",
  2034: "2034-02-19",
  2035: "2035-02-08",
};
const iso = (value: { day: number; month: number; year: number }) =>
  `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;

it("places Tết on the published dates", () => {
  for (const [year, date] of Object.entries(tet))
    expect(iso(lunarToSolar(1, 1, Number(year))!), year).toBe(date);
});

it("places the other lunar festivals", () => {
  expect(iso(lunarToSolar(15, 8, 2024)!)).toBe("2024-09-17");
  expect(iso(lunarToSolar(15, 8, 2025)!)).toBe("2025-10-06");
  expect(iso(lunarToSolar(15, 8, 2026)!)).toBe("2026-09-25");
  expect(iso(lunarToSolar(10, 3, 2025)!)).toBe("2025-04-07");
  expect(iso(lunarToSolar(10, 3, 2026)!)).toBe("2026-04-26");
  expect(iso(lunarToSolar(5, 5, 2026)!)).toBe("2026-06-19");
  expect(iso(lunarToSolar(23, 12, 2025)!)).toBe("2026-02-10");
});

it("knows the leap months of 2023 and 2025", () => {
  expect(iso(lunarToSolar(1, 2, 2023)!)).toBe("2023-02-20");
  expect(iso(lunarToSolar(1, 2, 2023, true)!)).toBe("2023-03-22");
  expect(iso(lunarToSolar(1, 3, 2023)!)).toBe("2023-04-20");
  expect(lunarToSolar(1, 3, 2023, true)).toBeUndefined();
  expect(iso(lunarToSolar(1, 6, 2025, true)!)).toBe("2025-07-25");
  expect(lunarToSolar(1, 6, 2026, true)).toBeUndefined();
  expect(solarToLunar(1, 4, 2023)).toEqual({
    year: 2023,
    month: 2,
    day: 11,
    leap: true,
  });
});

it("round-trips every day of a decade", () => {
  let jd = Date.UTC(2020, 0, 1);
  for (let step = 0; step < 3653; step++, jd += 86_400_000) {
    const date = new Date(jd);
    const lunar = solarToLunar(
      date.getUTCDate(),
      date.getUTCMonth() + 1,
      date.getUTCFullYear(),
    );
    expect(lunar.day, date.toISOString()).toBeGreaterThanOrEqual(1);
    expect(lunar.day, date.toISOString()).toBeLessThanOrEqual(30);
    const back = lunarToSolar(lunar.day, lunar.month, lunar.year, lunar.leap);
    expect(back, date.toISOString()).toEqual({
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
    });
  }
});

it("refuses the 30th of a 29-day month", () => {
  expect(lunarMonthLength(1, 2026)).toBe(30);
  expect(lunarMonthLength(2, 2026)).toBe(29);
  expect(lunarToSolar(30, 2, 2026)).toBeUndefined();
});

const options = {
  reference: "2026-09-17T09:00:00+07:00",
  timeZone: "Asia/Ho_Chi_Minh",
};
const date = (spec: object) =>
  resolve({ clauses: [{ date: spec }] } as Schedule, options).occurrences[0];

it("resolves lunar dates to the next occurrence", () => {
  // 2026-09-17 is lunar 7/8/2026.
  expect(date({ kind: "lunar", month: 1, day: 1 })).toMatchObject({
    start: "2027-02-06T00:00:00+07:00",
    allDay: true,
  });
  expect(date({ kind: "lunar", month: 8, day: 15 })).toMatchObject({
    start: "2026-09-25T00:00:00+07:00",
  });
  expect(date({ kind: "lunar", day: 15 })).toMatchObject({
    start: "2026-09-25T00:00:00+07:00",
  });
  expect(date({ kind: "lunar", day: 1 })).toMatchObject({
    start: "2026-10-10T00:00:00+07:00",
  });
  expect(date({ kind: "lunar", month: 8 })).toMatchObject({
    start: "2027-09-01T00:00:00+07:00",
  });
  expect(date({ kind: "lunar", month: 12, day: 23 })).toMatchObject({
    start: "2027-01-30T00:00:00+07:00",
  });
  expect(date({ kind: "lunar", year: 2027, month: 1, day: 1 })).toMatchObject({
    start: "2027-02-06T00:00:00+07:00",
  });
  expect(date({ kind: "lunar", year: 2027 })).toMatchObject({
    start: "2027-02-06T00:00:00+07:00",
    end: "2028-01-26T00:00:00+07:00",
  });
});

it("resolves lunar holidays and the eve of Tết", () => {
  expect(date({ kind: "holiday", name: "tet" })).toMatchObject({
    start: "2027-02-06T00:00:00+07:00",
  });
  expect(date({ kind: "holiday", name: "tet-eve" })).toMatchObject({
    start: "2027-02-05T00:00:00+07:00",
  });
  expect(date({ kind: "holiday", name: "mid-autumn" })).toMatchObject({
    start: "2026-09-25T00:00:00+07:00",
  });
  expect(date({ kind: "holiday", name: "hung-kings" })).toMatchObject({
    start: "2027-04-16T00:00:00+07:00",
  });
  expect(date({ kind: "holiday", name: "kitchen-gods" })).toMatchObject({
    start: "2027-01-30T00:00:00+07:00",
  });
  expect(date({ kind: "holiday", name: "lantern-festival" })).toMatchObject({
    start: "2027-02-20T00:00:00+07:00",
  });
});

it("resolves a lunar date range inclusively", () => {
  expect(
    date({
      kind: "calendarRange",
      from: { month: 1, day: 1 },
      to: { month: 1, day: 3 },
      lunar: true,
    }),
  ).toMatchObject({
    start: "2027-02-06T00:00:00+07:00",
    end: "2027-02-09T00:00:00+07:00",
  });
});
