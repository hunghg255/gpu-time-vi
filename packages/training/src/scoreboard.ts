// Scores one built package on every corpus at once, so a gain on one axis
// cannot hide a loss on another. Reads the already-built dist; build first
// (or pass --dist to score a candidate build).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";

const root = resolvePath(join(import.meta.dirname, "..", "..", ".."));
const training = join(root, "packages", "training");
const distIndex = process.argv.indexOf("--dist");
const dist = distIndex >= 0 ? process.argv[distIndex + 1] : undefined;
const label =
  process.argv.find(
    (value, index) =>
      index >= 2 &&
      !value.startsWith("--") &&
      process.argv[index - 1] !== "--dist",
  ) ?? "current";

const run = (file: string, args: string[]) => {
  try {
    // Node itself with the tsx loader: no npx shim, the same on every platform.
    return execFileSync(
      process.execPath,
      ["--import", "tsx", join(root, file), ...args],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  } catch (error) {
    const out = (error as { stdout?: string }).stdout;
    if (out) return out;
    throw error;
  }
};
const distArgs = dist ? ["--dist", dist] : [];

const gold = run("packages/benchmark/src/evaluate-model.ts", distArgs);
const sets: Record<string, number> = {};
for (const line of gold.split("\n")) {
  const found =
    /^(\S+): (\d+)\/(\d+) (?:exact schedules|correct abstentions)/.exec(
      line.trim(),
    );
  if (found) sets[found[1]!] = Number(found[2]);
}
const pooled = Object.values(sets).reduce((total, one) => total + one, 0);

// Generated corpora: the training carriers, the carriers never trained on,
// and bare expressions. Missing files score as NaN rather than zero.
const generated: Record<string, number> = {};
for (const name of [
  "natural-evaluation",
  "natural-reserved",
  "natural-bare",
  "semantic-checks",
]) {
  const corpus = join(training, "data", "synth", `${name}.jsonl`);
  if (!existsSync(corpus)) {
    generated[name] = NaN;
    continue;
  }
  const out = run("packages/training/src/evaluate-semantic.ts", [
    ...distArgs,
    `results/scoreboard-${name}.json`,
    `data/synth/${name}.jsonl`,
  ]);
  const found = /(\d+)\/(\d+)/.exec(out);
  generated[name] = found ? Number(found[1]) : NaN;
}

const board = { label, pooled, ...sets, ...generated };
console.log(JSON.stringify(board));
