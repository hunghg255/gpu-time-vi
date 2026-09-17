# Third-party notices

`gpu-time-vi` is derived from [gpu-time](https://github.com/arikchakma/gpu-time) by Arik Chakma (MIT): the model architecture, WGSL kernel, resolver, build and training pipeline come from it, rewritten for Vietnamese. The repository structure, documentation layout, and packaging conventions follow [gpu-lexer](https://github.com/vercel-labs/gpu-lexer) by Shu Ding, MIT licensed. No gpu-lexer code or model weights are included.

The `gpu-time-vi` package has **no runtime dependencies**. Everything listed here is a development, benchmark, or website dependency and is not bundled into the package.

The lunar calendar in `packages/core/src/lunar.ts` implements the algorithm published by Hồ Ngọc Đức ([Âm lịch Việt Nam](https://www.informatik.uni-leipzig.de/~duc/amlich/)), which follows the astronomical formulas in Jean Meeus, _Astronomical Algorithms_.

The build uses [esbuild](https://github.com/evanw/esbuild), [terser](https://github.com/terser/terser), [wgslender](https://github.com/marijnh/wgslender), and [TypeScript](https://github.com/microsoft/TypeScript), each under their respective open-source licenses.

Training uses [PyTorch](https://github.com/pytorch/pytorch) and [NumPy](https://github.com/numpy/numpy), pinned in `packages/training/pyproject.toml` and `uv.lock`. Label supervision is produced entirely by this repository's own renderers; no third-party corpus is used to assign labels.

Sentences used as non-temporal surrounding prose come from the [Tatoeba Project](https://tatoeba.org) Vietnamese (`vie`) export, under CC-BY 2.0 FR. The source is pinned by URL and sha256 in `packages/training/data/corpus.json` and fetched with `pnpm --filter @gpu-time-vi/training corpus:fetch`. Downloaded archives and the filtered sentence file are not redistributed here. These sentences supply background text, with every token labeled `O`. The filter removes known time words, spoken numbers and number patterns that resemble dates or times.

Correctness of timezone and calendar arithmetic is cross-checked in tests against [`@js-temporal/polyfill`](https://github.com/js-temporal/temporal-polyfill) and RFC 5545 output against [rrule.js](https://github.com/jkbrzt/rrule). Browser checks use [Playwright](https://github.com/microsoft/playwright) and [Vite](https://github.com/vitejs/vite); unit tests use [Vitest](https://github.com/vitest-dev/vitest); schema validation uses [Ajv](https://github.com/ajv-validator/ajv).

The website is built with [Astro](https://github.com/withastro/astro).
