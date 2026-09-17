import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  dayGroups,
  dayParts,
  holidayNames,
  key,
  lunarWords,
  mentionsTime,
  namedTimes,
  nowWords,
  quantities,
  relativeDays,
} from "../../core/src/lexicon.ts";

// Borrowed Vietnamese prose for background text. Every borrowed token is
// labelled O, so any sentence that could carry a time expression is dropped:
// the lexicon's time words, spoken numbers, and time-shaped digits all go.
const execute = promisify(execFile);
const dataRoot = new URL("../data/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("corpus.json", dataRoot), "utf8"),
);
const { url, language, filter, selection } = manifest.prose;
const downloads = new URL("downloads/", dataRoot);
const prose = new URL("prose/", dataRoot);
const archive = new URL(url.slice(url.lastIndexOf("/") + 1), downloads);
const sentences = new URL("sentences.txt", prose);

const timePhrases = new Set<string>([
  ...filter.additionalTimeWords,
  ...Object.keys(holidayNames),
  ...Object.keys(relativeDays),
  ...Object.keys(dayParts),
  ...Object.keys(dayGroups),
  ...Object.keys(namedTimes),
  ...nowWords,
  ...lunarWords,
  ...Object.keys(quantities),
]);
const longest = Math.max(
  ...[...timePhrases].map((phrase) => phrase.split(" ").length),
);

await Promise.all([
  mkdir(downloads, { recursive: true }),
  mkdir(prose, { recursive: true }),
]);

if (!(await exists(archive))) {
  console.log(`fetch ${url}`);
  await execute("curl", ["-f", "-sS", "-L", url, "-o", fileURLToPath(archive)]);
}

const sha256 = await digest(archive);
if (manifest.prose.sha256 !== sha256) {
  throw new Error(
    `${fileURLToPath(archive)} is sha256 ${sha256}, pinned ${manifest.prose.sha256}. Tatoeba rebuilds the export weekly; re-pin sha256 and retrievedAt in data/corpus.json to accept it.`,
  );
}

const TIME_SHAPED = filter.timeShapedNumberPatterns.map(
  (pattern: string) => new RegExp(pattern, "iu"),
);

const seen = new Set<string>();
const kept: string[] = [];
const dropped = { digits: 0, shape: 0, length: 0, timeWord: 0, duplicate: 0 };
let read = 0;

const decompress = spawn("bunzip2", ["-dc", fileURLToPath(archive)], {
  stdio: ["ignore", "pipe", "inherit"],
});
for await (const line of createInterface({
  input: decompress.stdout,
  crlfDelay: Infinity,
})) {
  const [, lang, raw] = line.split("\t");
  if (lang !== language || !raw) continue;
  const text = raw.normalize("NFC").trim();
  read++;

  if (TIME_SHAPED.some((pattern) => pattern.test(text))) dropped.digits++;
  else if (!/^\p{Lu}[\p{L}\p{M}\d ,.;:'"!?()-]*[.!?]$/u.test(text))
    dropped.shape++;
  else if (!withinLength(text)) dropped.length++;
  else if (hasTimeWord(text)) dropped.timeWord++;
  else if (!seen.add(key(text))) dropped.duplicate++;
  else kept.push(text);
}

const stride = Math.max(1, Math.floor(kept.length / selection.limit));
const selected = kept
  .filter((_, index) => index % stride === 0)
  .slice(0, selection.limit);
await writeFile(sentences, `${selected.join("\n")}\n`);

console.log(`read ${read} sentences`);
for (const [reason, count] of Object.entries(dropped))
  console.log(`  drop ${reason}: ${count}`);
console.log(
  `kept ${kept.length}, wrote ${selected.length} to ${fileURLToPath(sentences)}`,
);

function withinLength(text: string) {
  const words = text.split(" ").length;
  return (
    text.length >= filter.minimumCharacters &&
    text.length <= filter.maximumCharacters &&
    words >= filter.minimumWords &&
    words <= filter.maximumWords
  );
}

function hasTimeWord(text: string) {
  if (mentionsTime(text)) return true;
  const words = key(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
  return words.some((_, index) => {
    for (let length = 1; length <= longest; length++)
      if (timePhrases.has(words.slice(index, index + length).join(" ")))
        return true;
    return false;
  });
}

async function exists(target: URL) {
  return stat(target).then(
    () => true,
    () => false,
  );
}

async function digest(target: URL) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  return hash.digest("hex");
}
