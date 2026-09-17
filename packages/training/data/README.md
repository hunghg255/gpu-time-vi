# Training data

`data/gold/` holds tracked, authored Vietnamese fixtures. Expected schedules come from the spec in `docs/vietnamese-time-expressions.md`, never from model predictions. These fixtures guide development, so they are not untouched test data. Each file is JSON Lines with an `id`, `text`, and expected `schedule`; a `null` schedule means no time expression is present.

| file             | written by            | read by                                                  | status                  |
| ---------------- | --------------------- | -------------------------------------------------------- | ----------------------- |
| `grammar.jsonl`  | `pnpm seed:grammar`   | `grammar-model.test.ts`, `evaluate-model.ts`             | authored (Task 2)       |
| `labels.jsonl`   | `pnpm seed:labels`    | `oracle.test.ts`, `schema.test.ts`, `evaluate:oracle`    | authored (288)          |
| `results.jsonl`  | by hand               | `results-gold.test.ts`, `evaluate-results.ts`            | authored (61)           |
| `negatives.jsonl`| by hand               | `grammar-model.test.ts`, `schema.test.ts`                | authored (45)           |
| `prose.jsonl`    | `pnpm seed:gold`      | `grammar-model.test.ts`, `schema.test.ts`                | authored (45)           |
| `adversarial.jsonl` | `pnpm seed:gold`   | `grammar-model.test.ts`, `schema.test.ts`                | authored (28)           |
| `oracle-baseline.json` | `pnpm evaluate:oracle` | recorded baseline, not an input                    | 288/288                 |

`grammar.jsonl` is the authored grammar surface: 35 families, one line per surface form. `labels.jsonl` adds per-token labels and clause boundaries so `evaluate:oracle` can run the compiler on perfect tags and separate compiler bugs from model errors. `results.jsonl` is the only corpus with a resolution context and expected occurrences; it checks the resolver end to end with `Asia/Ho_Chi_Minh` as the default zone.

Regenerate the grammar corpus with:

```sh
pnpm --filter @gpu-time-vi/training seed:grammar
```

`data/synth/` is generated, git-ignored, and never hand-edited. It holds the sampled training, validation, and heldout splits per run, plus the independent check corpora and the featurized `.bin` shards that `torch/train.py` reads. Generate the default training data with:

```sh
pnpm --filter @gpu-time-vi/training gen
```

The generator has three tiers: `torch/semantic.py` samples a schedule and renders it (55%), `torch/natural.py` wraps the same renderers in sentence frames with a reserved set kept out of training (25%), and `torch/background.py` writes negatives, forty percent of them hard negatives built on the ambiguous syllables in the spec (20%). `torch/vi.py` holds the shared Vietnamese surface forms. Supervision comes from the renderer's semantic slots, never from the runtime parser, so a `data/synth/` split is only as trustworthy as the generator that produced it. Each split records a `.manifest.json` with the generator's own sha256 and a `.fingerprints.json` of structural signatures, which keeps train/validation/heldout splits disjoint.

`data/prose/` contains downloaded background text and is git-ignored. `sentences.txt` holds filtered Vietnamese sentences from the [Tatoeba](https://tatoeba.org) export (`vie`), one per line; fetch it with `pnpm --filter @gpu-time-vi/training corpus:fetch`. `corpus.json` pins the export URL, license, retrieval date, archive sha256, and every filter parameter. The 2026-09-17 retrieval read 33,179 sentences and kept 11,050 after dropping time-shaped digits (13), odd shapes (1,261), lengths (5,044) and time words (15,641). The file is optional: without it `torch/background.py` uses its own carrier tables. Every borrowed token is labelled `O`, so the filter must drop any sentence with a weekday, month, unit, holiday, relative day, or a number that resembles a date or clock. Tatoeba's sentences are CC-BY 2.0 FR; anything shipped from a model trained on them owes Tatoeba attribution.

There is no external teacher for Vietnamese (chrono-node and Microsoft Recognizers have no `vi` locale), so unlike gpu-time this project has no harvested "real" corpus. Real-user failures are collected by hand into `user-failures.jsonl` as they appear.
