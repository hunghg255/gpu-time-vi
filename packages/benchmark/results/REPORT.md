# gpu-time-vi benchmark

Model `3713154d4dce`, 34553 parameters, 6-bit weights. Measured on 153.0.8010.36 / 11th Gen Intel(R) Core(TM) i5-1145G7 @ 2.60GHz (win32 10.0.19045). Every score below is a development check on generated or hand-authored corpora, not real-user accuracy.

## Size

| Artifact | Bytes | Gzip | Brotli | Budget |
|---|---|---|---|---|
| `packages/core/dist/index.js` | 115828 | 53724 | 46651 | 50000 (within) |
| weights module alone | | | 20559 | |

## Accuracy

| Corpus | Exact | Note |
|---|---|---|
| gold `grammar` | 96.1% (346/360) | exact schedule |
| gold `labels` | 96.5% (331/343) | exact schedule |
| gold `adversarial` | 87.5% (28/32) | exact schedule |
| gold `negatives` | 100.0% (45/45) | exact schedule |
| gold `prose` | 93.3% (42/45) | exact schedule |
| gold `results` (resolved dates) | 100.0% (75/75) | occurrences and rules through the public API |
| generated semantic checks | 99.3% (4964/5000) | schedule-first renderings |
| generated natural frames | 99.5% (995/1000) | training carriers |
| generated reserved frames | 94.4% (944/1000) | carriers never trained on |
| generated bare expressions | 99.7% (997/1000) | no carrier |

## Browser

WebGPU parity: 10000 sequences, 106753 tokens, 0 label mismatches, max error 0.00001239776611328125.

| Library | Init ms | First parse ms | Single p50 ms | 1,000 batch ms | 10,000 batch ms | Agreement with gold |
|---|---|---|---|---|---|---|
| gpu-time-vi-cpu | 86.1 | 38.9 | 0.69 | 342.0 | 4682.6 | 97.2% (70/72) |
| gpu-time-vi-webgpu | 244.3 | 23.6 | 3.76 | 129.1 | 1190.1 | 97.2% (70/72) |
| regex-vi | 12.8 | 0.9 | 0.01 | 8.3 | 49.8 | 11.1% (8/72) |

Dedicated worker per library; ten warmups; 100 single-input samples; fixed repeated four-input batches. Timings cover public parse calls, including gpu-time-vi date resolution and recurrence previews, excluding worker messaging and DOM. regex-vi is a hand-written floor with a fraction of the coverage, so its timings are not comparable feature for feature.
