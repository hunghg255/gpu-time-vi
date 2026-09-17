# Implementation Plan: gpu-time-vi — Vietnamese natural language → time

## Overview

Xây dựng thư viện `gpu-time-vi`: nhận một chuỗi tiếng Việt tự nhiên ("3 giờ chiều mai", "mỗi thứ hai từ 9h đến 11h", "mùng 1 Tết", "cách đây 2 tuần") và trả về instant/khoảng thời gian/RRULE, chạy inference bằng WebGPU (fallback CPU). Kiến trúc fork từ `example/` (`gpu-time`, parser tiếng Anh): giữ nguyên tagger neural + WGSL kernel + resolver lịch; viết lại toàn bộ lớp ngôn ngữ (tokenizer features, lexicon, compiler, generator dữ liệu huấn luyện, gold corpora) cho tiếng Việt, và thêm module âm lịch.

Tham khảo:
- `example/` — gpu-time (English). Đọc `example/architecture.md`, `example/AGENTS.md`.
- `gpu-lexer-main/` — kiến trúc scan song song WebGPU gốc; gpu-time đã copy layout từ đây.

## Architecture Decisions

1. **Fork, không viết lại từ đầu.** Copy `example/packages/{core,training,benchmark}` vào root, đổi tên gói thành `gpu-time-vi`. Các phần **ngôn ngữ-độc-lập giữ nguyên**: `src/model/*` (cpu.ts, gpu.ts, kernel.wgsl, decode.ts, half.ts, shader-source.ts), `calendar.ts`, `resolve.ts`, `rrule.ts`, `zoned.ts`, `occurrence.ts`, `recurrence.ts`, `exclusions.ts`, `tagger.ts`, `schedule.ts`, `index.ts`, `scripts/build.ts`, `torch/{model,train,export,average,calibrate}.py`, `src/featurize.ts`.
2. **Viết lại lớp ngôn ngữ**: `tokenizer.ts` (character class hỗ trợ chữ Việt có dấu), `lexicon.ts`, `quantity.ts`, `compile.ts`, `labels.ts` (thêm role `LUNAR` vào 1 trong 5 slot reserved → `ROLE_CLASSES` vẫn = 40, **không đổi shader**), `types.ts` (holiday tiếng Việt, `DateSpec.kind = "lunar"`, `DayPart` thêm `"noon"`), toàn bộ `torch/{semantic,natural,background,generate}.py`, gold corpora.
3. **Feature table giữ 580 rows, kernel WGSL giữ nguyên.** Chữ Việt được xử lý ở `characterClass()`: 26 chữ Latin + 7 chữ mở rộng (ă â đ ê ô ơ ư, sau khi bỏ dấu thanh) + 10 chữ số = 43 lớp, còn 21 lớp cho punctuation (vẫn nằm trong 6 bit). Dấu thanh phân biệt qua word-hash (8 bit) và consonant-skeleton hash (7 bit). Input được NFC-normalize trước khi tokenize. Uppercase detect bằng `\p{Lu}`.
4. **Không có teacher ngoài.** chrono-node / Microsoft Recognizers không có tiếng Việt → bỏ toàn bộ harvest pipeline và các baseline so sánh. Nguồn supervision duy nhất là generator + gold corpus viết tay. Đây là điểm khác lớn nhất so với gpu-time và là rủi ro chính về độ chính xác trên text thật.
5. **Âm lịch tính bằng TypeScript sau inference** (giống timezone): thuật toán Hồ Ngọc Đức, múi giờ +7. Model chỉ gán role `LUNAR` cho các marker ("âm lịch", "ÂL", "mùng", "rằm", "Tết"); resolver chuyển sang dương lịch.
6. **`dateOrder` mặc định `DMY`**; `weekStart` mặc định `MO`. **`context.timeZone` mặc định `Asia/Ho_Chi_Minh`** (quyết định 2026-09-17): caller chỉ cần truyền `reference`; vẫn chấp nhận override để test DST ở timezone khác, nhưng tài liệu chỉ nói về `Asia/Ho_Chi_Minh`.
7. **Chỉ hỗ trợ input có dấu** (quyết định 2026-09-17). Input không dấu ("ngay mai 3h chieu") không nằm trong v1; README ghi rõ.
8. **Chấp nhận token tiếng Anh phổ biến trong chat Việt**: `am`, `pm`, `h`, `g`, `p` ("15h30", "3pm", "15g30p"), chữ số. Không hỗ trợ câu tiếng Anh đầy đủ.
9. **Vertical slice theo "oracle path"**: mọi family biểu thức được đưa qua compiler + resolver bằng **gold labels** (không cần model) trước, có test; model huấn luyện sau và được chấm bằng cùng bộ gold. Đây là cách tách lỗi compiler khỏi lỗi model (theo `evaluate:oracle` của gpu-time).

