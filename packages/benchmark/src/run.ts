import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const started = performance.now();
const refreshCorpus = process.argv.includes("--refresh-corpus");

const here = import.meta.dirname;
const packageRoot = join(here, "..");
const repoRoot = join(packageRoot, "..", "..");
const training = join(repoRoot, "packages", "training");
const synth = join(training, "data", "synth");
const shell = process.platform === "win32";

function run(command: string, args: string[]) {
  execFileSync(command, args, { stdio: "inherit", cwd: repoRoot, shell });
}
function node(script: string, args: string[] = []) {
  run(process.execPath, ["--experimental-strip-types", script, ...args]);
}
function tsx(script: string, args: string[] = []) {
  run("npx", ["tsx", script, ...args]);
}
function python(script: string, args: string[] = []) {
  run("uv", ["run", "--project", training, "python", script, ...args]);
}

// The build's size gate stays visible; `pnpm size:gate` is the strict command.
run("pnpm", ["--filter", "gpu-time-vi", "run", "build", "--report-only"]);
node(join(here, "evaluate-model.ts"));
node(join(here, "evaluate-results.ts"));
run("pnpm", ["--filter", "gpu-time-vi", "run", "test:browser"]);
for (const [name, flag] of [
  ["natural-evaluation", undefined],
  ["natural-reserved", "--reserved"],
  ["natural-bare", "--bare"],
] as const) {
  const corpus = join(synth, `${name}.jsonl`);
  if (refreshCorpus || !existsSync(corpus))
    python(join(training, "torch", "check-natural.py"), [
      ...(flag ? [flag] : []),
      "--out",
      corpus,
    ]);
  // check-semantic and evaluate-semantic resolve their arguments against the
  // training package, so they take package-relative POSIX paths.
  tsx(join(training, "src", "check-semantic.ts"), [
    `data/synth/${name}.jsonl`,
    `results/${name}-roundtrip.json`,
  ]);
  tsx(join(training, "src", "evaluate-semantic.ts"), [
    `results/${name}.json`,
    `data/synth/${name}.jsonl`,
  ]);
}
if (refreshCorpus || !existsSync(join(synth, "semantic-checks.jsonl")))
  python(join(training, "torch", "generate-semantic.py"));
tsx(join(training, "src", "check-semantic.ts"));
tsx(join(training, "src", "evaluate-semantic.ts"));
node(join(here, "size.ts"));
node(join(here, "perf.browser.ts"));
node(join(here, "report.ts"));
const elapsedSeconds = (performance.now() - started) / 1000;
writeFileSync(
  join(packageRoot, "results", "run.json"),
  JSON.stringify(
    {
      command: "pnpm --filter @gpu-time-vi/benchmark benchmark",
      elapsedSeconds,
      withinTenMinutes: elapsedSeconds < 600,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Benchmark finished in ${elapsedSeconds.toFixed(1)} seconds.`);
