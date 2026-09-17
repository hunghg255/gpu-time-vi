import { describe, expect, it } from "vitest";
import { compile } from "../src/compile.js";
import { tokenize } from "../src/tokenizer.js";
import type { Schedule, Token } from "../src/types.js";
import { readGold } from "./gold.ts";

interface OracleCase {
  id: string;
  family: string;
  text: string;
  schedule: Schedule;
  tokens: Pick<Token, "label" | "clauseStart" | "start" | "end">[];
}

// labels.jsonl carries the hand-written roles for every grammar case, so the
// compiler is graded on perfect tags and separated from the model's errors.
const cases = readGold<OracleCase>("labels");
describe.skipIf(!cases.length)("oracle labels", () => {
  it.each(cases)("$id ($family): $text", (example) => {
    const tokens = tokenize(example.text).map(
      (token, index): Token => ({
        ...token,
        ...example.tokens[index],
        score: 1,
      }),
    );
    const expressions = compile(example.text, tokens);
    expect(expressions, "one expression").toHaveLength(1);
    expect(
      expressions[0].schedule,
      JSON.stringify(expressions[0].diagnostics),
    ).toEqual(example.schedule);
    expect(
      expressions[0].diagnostics.filter((value) => value.severity === "error"),
    ).toEqual([]);
  });
});
