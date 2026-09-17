import { beforeEach, expect, it, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn(), writeFile: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const occurrence = { start: "2026-09-17T00:00:00+07:00", allDay: true };
const worker = {
  initializationMs: 10,
  firstParseMs: 5,
  single: { p50Ms: 1 },
  batches: [{ ms: 100 }, { ms: 900 }],
  outputs: [{ id: "result-001", occurrences: [occurrence] }],
};
const basename = (path: unknown) => String(path).split(/[\\/]/).pop() as string;

it.each([40_000, 50_001])(
  "reports the actual release budget for a %i-byte artifact",
  async (bytes) => {
    const artifacts: Record<string, unknown> = {
      "browser.json": {
        model: "same",
        environment: {
          browser: "Chrome",
          cpu: "cpu",
          platform: "win32",
          osRelease: "10",
        },
        method: "method",
        results: [{ library: "gpu-time-vi-cpu", result: worker }],
      },
      "size.json": {
        budgetBrotliBytes: 50_000,
        results: [
          {
            bytes,
            gzipBytes: bytes,
            brotliBytes: bytes,
            weightsBrotliBytes: 1,
          },
        ],
      },
      "model-structure.json": {
        model: "same",
        results: [{ name: "grammar", correct: 1, total: 2 }],
      },
      "export-report.json": {
        artifactSha256: "same",
        parameters: 1,
        quantizationBits: 6,
      },
      "direct-results.json": { model: "same", total: 1, correct: 1 },
      "parity-gpu.json": {
        model: "same",
        sequences: 1,
        tokensCompared: 1,
        labelMismatches: 0,
        maxError: 0,
      },
      "semantic-evaluation.json": { model: "same", total: 1, correct: 1 },
      "natural-evaluation.json": { model: "same", total: 1, correct: 1 },
      "natural-reserved.json": { model: "same", total: 1, correct: 1 },
      "natural-bare.json": { model: "same", total: 1, correct: 1 },
    };
    vi.mocked(readFile).mockImplementation(async (path) => {
      const name = basename(path);
      if (name === "results.jsonl")
        return JSON.stringify({
          id: "result-001",
          context: {},
          occurrences: [occurrence],
        });
      if (!(name in artifacts)) throw new Error(`unexpected read ${name}`);
      return JSON.stringify(artifacts[name]);
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await import("../src/report.ts");
    const report = String(vi.mocked(writeFile).mock.calls[0][1]);
    expect(report).toContain(bytes <= 50_000 ? "within" : "over by 1");
    expect(report).toContain("50.0% (1/2)");
    expect(report).toContain("100.0% (1/1)");
  },
);

it("refuses to mix results from different models", async () => {
  vi.mocked(readFile).mockImplementation(async (path) => {
    const name = basename(path);
    if (name === "export-report.json")
      return JSON.stringify({ artifactSha256: "a" });
    if (name === "results.jsonl") return "";
    return JSON.stringify({
      model: "b",
      results: [],
      environment: {},
      budgetBrotliBytes: 1,
    });
  });
  await expect(import("../src/report.ts")).rejects.toThrow("different model");
});