## Label contract (hợp đồng chung giữa gold corpus, compiler, generator)

Phải được chốt ở Task 2 và ghi vào `docs/vietnamese-time-expressions.md`; mọi task sau tuân theo. Bản nháp:

| Biểu thức | Token → role |
|---|---|
| `3 giờ chiều` | 3=HOUR · giờ=GLUE · chiều=MERIDIEM |
| `15h30`, `15g30` | 15=HOUR · h=GLUE · 30=MINUTE |
| `3 rưỡi` / `3 giờ rưỡi` | 3=HOUR · (giờ=GLUE) · rưỡi=CLOCK_OFFSET |
| `3 giờ kém 15` | 3=HOUR · giờ=GLUE · kém=CLOCK_OFFSET · 15=MINUTE |
| `12 giờ trưa`, `12 giờ đêm`, `nửa đêm` | trưa/đêm=MERIDIEM; nửa đêm=TIME_NAMED |
| `sáng mai`, `tối nay`, `chiều hôm qua` | sáng=DAYPART · mai=REL_DAY; hôm qua = REL_DAY REL_DAY |
| `ngày mai`, `ngày kia`, `ngày mốt`, `hôm kia` | tất cả REL_DAY (đa token) |
| `thứ hai`, `T2`, `chủ nhật`, `CN` | tất cả WEEKDAY (đa token) |
| `tuần sau`, `tháng trước`, `năm ngoái`, `tuần này` | tuần=UNIT · sau=DEICTIC (modifier **đứng sau** unit) |
| `thứ hai tuần sau` | WEEKDAY WEEKDAY UNIT DEICTIC |
| `ngày 15 tháng 3 năm 2026` | ngày=GLUE · 15=DOM · tháng=GLUE · 3=MONTH · năm=GLUE · 2026=YEAR |
| `15/3/2026`, `15-3-2026` | theo quy ước numeric-date của gpu-time với `dateOrder=DMY` |
| `tháng giêng`, `tháng chạp`, `tháng tư` | tháng=GLUE · giêng=MONTH |
| `mùng 1 Tết`, `rằm tháng giêng`, `15/8 âm lịch` | mùng=LUNAR · 1=DOM · Tết=HOLIDAY; rằm=LUNAR(=DOM 15); âm lịch=LUNAR LUNAR |
| `sau 2 tiếng`, `2 tiếng nữa` | sau/nữa=DIR_AFTER · 2=NUM · tiếng=UNIT |
| `3 ngày trước`, `cách đây 3 ngày` | trước / cách đây = DIR_BEFORE |
| `trong 2 tiếng`, `trong vòng 3 ngày` | trong (vòng)=DUR |
| `mỗi thứ hai`, `hàng tuần`, `hằng ngày` | mỗi/hàng/hằng=RECUR · tuần=UNIT |
| `2 tuần một lần`, `3 lần một tuần` | NUM UNIT TIMES TIMES / NUM TIMES TIMES UNIT (chốt ở Task 2) |
| `từ 9h đến 17h`, `9h-17h` | từ=RANGE_START · … · đến=RANGE_END; `-`=RANGE_END |
| `từ nay đến cuối tháng`, `cho đến hết tuần` | BOUND_START / BOUND_END |
| `đầu tháng sau`, `cuối tháng`, `giữa tháng` | đầu/cuối/giữa=EDGE · tháng=UNIT |
| `cuối tuần`, `ngày thường`, `ngày làm việc` | DAYGROUP (đa token) |
| `trừ thứ bảy`, `ngoại trừ` | EXCEPT |
| `hai mươi mốt`, `mười lăm`, `năm` (=5) | NUM (đa token); `năm` mơ hồ NUM/UNIT — model học theo ngữ cảnh |
| `lúc`, `vào`, `khoảng`, `tầm` | O / GLUE (khoảng, tầm → approximate) |

