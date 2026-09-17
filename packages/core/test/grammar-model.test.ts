import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineParser } from "../src/schedule.js";
import type { Schedule } from "../src/types.js";
import { promotedModel, readGold } from "./gold.ts";

interface Example {
  id: string;
  text: string;
  schedule: Schedule | null;
}
const examples: Example[] = [
  "adversarial",
  "grammar",
  "negatives",
  "grammar-variations",
  "prose",
].flatMap((name) => readGold<Example>(name));

// The gold corpora are Vietnamese; the shipped model is not until Task 16
// promotes one. Everything below waits for that export.
describe.skipIf(!promotedModel)("gold corpora against the model", () => {
  let parser: Awaited<ReturnType<typeof defineParser>>;
  beforeAll(async () => {
    parser = await defineParser({ backend: "cpu" });
  });
  afterAll(() => parser.dispose());

  // Gold is right, model is behind. Runs under it.fails so a retrain that
  // closes one turns red and the id comes off the list. Recorded against the
  // promoted model (run "warm1", fine-tuned from "full", 2026-09-17): weekday
  // ranges and lists, spelled hours, seconds, "cuối tuần sau", "cn này", a few
  // hard negatives, and sentence-initial capitals.
  const knownGaps = new Set<string>([
    "adversarial-004",
    "adversarial-010",
    "adversarial-017",
    "adversarial-019",
    "grammar-051",
    "grammar-054",
    "grammar-067",
    "grammar-070",
    "grammar-086",
    "grammar-088",
    "grammar-227",
    "grammar-252",
    "grammar-285",
    "grammar-288",
    "grammar-299",
    "grammar-303",
    "negative-037",
    "prose-005",
    "prose-014",
    "prose-015",
    "prose-034",
    "prose-041",
    "prose-045",
  ]);
  const isGap = (example: Example) => knownGaps.has(example.id);

  const check = async (example: Example) => {
    const result = await parser.parse(example.text);
    if (example.schedule === null) {
      expect(result.expressions).toEqual([]);
    } else {
      expect(result.expressions).toHaveLength(1);
      expect(result.expressions[0].schedule).toEqual(example.schedule);
    }
  };

  it.each(examples.filter((example) => !isGap(example)))("$id: $text", check);
  it.fails.each(examples.filter(isGap))("known gap — $id: $text", check);

  it.each([
    ["27 giờ", "invalid-time"],
    ["2026-13-01", "invalid-date"],
    ["mỗi thứ hai cho đến", "invalid-bound"],
  ])("rejects malformed or ambiguous input: %s", async (text, code) => {
    const result = await parser.parse(text);
    expect(result.expressions).toHaveLength(1);
    expect(result.expressions[0].schedule).toBeNull();
    expect(
      result.expressions[0].diagnostics.map((diagnostic) => diagnostic.code),
    ).toContain(code);
  });
});
