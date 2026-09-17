import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compile } from "../src/compile.js";
import {
  defaultTimeZone,
  defineParser,
  type ParseContext,
} from "../src/index.js";
import { resolve } from "../src/resolve.js";
import { tokenize } from "../src/tokenizer.js";
import type { Occurrence, Token } from "../src/types.js";
import { promotedModel, readGold } from "./gold.ts";

interface ResultCase {
  id: string;
  text: string;
  context: ParseContext;
  occurrences: Omit<Occurrence, "clause">[];
  rrules?: string[];
  truncated?: boolean;
  error?: string;
}
interface LabelCase {
  text: string;
  tokens: Pick<Token, "label" | "clauseStart" | "start" | "end">[];
}

// results.jsonl is the only corpus with a resolution context and expected
// occurrences. Each text also has hand-written roles in labels.jsonl, so the
// resolver is checked through the oracle path first, and through the model
// once a Vietnamese export ships.
const cases = readGold<ResultCase>("results");
const labels = new Map(readGold<LabelCase>("labels").map((c) => [c.text, c]));

describe.skipIf(!cases.length)("resolved gold through oracle labels", () => {
  it.each(cases)("$id: $text", (example) => {
    const labelled = labels.get(example.text);
    expect(
      labelled,
      `labels.jsonl has no roles for ${example.text}`,
    ).toBeDefined();
    const tokens = tokenize(example.text).map((token, index): Token => ({
      ...token,
      ...labelled!.tokens[index],
      score: 1,
    }));
    const [expression] = compile(example.text, tokens);
    expect(
      expression.schedule,
      JSON.stringify(expression.diagnostics),
    ).not.toBeNull();
    const result = resolve(expression.schedule!, {
      ...example.context,
      timeZone: example.context.timeZone ?? defaultTimeZone,
    });
    expect(result.occurrences.map(({ clause, ...rest }) => rest)).toEqual(
      example.occurrences,
    );
    if (example.rrules) expect(result.rrules).toEqual(example.rrules);
    if (example.truncated !== undefined)
      expect(result.truncated).toBe(example.truncated);
    if (example.error)
      expect(
        result.diagnostics.some((value) => value.code === example.error),
      ).toBe(true);
    else
      expect(
        result.diagnostics.filter((value) => value.severity === "error"),
      ).toEqual([]);
  });
});

describe.skipIf(!cases.length || !promotedModel)(
  "resolved gold through the model",
  () => {
    let parser: Awaited<ReturnType<typeof defineParser>>;
    beforeAll(async () => {
      parser = await defineParser({ backend: "cpu" });
    });
    afterAll(() => parser.dispose());
    it.each(cases)("$id: $text", async (example) => {
      const actual = await parser.parse(example.text, example.context);
      expect(actual.occurrences).toEqual(example.occurrences);
      if (example.rrules) expect(actual.rrules).toEqual(example.rrules);
      if (example.error)
        expect(
          actual.diagnostics.some((value) => value.code === example.error),
        ).toBe(true);
      else
        expect(
          actual.diagnostics.filter((value) => value.severity === "error"),
        ).toEqual([]);
    });
  },
);
