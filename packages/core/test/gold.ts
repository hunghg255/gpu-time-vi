import { existsSync, readFileSync } from "node:fs";

// Gold corpora are rebuilt in Vietnamese task by task (see
// .agents/plans/gpu-time-vi/todo.md). A corpus that does not exist yet reads as
// empty so the suite that depends on it skips instead of failing.
export const goldPath = (name: string) =>
  `${import.meta.dirname}/../../training/data/gold/${name}.jsonl`;

export function readGold<T>(name: string): T[] {
  const path = goldPath(name);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

// The shipped weights stay English until Task 15 exports a Vietnamese model.
// That export lists LUNAR among its labels; the English one never does.
const report = `${import.meta.dirname}/../../training/active/export-report.json`;
export const vietnameseModel: boolean = existsSync(report)
  ? (JSON.parse(readFileSync(report, "utf8")).labels as string[]).includes(
      "LUNAR",
    )
  : false;
