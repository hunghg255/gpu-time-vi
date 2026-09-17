import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  defineParser,
  type ParseContext,
  type TimeRange,
} from "../src/index.js";
import { readGold } from "./gold.ts";

const cases = readGold<{
  id: string;
  text: string;
  context: ParseContext;
  occurrences: TimeRange[];
  error?: string;
}>("results");
// results.jsonl is authored in Task 10.
describe.skipIf(!cases.length)("resolved gold", () => {
  let parser: Awaited<ReturnType<typeof defineParser>>;
  beforeAll(async () => {
    parser = await defineParser({ backend: "cpu" });
  });
  afterAll(() => parser.dispose());
  it.each(cases)("$id: $text", async (example) => {
    const actual = await parser.parse(example.text, example.context);
    expect(actual.occurrences).toEqual(example.occurrences);
    if (example.error)
      expect(
        actual.diagnostics.some((value) => value.code === example.error),
      ).toBe(true);
    else
      expect(
        actual.diagnostics.filter((value) => value.severity === "error"),
      ).toEqual([]);
  });
});
