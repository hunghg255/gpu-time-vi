import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

// The published bundle as the release gate scores it: gzip level 9, Brotli
// quality 11, weights and shader inlined.
const packageRoot = join(import.meta.dirname, "..");
const shipped = join(packageRoot, "..", "core", "dist", "index.js");
const source = await readFile(shipped);
const weights = JSON.parse(
  await readFile(
    join(packageRoot, "..", "training", "active", "export-report.json"),
    "utf8",
  ),
);
const results = [
  {
    library: "gpu-time-vi",
    bytes: source.byteLength,
    gzipBytes: gzipSync(source, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(source, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
    weightsBrotliBytes: weights.moduleBrotliBytes,
    parameters: weights.parameters,
  },
];
await mkdir(join(packageRoot, "results"), { recursive: true });
await writeFile(
  join(packageRoot, "results", "size.json"),
  JSON.stringify(
    {
      method:
        "Gzip level 9, Brotli quality 11 over packages/core/dist/index.js, the same artifact the 50,000-byte release gate scores. weightsBrotliBytes is the weight module alone, from the export report.",
      budgetBrotliBytes: 50_000,
      results,
    },
    null,
    2,
  ) + "\n",
);
console.table(results);