Quy tắc daypart → 24h: `sáng` 1–11 giữ nguyên; `trưa` 11–12 giữ, 1 → 13; `chiều` 1–6 → +12; `tối` 6–11 → +12; `đêm` 11 → 23, 12 → 0, 1–4 giữ nguyên. Cửa sổ daypart mặc định của resolver: sáng 06–11, trưa 11–13, chiều 13–18, tối 18–22, đêm 22–05.

## Task List

Chi tiết từng task ở `todo.md`.

### Phase 0: Scaffold
- [x] Task 1: Fork monorepo từ `example/` sang root, đổi tên `gpu-time-vi`, cài đặt, build + test pass với model tiếng Anh tạm
- [x] Task 2: Spec biểu thức tiếng Việt + label contract + gold corpus `grammar.jsonl` (≥150 câu, ≥25 family)

### Checkpoint 0
- [x] `pnpm install && pnpm build:core && pnpm test:core` pass trên bản fork chưa sửa ngôn ngữ
- [ ] `docs/vietnamese-time-expressions.md` được duyệt bởi người dùng trước khi đi tiếp

### Phase 1: Lớp ngôn ngữ, đường oracle (không cần model)
- [x] Task 3: Tokenizer hỗ trợ chữ Việt (NFC, character class 43 lớp, `\p{Lu}`)
- [x] Task 4: Lexicon + labels (`LUNAR`) + types (holiday VN, `lunar` DateSpec, `noon` DayPart) + quantity (đọc số tiếng Việt)
- [x] Task 5: Compiler — giờ/phút, `rưỡi`/`kém`, daypart/meridiem, TIME_NAMED
- [x] Task 6: Compiler — ngày tương đối, thứ, DAYGROUP, unit + deictic đứng sau, EDGE
- [x] Task 7: Compiler — ngày dương lịch (ngày/tháng/năm, DMY numeric, tháng giêng/chạp), khoảng ngày, holiday dương lịch
- [x] Task 8: Compiler — duration, shift, recurrence, TIMES, bounds, exceptions
- [x] Task 9: Module âm lịch `lunar.ts` + resolver cho `lunar` DateSpec và holiday âm lịch
- [x] Task 10: Resolver — daypart windows VN, `results.jsonl` end-to-end, `negatives.jsonl`

### Checkpoint 1: Oracle
- [x] `oracle.test.ts` pass 100% trên `labels.jsonl` (288 câu có nhãn tay)
- [x] `results-gold.test.ts` pass (61 câu)
- [x] `pnpm check` (tsc) sạch; build không lỗi
- [ ] Review với người dùng

### Phase 2: Dữ liệu huấn luyện
- [x] Task 11: `semantic.py` — renderer tiếng Việt cho mọi loại `Schedule`; `check-semantic` pass 100% qua TS compiler
- [x] Task 12: `natural.py` — families tiếng Việt (≥30 families, giữ nhóm RESERVED để đo generalization)
- [x] Task 13: `background.py` — carrier phrases tiếng Việt + fetch Tatoeba `vie`, filter time-words
- [x] Task 14: Hard negatives tiếng Việt (`năm`/`sáu`/`ngày`/`chiều`/`tối`, số điện thoại, giá tiền, "tháng lương") + `test_negatives.py`

### Checkpoint 2: Generator
- [x] `pnpm gen` sinh được splits; `check:natural`, `check:semantic` pass; `pnpm --filter training test` pass
- [x] Manifest + fingerprint split disjoint

### Phase 3: Huấn luyện & tích hợp model
- [x] Task 15: Môi trường training (uv, Python 3.13, torch) + run nhỏ (smoke) → export → `weights.gen.ts` → build → parity fixtures CPU/GPU
- [ ] Task 16: Run đầy đủ, sweep epoch, `scoreboard`, promote; size gate 50 000 byte Brotli

### Checkpoint 3: Model
- [ ] `grammar-model.test.ts` đạt ngưỡng trên `grammar.jsonl`, `prose.jsonl`, `negatives.jsonl` (ngưỡng ghi trong `export-report.json`)
- [ ] `pnpm test:browser` parity CPU/WebGPU pass trên Chrome thật
- [ ] `pnpm size:gate` pass

### Phase 4: Đóng gói
- [x] Task 17: Benchmark package — giữ size + browser perf, bỏ baseline tiếng Anh, thêm baseline regex đơn giản để so sánh
- [x] Task 18: Tài liệu (`README`, `architecture.md`, `MODEL_CARD.md`, `AGENTS.md`), `check:package`, CI workflow
- [x] Task 19: Website demo Astro tiếng Việt

