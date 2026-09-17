# gpu-time-vi benchmark

Model `a84dea681b36`, 38745 parameters, 6-bit weights. Measured on 153.0.8010.36 / 11th Gen Intel(R) Core(TM) i5-1145G7 @ 2.60GHz (win32 10.0.19045). Every score below is a development check on generated or hand-authored corpora, not real-user accuracy.

## Size

| Artifact | Bytes | Gzip | Brotli | Budget |
|---|---|---|---|---|
| `packages/core/dist/index.js` | 118787 | 56805 | 49543 | 50000 (within) |
| weights module alone | | | 24152 | |

## Accuracy

| Corpus | Exact | Note |
|---|---|---|
| gold `grammar` | 94.8% (294/310) | exact schedule |
| gold `labels` | 95.3% (284/298) | exact schedule |
| gold `adversarial` | 75.0% (21/28) | exact schedule |
| gold `negatives` | 95.6% (43/45) | exact schedule |
| gold `prose` | 86.7% (39/45) | exact schedule |
| gold `results` (resolved dates) | 100.0% (61/61) | occurrences and rules through the public API |
| generated semantic checks | 96.2% (3846/4000) | schedule-first renderings |
| generated natural frames | 96.1% (961/1000) | training carriers |
| generated reserved frames | 95.0% (950/1000) | carriers never trained on |
| generated bare expressions | 98.9% (989/1000) | no carrier |

## Browser

WebGPU parity: 10000 sequences, 107118 tokens, 0 label mismatches, max error 0.0000095367431640625.

| Library | Init ms | First parse ms | Single p50 ms | 1,000 batch ms | 10,000 batch ms | Agreement with gold |
|---|---|---|---|---|---|---|
| gpu-time-vi-cpu | 67.4 | 29.9 | 0.54 | 513.5 | 5206.6 | 96.6% (56/58) |
| gpu-time-vi-webgpu | 239.8 | 16.3 | 4.19 | 155.1 | 1605.7 | 96.6% (56/58) |
| regex-vi | 10.6 | 0.6 | 0.00 | 5.5 | 37.0 | 13.8% (8/58) |

Dedicated worker per library; ten warmups; 100 single-input samples; fixed repeated four-input batches. Timings cover public parse calls, including gpu-time-vi date resolution and recurrence previews, excluding worker messaging and DOM. regex-vi is a hand-written floor with a fraction of the coverage, so its timings are not comparable feature for feature.
