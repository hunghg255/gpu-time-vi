import { expect, it, vi } from "vitest";
import { Role } from "../src/labels.js";
import { createTagger } from "../src/tagger.js";
import { promotedModel } from "./gold.ts";

vi.mock("../src/compile.js", () => {
  throw new Error("The neural runtime must not import AST assembly.");
});
vi.mock("../src/resolve.js", () => {
  throw new Error("The neural runtime must not import date resolution.");
});

it("returns source-aligned predictions without interpreting calendar values", async () => {
  const tagger = await createTagger({ backend: "cpu" });
  try {
    const text = "27 giờ";
    const result = await tagger.tag(text);
    const tokens = result.tokens.map((token) => ({
      text: token.text,
      start: token.start,
      end: token.end,
      label: token.label,
    }));
    // Offsets and tokens come from the tokenizer; only a promoted model is
    // held to the roles, and 27 is still an hour to it, not an error.
    expect(tokens.map(({ label, ...rest }) => rest)).toEqual([
      { text: "27", start: 0, end: 2 },
      { text: " ", start: 2, end: 3 },
      { text: "giờ", start: 3, end: 6 },
    ]);
    if (promotedModel) {
      expect(tokens[0].label).toBe(Role.HOUR);
      expect(tokens[2].label).toBe(Role.GLUE);
    }
    expect(result.unknownLabels).toBe(false);
    expect(result).not.toHaveProperty("expressions");
    expect(result).not.toHaveProperty("schedule");
    expect(result.timings).not.toHaveProperty("compileMs");
  } finally {
    tagger.dispose();
  }
});
