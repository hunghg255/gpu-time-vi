import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Assembles results/REPORT.md from the JSON every step wrote. Every number
// here is read from a results file; none is typed in by hand.
const packageRoot = join(import.meta.dirname, "..");
const resultsDir = join(packageRoot, "results");
const training = join(packageRoot, "..", "training");

const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const local = (name: string) => read(join(resultsDir, `${name}.json`));
const trained = (name: string) =>
  read(join(training, "results", `${name}.json`));

const model = await read(join(training, "active", "export-report.json"));
const [
  browser,
  sizes,
  structure,
  direct,
  gpu,
  semantic,
  natural,
  reserved,
  bare,
] = await Promise.all([
  local("browser"),
  local("size"),
  local("model-structure"),
  local("direct-results"),
  trained("parity-gpu"),
  trained("semantic-evaluation"),
  trained("natural-evaluation"),
  trained("natural-reserved"),
  trained("natural-bare"),
]);
const goldSource = await readFile(
  join(training, "data", "gold", "results.jsonl"),
  "utf8",
);
const gold = goldSource
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

for (const [name, report] of Object.entries({
  browser,
  structure,
  direct,
  gpu,
  semantic,
  natural,
  reserved,
  bare,
}))
  if (report.model !== model.artifactSha256)
    throw new Error(
      `${name} was measured on a different model than the export report.`,
    );

const percent = (correct: number, total: number) =>
  total
    ? `${((100 * correct) / total).toFixed(1)}% (${correct}/${total})`
    : "n/a";
const size = sizes.results[0];
const budget = sizes.budgetBrotliBytes;

interface Output {
  id: string;
  occurrences?: { start: string; end?: string; allDay?: boolean }[];
}

// Agreement with the resolved gold through each browser worker. The worker
// previews 12 occurrences in the default zone, so a gold case counts when its
// occurrences are a prefix of the worker's; cases in another zone are skipped.
function agreement(outputs: Output[]) {
  const comparable = gold.filter(
    (example) =>
      !example.context.timeZone ||
      example.context.timeZone === "Asia/Ho_Chi_Minh",
  );
  let correct = 0;
  for (const example of comparable) {
    const output = outputs.find((value) => value.id === example.id);
    const actual = (output?.occurrences ?? []).map(
      ({ start, end, allDay }) => ({
        start,
        ...(end ? { end } : {}),
        allDay,
      }),
    );
    const expected = example.occurrences as typeof actual;
    const prefix = actual.slice(0, expected.length);
    if (
      JSON.stringify(prefix) === JSON.stringify(expected) &&
      (example.rrules || actual.length === expected.length)
    )
      correct++;
  }
  return percent(correct, comparable.length);
}

const row = (result: any) =>
  result.error
    ? `| ${result.library} | error: ${result.error} | | | | | |`
    : [
        result.library,
        result.result.initializationMs.toFixed(1),
        result.result.firstParseMs.toFixed(1),
        result.result.single.p50Ms.toFixed(2),
        result.result.batches[0].ms.toFixed(1),
        result.result.batches[1].ms.toFixed(1),
        agreement(result.result.outputs),
      ].join(" | ");

const lines = [
  "# gpu-time-vi benchmark",
  "",
  `Model \`${model.artifactSha256.slice(0, 12)}\`, ${model.parameters} parameters, ${model.quantizationBits}-bit weights. Measured on ${browser.environment.browser} / ${browser.environment.cpu} (${browser.environment.platform} ${browser.environment.osRelease}). Every score below is a development check on generated or hand-authored corpora, not real-user accuracy.`,
  "",
  "## Size",
  "",
  "| Artifact | Bytes | Gzip | Brotli | Budget |",
  "|---|---|---|---|---|",
  `| \`packages/core/dist/index.js\` | ${size.bytes} | ${size.gzipBytes} | ${size.brotliBytes} | ${budget} (${size.brotliBytes <= budget ? "within" : "over by " + (size.brotliBytes - budget)}) |`,
  `| weights module alone | | | ${size.weightsBrotliBytes} | |`,
  "",
  "## Accuracy",
  "",
  "| Corpus | Exact | Note |",
  "|---|---|---|",
  ...structure.results.map(
    (set: { name: string; correct: number; total: number }) =>
      `| gold \`${set.name}\` | ${percent(set.correct, set.total)} | exact schedule |`,
  ),
  `| gold \`results\` (resolved dates) | ${percent(direct.correct, direct.total)} | occurrences and rules through the public API |`,
  `| generated semantic checks | ${percent(semantic.correct, semantic.total)} | schedule-first renderings |`,
  `| generated natural frames | ${percent(natural.correct, natural.total)} | training carriers |`,
  `| generated reserved frames | ${percent(reserved.correct, reserved.total)} | carriers never trained on |`,
  `| generated bare expressions | ${percent(bare.correct, bare.total)} | no carrier |`,
  "",
  "## Browser",
  "",
  `WebGPU parity: ${gpu.sequences} sequences, ${gpu.tokensCompared} tokens, ${gpu.labelMismatches} label mismatches, max error ${gpu.maxError}.`,
  "",
  "| Library | Init ms | First parse ms | Single p50 ms | 1,000 batch ms | 10,000 batch ms | Agreement with gold |",
  "|---|---|---|---|---|---|---|",
  ...browser.results.map((result: any) => `| ${row(result)} |`),
  "",
  `${browser.method}`,
  "",
];
await writeFile(join(resultsDir, "REPORT.md"), lines.join("\n"));
console.log(lines.join("\n"));
