import { afterAll, beforeAll, expect, it } from "vitest";
import { defaultTimeZone, defineParser } from "../src/index.js";
import { mentionsTime } from "../src/lexicon.js";
import { readGold } from "./gold.ts";

let parser: Awaited<ReturnType<typeof defineParser>>;
beforeAll(async () => {
  parser = await defineParser({ backend: "cpu" });
});
afterAll(() => parser.dispose());

it("defaults the timezone to Asia/Ho_Chi_Minh and still validates the reference", async () => {
  expect(defaultTimeZone).toBe("Asia/Ho_Chi_Minh");
  const result = await parser.parse("ngày mai", {
    reference: "2026-09-17T09:00:00+07:00",
  });
  expect(result.backend).toBe("cpu");
  for (const occurrence of result.occurrences)
    expect(occurrence.start).toMatch(/\+07:00$/);
  await expect(
    parser.parse("mai", { reference: "not a date" }),
  ).rejects.toThrow();
  await expect(
    parser.parse("mai", {
      reference: "2026-09-17T09:00:00+07:00",
      timeZone: " ",
    }),
  ).rejects.toThrow();
  await expect(
    parser.parse("mai", {
      reference: "2026-09-17T09:00:00+07:00",
      timeZone: "Mars/Olympus",
    }),
  ).rejects.toThrow();
});

it("recognizes time words in every resolved gold text and not in plain prose", () => {
  for (const example of readGold<{ text: string }>("results"))
    expect(mentionsTime(example.text), example.text).toBe(true);
  // Hard negatives are meant to look temporal, so they are not checked here.
  for (const text of [
    "xin chào bạn",
    "hoa đẹp quá",
    "tôi thích ăn phở",
    "cảm ơn anh nhiều",
    "đi làm bằng xe máy",
  ])
    expect(mentionsTime(text), text).toBe(false);
});
