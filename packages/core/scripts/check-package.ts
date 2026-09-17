import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const packageRoot = resolve(import.meta.dirname, "..");
const typescriptBin = createRequire(import.meta.url).resolve(
  "typescript/bin/tsc",
);

// npm is npm.cmd on Windows; execFileSync cannot spawn a .cmd without a shell,
// so run npm's own CLI script through this node instead.
const npmCli = join(
  process.execPath,
  "..",
  "node_modules",
  "npm",
  "bin",
  "npm-cli.js",
);
const npm = (args: string[], options: Parameters<typeof execFileSync>[2]) =>
  execFileSync(process.execPath, [npmCli, ...args], options);
// Value checks need a model that passed the promotion gate; a forced export
// still has to ship the right files and declarations.
const report = JSON.parse(
  await readFile(
    join(packageRoot, "..", "training", "active", "export-report.json"),
    "utf8",
  ),
);
const promoted =
  report.promotion?.accepted === true &&
  report.promotion?.criterion !== "explicit-user-override";
const temporary = await mkdtemp(join(tmpdir(), "gpu-time-consumer-"));
try {
  const packed = JSON.parse(
    // --ignore-scripts keeps prepack's build output off stdout, which would
    // otherwise corrupt --json. The caller builds dist/ first.
    npm(
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
      { cwd: packageRoot, encoding: "utf8" },
    ) as string,
  );
  // Assert the exact shipped file list. Emitted declarations can reference a
  // sibling that the prune step removed, which typechecks as `any` for any
  // consumer using skipLibCheck; only a contents check catches that.
  const shipped = packed[0].files.map((entry: { path: string }) => entry.path);
  const expected = [
    "LICENSE",
    "README.md",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/labels.d.ts",
    "dist/resolve.d.ts",
    "dist/schedule.d.ts",
    "dist/schedule.js",
    "dist/size.json",
    "dist/types.d.ts",
    "package.json",
  ];
  const actual = [...shipped].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Package contents changed.\n  expected: ${expected.join(", ")}\n  actual:   ${actual.join(", ")}`,
    );
  }

  await writeFile(
    join(temporary, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  npm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(temporary, packed[0].filename),
    ],
    { cwd: temporary, stdio: "pipe" },
  );
  await writeFile(
    join(temporary, "consumer.ts"),
    `
import { defineParser, type ParseResult } from "gpu-time-vi";
const parser = await defineParser({ backend: "cpu" });
const reference = "2026-09-17T09:00:00+07:00";
const result: ParseResult = await parser.parse("2 ngày nữa", { reference });
if (!Array.isArray(result.occurrences) || !Array.isArray(result.rrules) || !Array.isArray(result.spans)) throw new Error("Packaged parser returned the wrong shape.");
if ("expressions" in result || "tokens" in result) throw new Error("Internal predictions leaked into the public result.");
if (${promoted}) {
  if (result.occurrences[0]?.start !== "2026-09-19T09:00:00+07:00") throw new Error("Packaged parser returned the wrong date.");
  for (const [text, start, end] of [
    ["7 giờ tối mai", "2026-09-18T19:00:00+07:00"],
    ["3 giờ kém 15 chiều", "2026-09-17T14:45:00+07:00"],
    ["trong 1 tiếng rưỡi", "2026-09-17T09:00:00+07:00", "2026-09-17T10:30:00+07:00"],
    ["từ 17/8/2027 2 giờ chiều đến 19/8/2027 2 giờ chiều", "2027-08-17T14:00:00+07:00", "2027-08-19T14:00:00+07:00"],
  ]) {
    const parsed = await parser.parse(text, { reference });
    if (parsed.occurrences.length !== 1 || parsed.occurrences[0].start !== start || parsed.occurrences[0].end !== end || parsed.diagnostics.some(value => value.severity === "error")) throw new Error("Packaged natural-language result differs: " + text + " " + JSON.stringify(parsed.occurrences));
  }
}
parser.dispose();
console.log("Installed package and public declarations passed.");
`,
  );
  execFileSync(
    "node",
    [
      typescriptBin,
      "consumer.ts",
      "--strict",
      "--skipLibCheck",
      "--target",
      "es2022",
      "--module",
      "nodenext",
    ],
    { cwd: temporary, stdio: "inherit" },
  );
  execFileSync("node", ["consumer.js"], { cwd: temporary, stdio: "inherit" });
} finally {
  await rm(temporary, { recursive: true, force: true });
}
