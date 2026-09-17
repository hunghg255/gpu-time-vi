import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The orchestrator is a straight-line script; this pins the steps it runs so
// a dropped measurement is a visible diff.
it("runs every measurement the report reads", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../src/run.ts"),
    "utf8",
  );
  for (const step of [
    "evaluate-model.ts",
    "evaluate-results.ts",
    "test:browser",
    "check-natural.py",
    "check-semantic.ts",
    "evaluate-semantic.ts",
    "size.ts",
    "perf.browser.ts",
    "report.ts",
  ])
    expect(source).toContain(step);
});
