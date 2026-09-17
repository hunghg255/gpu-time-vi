# Architecture

`gpu-time-vi` keeps the architecture of [gpu-time](https://github.com/arikchakma/gpu-time): a CPU tokenizer that writes sparse features, a small bidirectional tagger that runs on CPU or WebGPU, a compiler that turns predicted roles into a typed schedule, and a calendar resolver. Everything that depends on the language was rewritten for Vietnamese; the model shape, the WGSL kernel and the resolver's calendar arithmetic are shared.

## Contract

`parse(text, context)` accepts one string and a caller context of `{ reference, timeZone?, limit? }`, and returns `{ occurrences, rrules, spans, diagnostics, truncated, backend, timings }`. `parseMany(texts, context)` batches several inputs. `defineParser(options)` returns a reusable instance with an explicit `backend`, a `dateOrder` (day first by default) and a `dispose()` method.

`reference` is an ISO instant. `timeZone` is an IANA name and defaults to `Asia/Ho_Chi_Minh`; an unknown zone rejects the call. The caller context never enters the model: timezone, daylight-saving transitions, the reference date, the lunar calendar and expansion limits are all resolved by TypeScript after inference.

## Source preparation

One CPU scan composes the input to NFC (offsets stay on the caller's string) and splits it into letter runs, digit runs, whitespace and single symbols. Vietnamese syllables are separate tokens: `thứ hai` is two, `15h30` is three (`15`, `h`, `30`). Each token gets one sparse feature row: kind, a length bucket, the first and last character class, an 8-bit hash of the lowercased token, a 7-bit hash of its consonant skeleton (every vowel and every mark removed, so `sáu`, `sau` and `sâu` share it while the word hash keeps them apart), flags for casing, position and a clock letter glued to a number (`15h`), the punctuation class on each side, and a number bucket.

Character classes fit six bits: `a-z` (26), the seven extended letters `ă â đ ê ô ơ ư` with the tone removed (7), digits (10) and punctuation (21). Tone marks reach the model only through the hashes. The feature table has 580 rows, as in gpu-time, so the kernel is unchanged. The model has no dictionary; `lexicon.ts` holds every Vietnamese word table, and only the compiler reads it.

## Learned context

The model has 38,745 parameters, two scan layers, int6 weights and f32 intermediates, the same shapes as the promoted gpu-time model. Sparse features are summed into one vector per token, learned affine updates scan the sequence in both directions (the WebGPU kernel evaluates the scans in parallel blocks with exact prefixes), and a classifier produces 40 slots: 36 named roles plus 4 reserved. The roles are gpu-time's 35 plus `LUNAR`, which marks `âm lịch`, `ÂL`, `mùng`, `rằm` and `nhuận`. A boundary score per token cuts the input into independent expressions. Roles are decoded as a linear-chain CRF with Viterbi on the CPU for both backends.

## The role contract

`docs/vietnamese-time-expressions.md` is the contract shared by three parties: the hand-labelled gold corpus, the compiler, and the training generator. A multi-syllable word carries the same role on every syllable (`ngày mai` is `REL_DAY REL_DAY`, `chủ nhật` is `WEEKDAY WEEKDAY`). Function words inside an expression (`giờ` after an hour, `ngày` before a day of the month, `lúc`, `vào`) are `GLUE`. Modifiers follow their unit (`tuần sau`), so `sau` is `DEICTIC` after a unit and `DIR_AFTER` before a quantity. The oracle test in `packages/core/test/oracle.test.ts` runs the compiler on the gold labels alone, which separates compiler bugs from model errors.

## Compilation and resolution

The compiler merges consecutive tokens with the same role into segments and reads them left to right: clocks with `rưỡi`, `kém`, `hơn` and a day part before or after the hour (`3 giờ chiều`, `chiều 3 giờ`, `tối mai 8 giờ`); relative days; weekdays with trailing modifiers and ordinals; edges; calendar and lunar dates in any field order; ranges; shifts with anchors; durations; and recurrence with intervals, times per period, counts, bounds and exceptions. Day parts fold a twelve-hour reading onto the day: `1 giờ trưa` is 13:00, `12 giờ đêm` is 00:00, `11 giờ đêm` is 23:00. Numeric dates read day first unless the caller asks for month first; a year-first date is always year/month/day. `tháng giêng` and `tháng chạp` are lunar months; `tháng 1` and `tháng 12` are solar.

The resolver turns a schedule into instants. Calendar days and weeks preserve wall-clock time across DST; hours and minutes add elapsed time. A month or date range without a year that has fully passed is next year's. `đêm` runs 22:00–05:00 and crosses midnight. Lunar dates and lunar holidays (Tết, giao thừa, rằm tháng giêng, Giỗ tổ, Đoan Ngọ, Vu Lan, Trung thu, ông Táo) convert through `lunar.ts`, an implementation of Hồ Ngọc Đức's algorithm at UTC+7; a lunar date without a year is the next such date on or after the reference. Recurrence produces a bounded preview plus RFC 5545 properties; `đến hết tháng 12` bounds a series through the month's end.

## Model representation

The training exporter writes 6-bit symmetric per-tensor weights to `packages/core/src/model/weights.gen.ts`, hash-verified against `packages/training/active/export-report.json`. The WGSL kernel is specialised at build time and inlined with the weights into the bundle, which must pass the 50,000-byte Brotli release limit. Explicit `backend: "webgpu"` initialises the device at parser creation; automatic mode waits until a batch reaches 32 inputs or 512 tokens.

## Training and supervision

Supervision is generated, never scraped and never taken from the runtime parser. `torch/semantic.py` samples a schedule and renders it in Vietnamese with labelled spans; every rendered span round-trips through the real compiler (`pnpm --filter @gpu-time-vi/training check:semantic`) and must come back as the schedule that was sampled. `torch/natural.py` wraps the same renderers in sentence frames (reminders, meetings, deadlines, travel, availability, series, events, durations, questions, chat) and keeps five frames reserved for the held-out evaluation that measures generalisation to unseen carriers. `torch/background.py` writes carrier prose and negatives; forty percent of the negatives are hard negatives built on the ambiguous syllables of the spec (`năm người`, `chiều cao`, `tối đa`, `đường 3/2`, phone numbers, scores). `torch/vi.py` holds the shared surface forms.

There is no external teacher for Vietnamese: chrono-node and Microsoft Recognizers have no `vi` locale, so the "real English" harvest of gpu-time has no counterpart here. Real-user failures are collected by hand. Borrowed background prose comes from the Tatoeba `vie` export, filtered of every time word, spoken number and time-shaped digit.

Training keeps gpu-time's recipe: fresh samples every epoch, structural fingerprints that keep train, validation and held-out splits disjoint, quantisation-aware training, the CRF objective, and the sequence-level risk term. Export requires the promotion gate (gold sets, reserved carriers, bare expressions, no family regression) unless overridden, and the override is recorded in the report.

## Performance boundaries

WebGPU helps for warm, large or batched inputs. Measured with the smoke model on Chrome 153 (see `packages/benchmark/results/browser.json` for the current numbers), 10,000 inputs took 1.35 s on WebGPU and 8.3 s on CPU in a dedicated worker; a single warm input takes about a millisecond on CPU, where device dispatch and readback would dominate. Tokenisation, inference and resolution are timed separately in the `timings` field.
