# gpu-time-vi

A compact neural parser for Vietnamese schedules. One small trained model reads a natural-language time expression and returns concrete dates, time ranges, and RFC 5545 recurrence rules. The public API returns dates and rules without internal token labels or syntax trees.

```sh
pnpm add gpu-time-vi
```

```js
import { parse } from "gpu-time-vi";

const result = await parse("thứ bảy chủ nhật từ 1 giờ đến 8 giờ tối", {
  reference: "2026-09-17T09:00:00+07:00",
});

console.log(result.occurrences);
// Saturday and Sunday: 13:00–20:00
console.log(result.rrules);
console.log(result.diagnostics);
```

`parse(text, context)` and `parseMany(texts, context)` are the convenience entry points. `context` must carry a `reference` instant; `timeZone` defaults to `Asia/Ho_Chi_Minh` and accepts any IANA zone. The result holds `occurrences` (ISO `start`, optional `end`, `allDay`), `rrules`, `truncated`, `diagnostics`, `spans`, the `backend` that ran, and `timings`. Diagnostics report known problems, but model errors can still produce incorrect dates.

Lunar dates (`mùng 1 Tết`, `rằm tháng 7`, `15/8 âm lịch`) resolve with the Vietnamese lunisolar calendar at UTC+7, which differs from the Chinese calendar in some years. Numeric dates read day first (`15/3`); pass `dateOrder: "MDY"` to `defineParser` to change that. Input must carry tone marks.

For a reusable instance or explicit backend selection, use `defineParser({ backend })` and release its GPU resources with `dispose()`:

```js
import { defineParser } from "gpu-time-vi";

const parser = await defineParser({ backend: "webgpu" });
const results = await parser.parseMany(texts, { reference });
parser.dispose();
```

Automatic mode tries WebGPU at 32 inputs or 512 tokens per batch. Smaller batches use the CPU. If WebGPU fails in automatic mode, the parser uses CPU and reports a `fallbackReason`. Explicit `backend: "webgpu"` requests reject on failure. GPU calls reuse the device, pipelines, and weights.

The model can return incorrect dates, even without a diagnostic. Before you use a result, make sure that its dates match the intended schedule. See the project repository for the expression contract, architecture, benchmarks, and model limitations.
