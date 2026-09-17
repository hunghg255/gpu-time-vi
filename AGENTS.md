# Project context

`gpu-time-vi` is a pnpm workspace: a Vietnamese rewrite of [gpu-time](https://github.com/arikchakma/gpu-time), whose layout follows [gpu-lexer](https://github.com/vercel-labs/gpu-lexer). Keep new files consistent with that layout and its kebab-case naming. The two reference checkouts `example/` (gpu-time) and `gpu-lexer-main/` are git-ignored and never imported.

## Layout

- `packages/core` — the publishable `gpu-time-vi` package: tokenizer, lexicon, compiler, lunar calendar, resolver, WGSL kernel, build, and unit tests. It has zero runtime dependencies. Keep it that way.
- `packages/training` — the model pipeline. `torch/` holds Python (a uv project): `vi.py` surface forms, `semantic.py` schedule-first rendering, `natural.py` sentence frames, `background.py` prose and hard negatives, `generate.py`, `train.py`, `export.py`. `src/` holds TypeScript drivers and the gold seed scripts. `data/gold/` tracks evaluation corpora; `data/synth/`, `data/prose/` and `data/downloads/` are generated and git-ignored. `active/` holds the promoted report and parity fixtures. `runs/` and `exports/` stay local.
- `packages/benchmark` — size, browser performance and accuracy of the built `packages/core/dist`, never the source.
- `apps/website` — the public Astro site (Task 19).
- `docs/vietnamese-time-expressions.md` — the role contract shared by the gold corpora, the compiler and the generator. Change it first, then the three parties.
- `.agents/plans/gpu-time-vi/` — the implementation plan and task list.

## Validation

```sh
pnpm install
pnpm test           # core tests, benchmark utilities
pnpm test:training  # generator unit tests (uv, Python 3.13)
pnpm build:core     # emits packages/core/dist
pnpm size:gate      # strict 50,000-byte Brotli release limit
pnpm test:browser   # real WebGPU parity and packaged-shader check (Chrome)
pnpm benchmark      # full benchmark, writes packages/benchmark/results/
```

Node 24 runs TypeScript directly through `--experimental-strip-types`, but `compile.ts` uses a parameter property and the core's internal `.js` specifiers do not strip, so a script that imports `packages/core/src` runs under `tsx` (`npx tsx`, or `node --import tsx`). Always call Python through `uv`. On Windows, spawn `npx` through `shutil.which` (Python) or run `node --import tsx` (TypeScript); Node refuses `.cmd` shims without a shell.

Regenerate the gold corpora with `pnpm --filter @gpu-time-vi/training seed:grammar`, `seed:labels` and `seed:gold`. `labels.jsonl` is the per-token oracle: `pnpm --filter @gpu-time-vi/training evaluate:oracle` must stay at 100%.

## Rules

- Do not lower a release gate. The Brotli budget is 50,000 bytes and `pnpm size:gate` blocks CI.
- Read every score from `packages/training/active/export-report.json` and `packages/benchmark/results/`. Never quote a score from a document or from memory. Generated scores share rendering families with training, so they are not language accuracy. See `MODEL_CARD.md`.
- Score a built package with `packages/training/src/scoreboard.ts` instead of one evaluator at a time. A gain on one axis often hides a loss on another.
- Never train on the runtime parser's own output. Supervision comes from the renderers in `packages/training/torch/`, and `check:semantic` / `check:natural` must round-trip 100% through the compiler before a run.
- There is no external teacher for Vietnamese. Real failures go into `data/gold/user-failures.jsonl` by hand, with the schedule the spec says they should produce.
- Keep `natural.py::RESERVED` unreachable from training. Those frames measure generalisation.
- Carrier text (`background.py`, `natural.py` frames) must not contain unambiguous time words; the import-time assertion in `natural.py` enforces it for frames.
- Keep timezone and the lunar calendar out of the model. Calendar arithmetic has exact answers, so `calendar.ts` and `lunar.ts` resolve them in TypeScript.
- Do not hand-edit `packages/core/src/model/weights.gen.ts`. The training export generates it (LF line endings) and hash-verifies it against `export-report.json`.
- A forced export (`--force`) records its overridden failures in the report; the test suites gate on `promotedModel` (a report that passed the gate) and `vietnameseModel` (a report whose labels include `LUNAR`).
- Input is Vietnamese with tone marks. Do not add unaccented forms to the lexicon or the generator without a decision recorded in the plan.

## Training

Cold start with the shapes the kernel ships:

```sh
uv run --project packages/training python packages/training/torch/train.py \
  --run <name> --storage f32 --feature-rows 580 --layers 2 --transitions \
  --samples 60000 --eval-samples 10000 --epochs 40 \
  --risk-lambda 0.005 --risk-margin 4 --save-epochs
```

Warm runs add `--init runs/<promoted>/best.pt --distill runs/<promoted>/best.pt --distill-alpha 0 --distill-beta 5 --distill-lambda 0.05`. Build the gate corpora with `torch/check-natural.py --reserved` and `--bare`, then export with `torch/export.py --checkpoint runs/<name>/best.pt`; `--save-epochs` keeps every epoch so `scoreboard.ts --dist` can sweep them. On this project's CPU-only machine an epoch of 60,000 rows takes about 85 seconds.