### Checkpoint 4: Complete
- [ ] `pnpm test` toàn bộ pass; `pnpm check:package` pass
- [ ] Sẵn sàng publish `gpu-time-vi@0.1.0`

## Dependency graph

```
T1 scaffold ──────────────┐
T2 spec + grammar.jsonl ──┤  (T1 ∥ T2)
                          ▼
                     T3 tokenizer
                          ▼
              T4 lexicon/labels/types/quantity
        ┌────────┬────────┼────────┬─────────┐
        ▼        ▼        ▼        ▼         ▼
      T5 clock  T6 rel   T7 cal   T8 recur  T9 lunar
        └────────┴────────┴────────┴─────────┘
                          ▼
                    T10 resolver + results gold
                          ▼  CHECKPOINT 1
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        T11 semantic  T12 natural  T13 background
              └───────────┼───────────┘
                          ▼
                    T14 negatives
                          ▼  CHECKPOINT 2
                    T15 smoke train ──► T16 full train
                          ▼  CHECKPOINT 3
              T17 benchmark ∥ T18 docs ∥ T19 website
```

Song song được: T1∥T2; T5∥T6∥T7∥T8∥T9 (mỗi task sở hữu một vùng của `compile.ts` + nhóm id trong `labels.jsonl`, cần chốt contract ở T2 trước); T11∥T12∥T13; T17∥T18∥T19.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Không có teacher tiếng Việt (chrono, Recognizers) → model chỉ học generator, kém trên text thật | High | Gold corpus viết tay ≥300 câu từ chat/lịch thật; nhóm RESERVED carriers trong `natural.py` để đo generalization; thu thập `user-failures.jsonl` sớm và fine-tune với distill |
| Từ đa nghĩa: `năm` (5/năm), `sáu`/`sau`, `ngày` (unit/marker), `chiều`/`tối` (daypart/từ thường), `thứ` (ordinal/weekday), `tư` (4/riêng tư) | High | Hard negatives có chủ đích (T14); tone mark giữ trong word-hash; test cụ thể trong `test_negatives.py` và `negatives.jsonl` |
| `compile.ts` 1762 dòng, viết lại rủi ro lan rộng | High | Chia T5–T8 theo family; mỗi task có oracle tests riêng; giữ cấu trúc và kiểu `Schedule` của gpu-time |
| Character-class 6 bit chật (43 chữ + 21 punct) | Med | Kiểm tra ở T3: nếu thiếu, gộp dấu thanh vào flags thay vì mở rộng bảng; không đổi 580 rows |
| Âm lịch: sai lệch múi giờ (+7 vs +8), tháng nhuận, Tết khác năm | Med | Test `lunar.ts` với bảng ngày Tết/Trung thu/Giỗ tổ 2020–2035 từ nguồn công bố; luôn tính với tz=7 |
| Môi trường train: máy chưa có `uv`, Python 3.14 (torch cần 3.13), có thể không có GPU | Med | `uv python install 3.13`; model 39k tham số train được trên CPU (chậm hơn, vẫn khả thi); smoke run ở T15 trước khi run lớn |
| Tatoeba `vie` nhỏ hơn `eng` nhiều (~ vài chục nghìn câu) | Low | Bổ sung carrier grammar tiếng Việt trong `background.py`; Tatoeba là optional |
| Size gate 50 000 byte Brotli: lexicon tiếng Việt + lunar.ts + compiler mới có thể vượt | Med | Đo ở T15; lunar.ts ~2–3 KB; tinh gọn lexicon (không lặp bảng số) |
| Diacritics NFD từ macOS | Low | NFC normalize ở tokenizer. Input không dấu ngoài phạm vi v1 (đã chốt) |

## Decisions log (Open Questions đã chốt 2026-09-17)

1. **Timezone**: mặc định `Asia/Ho_Chi_Minh`, `context.timeZone` không bắt buộc.
2. **Không dấu**: không hỗ trợ trong v1.
3. **`example/`, `gpu-lexer-main/`**: giữ lại trong repo làm tham khảo, thêm vào `.gitignore`, không xoá.
4. **Quy ước TIMES** cho "2 tuần một lần" / "3 lần một tuần": chốt tại Task 2.
5. **Website demo (T19)**: có trong v1.
