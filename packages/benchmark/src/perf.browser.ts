import { chromium } from "playwright";
import { createServer } from "vite";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { reference, timeZone } from "./types.ts";
import { join } from "node:path";

const packageRoot = join(import.meta.dirname, "..");
// Dev-only fixture read across packages, as the migration contract allows.
const training = join(packageRoot, "..", "training");

const libraries = ["gpu-time-vi-cpu", "gpu-time-vi-webgpu", "regex-vi"];
const model = JSON.parse(
  await readFile(join(training, "active", "export-report.json"), "utf8"),
).artifactSha256;
const cases = (
  await readFile(join(training, "data", "gold", "results.jsonl"), "utf8")
)
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const server = await createServer({
  configFile: false,
  // Rooted at this package so the served module graph mirrors src/ and bare
  // imports resolve from the benchmark's own node_modules.
  root: packageRoot,
  server: {
    host: "127.0.0.1",
    port: 0,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  logLevel: "error",
  plugins: [
    {
      name: "benchmark-page",
      configureServer(server) {
        server.middlewares.use("/bench.html", (_request, response) => {
          response.setHeader("Content-Type", "text/html");
          response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          response.end("<!doctype html><title>gpu-time-vi benchmark</title>");
        });
      },
    },
  ],
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ timezoneId: timeZone });
const page = await context.newPage();
const results = [];
try {
  await page.goto(server.resolvedUrls!.local[0] + "bench.html");
  for (const library of libraries) {
    console.log(`Benchmarking ${library} in a dedicated Chrome workerâ€¦`);
    const result = await page.evaluate(
      ({ library, cases }) =>
        new Promise<any>((resolve, reject) => {
          const worker = new Worker("/src/worker.ts", { type: "module" });
          const timeout = setTimeout(() => {
            worker.terminate();
            reject(new Error(`${library} exceeded 120 seconds`));
          }, 120_000);
          worker.onmessage = ({ data }) => {
            clearTimeout(timeout);
            worker.terminate();
            resolve(data);
          };
          worker.onerror = (error) => {
            clearTimeout(timeout);
            worker.terminate();
            reject(new Error(error.message));
          };
          worker.postMessage({ library, cases });
        }),
      { library, cases },
    );
    results.push({ library, ...result });
    console.log(result.error ?? JSON.stringify(result.result.single));
  }
  await mkdir(join(packageRoot, "results"), { recursive: true });
  await writeFile(
    join(packageRoot, "results", "browser.json"),
    JSON.stringify(
      {
        model,
        environment: {
          browser: browser.version(),
          cpu: cpus()[0].model,
          platform: platform(),
          osRelease: release(),
          reference,
          timeZone,
        },
        method:
          "Dedicated worker per library; ten warmups; 100 single-input samples; fixed repeated four-input batches. Timings cover public parse calls, including gpu-time-vi date resolution and recurrence previews, excluding worker messaging and DOM. regex-vi is a hand-written floor with a fraction of the coverage, so its timings are not comparable feature for feature.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
}
