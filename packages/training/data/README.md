# Training data

`data/gold/` holds tracked, authored Vietnamese fixtures. Expected schedules come from the spec in `docs/vietnamese-time-expressions.md`, never from model predictions. These fixtures guide development, so they are not untouched test data. Each file is JSON Lines with an `id`, `text`, and expected `schedule`; a `null` schedule means no time expression is present.

| file             | written by            | read by                                                  | status                  |
| ---------------- | --------------------- | -------------------------------------------------------- | ----------------------- |
| `grammar.jsonl`  | `pnpm seed:grammar`   | `grammar-model.test.ts`, `evaluate-model.ts`             | authored (Task 2)       |
| `labels.jsonl`   | by hand               | `oracle.test.ts`, `schema.test.ts`, `evaluate:oracle`    | Tasks 5–9               |
| `results.jsonl`  | by hand               | `results-gold.test.ts`, `evaluate-results.ts`            | Task 10                 |
| `negatives.jsonl`| by hand               | `grammar-model.test.ts`, `schema.test.ts`                | Task 10, 14             |
| `prose.jsonl`    | by hand               | `grammar-model.test.ts`, `schema.test.ts`                | Task 14                 |
| `adversarial.jsonl` | by hand            | `grammar-model.test.ts`, `schema.test.ts`                | Task 14                 |
| `oracle-baseline.json` | `pnpm evaluate:oracle` | recorded baseline, not an input                    | Task 10                 |

`grammar.jsonl` is the authored grammar surface: 35 families, one line per surface form. `labels.jsonl` adds per-token labels and clause boundaries so `evaluate:oracle` can run the compiler on perfect tags and separate compiler bugs from model errors. `results.jsonl` is the only corpus with a resolution context and expected occurrences; it checks the resolver end to end with `Asia/Ho_Chi_Minh` as the default zone.

Regenerate the grammar corpus with:

```sh
pnpm --filter @gpu-time-vi/training seed:grammar
```

`data/synth/` is generated, git-ignored, and never hand-edited. It holds the sampled training, validation, and heldout splits per run, plus the independent check corpora and the featurized `.bin` shards that `torch/train.py` reads. Generate the default training data with:

```sh
pnpm --filter @gpu-time-vi/training gen
```

Supervision comes from the renderer's semantic slots, never from the runtime parser, so a `data/synth/` split is only as trustworthy as the generator that produced it. Each split records a `.manifest.json` with the generator's own sha256 and a `.fingerprints.json` of structural signatures, which keeps train/validation/heldout splits disjoint.

`data/prose/` contains downloaded background text and is git-ignored. `sentences.txt` holds filtered Vietnamese sentences from the [Tatoeba](https://tatoeba.org) export (`vie`), one per line. `corpus.json` pins the export URL, license, retrieval date, archive sha256, and every filter parameter (Task 13). Every borrowed token is labelled `O`, so the filter must drop any sentence with a weekday, month, unit, holiday, relative day, or a number that resembles a date or clock. Tatoeba's sentences are CC-BY 2.0 FR; anything shipped from a model trained on them owes Tatoeba attribution.

There is no external teacher for Vietnamese (chrono-node and Microsoft Recognizers have no `vi` locale), so unlike gpu-time this project has no harvested "real" corpus. Real-user failures are collected by hand into `user-failures.jsonl` as they appear.
