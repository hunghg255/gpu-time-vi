# Biểu thức thời gian tiếng Việt — spec và label contract

Tài liệu này là **hợp đồng chung** giữa ba nơi phải đồng ý với nhau: gold corpus (`packages/training/data/gold/*.jsonl`), compiler (`packages/core/src/compile.ts`) và generator huấn luyện (`packages/training/torch/*.py`). Mọi thay đổi quy ước phải sửa ở đây trước.

Kiểu dữ liệu đầu ra là `Schedule` trong `packages/core/src/types.ts` (giữ nguyên từ gpu-time, thêm `lunar`, holiday Việt Nam và daypart `noon`).

## 1. Phạm vi

Hỗ trợ (v1):

- Tiếng Việt **có dấu**, chữ thường hoặc hoa, khoảng trắng tuỳ ý.
- Token tiếng Anh phổ biến trong chat Việt: `am`, `pm`, `h`, `g`, `p` (`15h30`, `3pm`, `15g30p`).
- Số viết bằng chữ số hoặc bằng chữ (`hai mươi mốt`, `mười lăm`, `tư`, `rưỡi`).
- Âm lịch: `mùng`, `rằm`, `âm lịch`/`ÂL`, các ngày lễ âm lịch.
- Múi giờ mặc định `Asia/Ho_Chi_Minh`; ngày kiểu số mặc định **ngày/tháng/năm** (DMY).

Không hỗ trợ (v1): input không dấu (`ngay mai`), câu tiếng Anh đầy đủ, can chi (`năm Bính Ngọ`), giờ theo địa chi (`giờ Tý`), tiết khí.

## 2. Roles

36 nhãn (35 của gpu-time + `LUNAR`), `ROLE_CLASSES` = 40 (4 slot dự phòng). Nhãn gán **cho từng token** của tokenizer; khoảng trắng luôn là `O`.

| Role           | Ý nghĩa                                   | Ví dụ token                                                                                                                                                              |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `O`            | Không thuộc biểu thức thời gian           | `họp`, `nhắc tôi`, `lúc`                                                                                                                                                 |
| `NUM`          | Số lượng / con số chưa gắn vai trò cụ thể | `2` trong `2 tiếng`, `hai`, `mươi`, `mốt`                                                                                                                                |
| `ORD`          | Từ chỉ thứ tự đứng độc lập                | `thứ` trong `thứ hai đầu tiên`, `đầu tiên`, `cuối` (trong `thứ sáu cuối`)                                                                                                |
| `UNIT`         | Đơn vị thời gian                          | `giây`, `phút`, `giờ`/`tiếng` (trong duration), `ngày`, `tuần`, `tháng`, `năm`, `quý`                                                                                    |
| `DIR_BEFORE`   | Dịch lùi                                  | `trước`, `cách đây` (2 token), `trước đây`                                                                                                                               |
| `DIR_AFTER`    | Dịch tới                                  | `sau`, `nữa`, `tới` (trong `2 ngày tới`)                                                                                                                                 |
| `NOW`          | Hiện tại                                  | `bây giờ` (2 token), `hiện tại`, `ngay bây giờ`, `giờ` (khi đứng một mình nghĩa "bây giờ")                                                                               |
| `REL_DAY`      | Ngày tương đối                            | `hôm nay`, `nay`, `ngày mai`, `mai`, `hôm qua`, `ngày kia`, `ngày mốt`, `hôm kia`, `bữa nay`                                                                             |
| `DEICTIC`      | Modifier this/next/last                   | `này`, `sau`, `tới`, `trước`, `rồi`, `ngoái`, `qua`, `kế`, `vừa rồi`                                                                                                     |
| `WEEKDAY`      | Thứ trong tuần (đa token)                 | `thứ hai`, `thứ 2`, `t2`, `T2`, `chủ nhật`, `CN`, `chúa nhật`                                                                                                            |
| `DAYGROUP`     | Nhóm ngày                                 | `cuối tuần`, `ngày thường`, `ngày làm việc`, `ngày trong tuần`                                                                                                           |
| `MONTH`        | Tháng                                     | `3` trong `tháng 3`, `giêng`, `chạp`, `tư` trong `tháng tư`                                                                                                              |
| `DOM`          | Ngày trong tháng                          | `15` trong `ngày 15`, `1` trong `mùng 1`, `rằm` (= ngày 15)                                                                                                              |
| `YEAR`         | Năm                                       | `2026`                                                                                                                                                                   |
| `HOUR`         | Giờ                                       | `3` trong `3 giờ chiều`, `15` trong `15h30`, `ba` trong `ba giờ`                                                                                                         |
| `MINUTE`       | Phút                                      | `30` trong `15h30`, `15` trong `kém 15`                                                                                                                                  |
| `SECOND`       | Giây                                      | `20` trong `10:05:20`                                                                                                                                                    |
| `MERIDIEM`     | Buổi đi kèm giờ (quyết định 12h→24h)      | `sáng`, `trưa`, `chiều`, `tối`, `đêm` khi đứng ngay sau/trước một `HOUR`; `am`, `pm`                                                                                     |
| `TIME_NAMED`   | Giờ có tên                                | `nửa đêm`, `giữa trưa`, `12 giờ đêm` → không, đó là HOUR+MERIDIEM                                                                                                        |
| `DAYPART`      | Buổi đứng độc lập (không gắn giờ)         | `sáng`, `buổi sáng`, `trưa`, `chiều`, `tối`, `đêm`, `khuya`                                                                                                              |
| `RANGE_START`  | Mở khoảng                                 | `từ` (khi có `đến`/`tới` theo sau), `giữa` (trong `giữa 9h và 10h`)                                                                                                      |
| `RANGE_END`    | Đóng khoảng                               | `đến`, `tới`, `-`, `–`, `và` (sau `giữa`)                                                                                                                                |
| `RECUR`        | Dấu hiệu lặp                              | `mỗi`, `hàng`, `hằng`, `cách` (every other), `một`/`mỗi`/`/` trong `3 lần một tuần`                                                                                      |
| `FREQ`         | Tần suất là một từ                        | `định kỳ`? — không dùng; tiếng Việt không có `weekly` một từ. Giữ role để tương thích, generator không sinh                                                              |
| `TIMES`        | Số lần                                    | `lần`                                                                                                                                                                    |
| `BOUND_START`  | Giới hạn đầu của chuỗi lặp                | `bắt đầu từ`, `kể từ`, `từ` (khi có RECUR)                                                                                                                               |
| `BOUND_END`    | Giới hạn cuối                             | `đến hết`, `cho đến`, `tới hết`, `đến` (khi có RECUR)                                                                                                                    |
| `COUNT`        | Số lần xuất hiện của chuỗi                | `lần` trong `mỗi thứ hai, 5 lần`? → hiếm; dùng `TIMES` + ngữ cảnh RECUR                                                                                                  |
| `DUR`          | Dấu hiệu khoảng thời gian                 | `trong`, `trong vòng`, `kéo dài`, `suốt`, `liên tục`                                                                                                                     |
| `EXCEPT`       | Loại trừ                                  | `trừ`, `ngoại trừ`, `không kể`, `trừ ngày`                                                                                                                               |
| `HOLIDAY`      | Ngày lễ                                   | `Tết`, `Giáng sinh`, `Noel`, `Trung thu`, `Quốc khánh`, `Giỗ tổ` (đa token)                                                                                              |
| `JOIN`         | Nối hai mệnh đề độc lập                   | `và`, `,`, `;`, `rồi` (giữa hai lịch)                                                                                                                                    |
| `GLUE`         | Từ chức năng bên trong biểu thức          | `giờ` sau HOUR, `h`, `g`, `p`, `ngày` trước DOM, `tháng` trước MONTH, `năm` trước YEAR, `buổi`, `:`, `/`, `của`, `vào`, `lúc`                                            |
| `EDGE`         | Đầu/giữa/cuối một đơn vị                  | `đầu`, `giữa`, `cuối` (trước UNIT hoặc `tháng X`)                                                                                                                        |
| `CLOCK_OFFSET` | Số học đồng hồ                            | `rưỡi` (+30), `kém` (trừ), `hơn` (cộng, `3 giờ hơn 10`)                                                                                                                  |
| `LUNAR`        | Dấu hiệu âm lịch                          | `âm`, `lịch` (trong `âm lịch`), `ÂL`, `âl`, `mùng`, `mồng`, `rằm` (rằm = LUNAR **và** compiler suy ra DOM 15), `ta` trong `tết ta`? → không, `tết ta` là HOLIDAY HOLIDAY |

Quy tắc nhãn đa token: một cụm từ nhiều tiếng mang **cùng một role trên mọi token** (`ngày mai` = REL_DAY REL_DAY; `chủ nhật` = WEEKDAY WEEKDAY; `cách đây` = DIR_BEFORE DIR_BEFORE). Compiler ghép các token cùng role liền nhau rồi tra lexicon bằng cụm đã ghép (chuẩn hoá chữ thường, một khoảng trắng).

`clauseStart` = `true` tại token đầu tiên của mỗi mệnh đề độc lập (ngưỡng boundary 0.75 như gpu-time). Một câu có thể có nhiều mệnh đề (`thứ hai 9h và thứ tư 10h`).

## 3. Quy tắc giờ và buổi

### 3.1 Cú pháp giờ

| Dạng                                                     | Token → role                  | Kết quả                                                         |
| -------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| `3 giờ`                                                  | 3=HOUR giờ=GLUE               | 03:00 (không có buổi → giữ nguyên số; 1–12 hiểu là 24h theo số) |
| `15 giờ`, `15h`, `15g`                                   | HOUR GLUE                     | 15:00                                                           |
| `15h30`, `15g30`, `15:30`, `15 giờ 30`, `15 giờ 30 phút` | HOUR GLUE MINUTE (GLUE)       | 15:30                                                           |
| `3 rưỡi`, `3 giờ rưỡi`, `3h rưỡi`                        | HOUR (GLUE) CLOCK_OFFSET      | 03:30                                                           |
| `3 giờ kém 15`, `3h kém 15`                              | HOUR GLUE CLOCK_OFFSET MINUTE | 02:45                                                           |
| `3 giờ hơn 10`                                           | HOUR GLUE CLOCK_OFFSET MINUTE | 03:10                                                           |
| `3 giờ 15 phút`                                          | HOUR GLUE MINUTE GLUE         | 03:15                                                           |
| `3pm`, `3 pm`, `3 p.m.`                                  | HOUR MERIDIEM                 | 15:00                                                           |
| `ba giờ`, `mười lăm giờ`                                 | HOUR(+) GLUE                  | 03:00, 15:00                                                    |
| `10:05:20`                                               | HOUR GLUE MINUTE GLUE SECOND  | 10:05:20                                                        |
| `nửa đêm`, `giữa trưa`, `đúng trưa`                      | TIME_NAMED(+)                 | `{named:"midnight"}`, `{named:"noon"}`                          |

`giờ` sau một số là GLUE (đồng hồ). `giờ`/`tiếng` sau một số **có DIR/DUR/RECUR** là UNIT (`2 tiếng nữa`, `mỗi 2 giờ`). Model học phân biệt bằng ngữ cảnh; `tiếng` luôn là UNIT.

### 3.2 Buổi kèm giờ (MERIDIEM → 24h)

Buổi có thể đứng **sau** (`3 giờ chiều`) hoặc **trước** (`chiều 3 giờ`, `sáng 7h`, `tối nay 8h`) giờ. Cả hai đều gán MERIDIEM khi đi kèm HOUR.

| Buổi    | Giờ 12h → 24h                                           |
| ------- | ------------------------------------------------------- |
| `sáng`  | 1–11 → giữ nguyên; 12 → 0 (`12 giờ sáng` = 00:00, hiếm) |
| `trưa`  | 11, 12 → giữ nguyên; 1, 2 → 13, 14                      |
| `chiều` | 1–6 → +12 (13–18); 7 → 19 (chấp nhận)                   |
| `tối`   | 6–11 → +12 (18–23); 12 → 0                              |
| `đêm`   | 11 → 23; 12 → 0; 1–4 → giữ nguyên                       |
| `am`    | như `sáng` (12am → 0)                                   |
| `pm`    | 1–11 → +12; 12 → 12                                     |

Giờ đã ≥ 13 thì buổi không đổi gì (`15h chiều` = 15:00). Mâu thuẫn (`15h sáng`) → diagnostic `meridiem-conflict`, giữ 15:00.

### 3.3 Buổi đứng độc lập (DAYPART)

`sáng`, `buổi sáng`, `sáng mai`, `chiều nay`, `tối thứ sáu`, `đêm`, `khuya` → `{ part }`. Ánh xạ: `sáng`→morning, `trưa`→noon, `chiều`→afternoon, `tối`→evening, `đêm`/`khuya`→night. Cửa sổ mặc định khi resolve: sáng 06–11, trưa 11–13, chiều 13–18, tối 18–22, đêm 22–05 (hôm sau).

`buổi` là GLUE. Thứ tự `DAYPART + REL_DAY` (`sáng mai`) và `REL_DAY + DAYPART` (`mai sáng`, hiếm) đều hợp lệ.

### 3.4 Giờ hành chính (TIME_NAMED có quy ước)

Cụm chỉ giờ làm việc mang một giờ quy ước; cả cụm gán TIME_NAMED (kể cả `giờ`, vốn là UNIT ở chỗ khác, và `đầu`/`cuối`, vốn là EDGE).

| Biểu thức                                                   | Schedule         |
| ----------------------------------------------------------- | ---------------- |
| `giờ hành chính`, `giờ làm việc`                            | time 08:00–17:00 |
| `giờ nghỉ trưa`                                             | time 12:00–13:00 |
| `đầu giờ`, `đầu giờ sáng`                                   | time 08:00       |
| `cuối giờ sáng`                                             | time 11:00       |
| `đầu giờ chiều`                                             | time 13:00       |
| `cuối giờ`, `cuối giờ chiều`, `cuối giờ làm`, `hết giờ làm` | time 17:00       |

`đầu giờ chiều mai` = 13:00 ngày mai. Đây là quy ước văn phòng phổ biến, không phải giờ đo được; app cần giờ khác thì đọc `time.start` và thay.

## 4. Ngày tương đối, thứ, đơn vị + deictic

| Biểu thức                                                                      | Role                                | Schedule                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bây giờ`, `hiện tại`, `ngay bây giờ`, `ngay`, `bây h` (chat)                  | NOW(+)                              | `{kind:"now"}`                                                                                                                                                                    |
| `hôm nay`, `nay`, `bữa nay`, `hnay` (chat)                                     | REL_DAY(+)                          | relativeDay 0                                                                                                                                                                     |
| `ngày mai`, `mai`                                                              | REL_DAY(+)                          | relativeDay 1                                                                                                                                                                     |
| `ngày kia`, `ngày mốt`, `mốt`                                                  | REL_DAY(+)                          | relativeDay 2                                                                                                                                                                     |
| `ngày kìa`                                                                     | REL_DAY(+)                          | relativeDay 3                                                                                                                                                                     |
| `hôm qua`, `hqua` (chat), `qua` (chỉ khi sau DAYPART: `tối qua`)               | REL_DAY(+)                          | relativeDay −1                                                                                                                                                                    |
| `hôm kia`                                                                      | REL_DAY(+)                          | relativeDay −2                                                                                                                                                                    |
| `thứ hai`, `thứ 2`, `t2`, `T2`                                                 | WEEKDAY(+)                          | weekday [MO]                                                                                                                                                                      |
| `chủ nhật`, `CN`, `cn`, `chúa nhật`, `thứ tám`, `thứ 8`, `t8` (lóng)           | WEEKDAY(+)                          | weekday [SU]                                                                                                                                                                      |
| `thứ hai và thứ tư`                                                            | WEEKDAY(+) JOIN WEEKDAY(+)          | weekday [MO, WE] (một clause, `và` nối ngày → JOIN nhưng compiler gộp thành một `days` khi cả hai vế chỉ là WEEKDAY)                                                              |
| `thứ hai tuần sau`                                                             | WEEKDAY(+) UNIT DEICTIC             | weekday [MO] modifier next                                                                                                                                                        |
| `thứ sáu tuần này` / `tuần trước`                                              | …                                   | modifier this / last (`this` = tuần lịch hiện tại, `last` = tuần lịch trước, tuần bắt đầu thứ hai; `thứ ba tuần trước` với mốc thứ năm 17/9 là 8/9, không phải 15/9)              |
| `thứ hai sau`, `thứ hai tới`                                                   | WEEKDAY(+) DEICTIC                  | modifier next                                                                                                                                                                     |
| `tuần sau`, `tuần tới`, `tuần kế`                                              | UNIT DEICTIC                        | relativeUnit week next                                                                                                                                                            |
| `tuần này`                                                                     | UNIT DEICTIC                        | relativeUnit week this                                                                                                                                                            |
| `tuần trước`, `tuần rồi`, `tuần qua`, `tuần vừa rồi`                           | UNIT DEICTIC(+)                     | relativeUnit week last                                                                                                                                                            |
| `tháng sau`, `tháng tới`, `tháng trước`, `tháng này`                           | UNIT DEICTIC                        | relativeUnit month …                                                                                                                                                              |
| `tuần sau nữa`, `tháng trước nữa`, `thứ hai tuần sau nữa`, `cuối tuần sau nữa` | UNIT DEICTIC DEICTIC(`nữa`)         | … modifier next/last, `distance: 2` (bước thêm một đơn vị cùng chiều; `nữa` sau DEICTIC là DEICTIC, sau NUM UNIT vẫn là DIR_AFTER)                                                |
| `năm sau`, `năm tới`, `năm ngoái`, `năm nay`, `năm trước`                      | UNIT DEICTIC                        | relativeUnit year … (`nay` với `năm` = this)                                                                                                                                      |
| `đầu tuần sau`, `cuối tháng này`, `giữa năm`                                   | EDGE UNIT DEICTIC                   | relativeUnit … edge start/end (`giữa` → không có edge trong types; ghi diagnostic `unsupported-edge` và dùng `start`? → **Quyết định:** `giữa` chỉ hỗ trợ với `tháng X`: ngày 15) |
| `cuối tuần`, `weekend`                                                         | DAYGROUP(+)                         | dayGroup weekend                                                                                                                                                                  |
| `cuối tuần này/sau/trước`                                                      | DAYGROUP DAYGROUP DEICTIC           | dayGroup weekend modifier                                                                                                                                                         |
| `ngày thường`, `ngày làm việc`, `ngày trong tuần`                              | DAYGROUP(+)                         | recurrence weekly byDay MO–FR (giống `weekdays`)                                                                                                                                  |
| `các ngày cuối tuần`, `cuối tuần` (số nhiều theo ngữ cảnh RECUR)               | RECUR DAYGROUP(+)                   | recurrence weekly byDay SA,SU                                                                                                                                                     |
| `thứ hai đầu tiên của tháng sau`                                               | WEEKDAY(+) ORD(+) GLUE UNIT DEICTIC | ordinalWeekday 1 MO of relativeUnit month next                                                                                                                                    |
| `thứ sáu cuối cùng tháng 3`                                                    | WEEKDAY(+) ORD(+) GLUE MONTH        | ordinalWeekday −1 FR of calendar month 3                                                                                                                                          |

Modifier: `sau`/`tới`/`kế`/`kế tiếp` → next; `này`/`nay` → this; `trước`/`trc`/`rồi`/`qua`/`ngoái`/`vừa rồi`/`vừa qua` → last. `trc` là dạng chat của `trước` ở mọi vị trí (`tuần trc`, `3 ngày trc`).

Lưu ý mơ hồ: `sau` vừa là DEICTIC (`tuần sau`) vừa là DIR_AFTER (`sau 2 tuần`). Quy tắc: `sau` **đứng trước** NUM UNIT → DIR_AFTER; `sau` **đứng sau** UNIT (không có NUM trước UNIT) → DEICTIC. `trước` tương tự với DIR_BEFORE.

## 5. Ngày dương lịch

| Biểu thức                                            | Role                                                | Schedule                                     |
| ---------------------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| `ngày 15`                                            | GLUE DOM                                            | calendar day 15                              |
| `mùng 5` (dương, không có Tết/ÂL)                    | LUNAR DOM                                           | **lunar** day 5 — `mùng` luôn kéo về âm lịch |
| `tháng 3`                                            | GLUE MONTH                                          | calendar month 3                             |
| `tháng giêng`, `tháng chạp`, `tháng tư`, `tháng một` | GLUE MONTH                                          | month 1 / 12 / 4 / 1                         |
| `ngày 15 tháng 3`                                    | GLUE DOM GLUE MONTH                                 | calendar {month 3, day 15}                   |
| `15 tháng 3`, `15/3`, `15-3`, `15.3`                 | DOM GLUE MONTH                                      | như trên                                     |
| `ngày 15 tháng 3 năm 2026`                           | … GLUE YEAR                                         | {2026, 3, 15}                                |
| `15/3/2026`, `15-3-2026`, `15.3.2026`                | DOM GLUE MONTH GLUE YEAR                            | {2026, 3, 15}                                |
| `2026-03-15` (ISO)                                   | YEAR GLUE MONTH GLUE DOM                            | {2026, 3, 15}                                |
| `tháng 3 năm 2026`, `3/2026`                         | GLUE MONTH GLUE YEAR                                | {2026, 3}                                    |
| `năm 2026`                                           | GLUE YEAR                                           | {2026}                                       |
| `tháng 3 năm sau`                                    | GLUE MONTH UNIT DEICTIC                             | calendarPeriod month 3 modifier next         |
| `đầu tháng 3`, `cuối tháng 12`                       | EDGE GLUE MONTH                                     | calendarPeriod month edge                    |
| `giữa tháng 3`                                       | EDGE GLUE MONTH                                     | calendar {month 3, day 15}                   |
| `tuần thứ 2 của tháng 3`                             | UNIT ORD ORD GLUE GLUE MONTH                        | calendarPeriod month 3 week 2                |
| `từ ngày 10 đến ngày 15 tháng 3`                     | RANGE_START GLUE DOM RANGE_END GLUE DOM GLUE MONTH  | calendarRange from{3,10} to{3,15}            |
| `10-15/3`, `10–15 tháng 3`                           | DOM RANGE_END DOM GLUE MONTH                        | như trên                                     |
| `từ 15/3 đến 20/4`                                   | RANGE_START DOM GLUE MONTH RANGE_END DOM GLUE MONTH | calendarRange                                |
| `từ tháng 3 đến tháng 5`                             | …                                                   | calendarRange from{month 3} to{month 5}      |

Số kiểu `a/b`: **luôn DMY**. `a/b/c` với `c` bốn chữ số → DMY; `c/a/b` với `c` bốn chữ số → YMD. `dateOrder: "MDY"` là option cho caller muốn khác, không phải mặc định.

`ngày` trước một số là GLUE; `ngày` sau một số (`2 ngày`) là UNIT; `ngày` trong `ngày mai` là REL_DAY; `ngày` trong `ngày thường` là DAYGROUP. Đây là từ mơ hồ số một, generator phải phủ đủ cả bốn.

## 6. Âm lịch

Mọi biểu thức có LUNAR sinh `{ kind: "lunar", year?, month?, day?, leap? }`. Resolver chuyển sang dương lịch bằng `lunar.ts` (Hồ Ngọc Đức, tz +7). Năm âm thiếu → chọn lần xuất hiện gần nhất không sớm hơn ngày tham chiếu (giống holiday).

| Biểu thức                                            | Role                                    | Schedule                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `mùng 1`, `mồng 1`                                   | LUNAR DOM                               | lunar day 1                                                                                                                  |
| `mùng 1 Tết`, `mùng 2 Tết`                           | LUNAR DOM HOLIDAY                       | lunar {month 1, day 1/2}                                                                                                     |
| `29 Tết`, `30 Tết`                                   | DOM HOLIDAY                             | lunar {month 12, day 29/30} (ngày cuối năm âm; compiler ghi month 12)                                                        |
| `rằm`                                                | LUNAR                                   | lunar day 15                                                                                                                 |
| `rằm tháng giêng`, `rằm tháng 7`, `rằm tháng 8`      | LUNAR GLUE MONTH                        | lunar {month 1/7/8, day 15}                                                                                                  |
| `15/8 âm lịch`, `15/8 ÂL`, `ngày 15 tháng 8 âm lịch` | DOM GLUE MONTH LUNAR(+)                 | lunar {month 8, day 15}                                                                                                      |
| `tháng 7 âm lịch`                                    | GLUE MONTH LUNAR LUNAR                  | lunar {month 7}                                                                                                              |
| `mùng 10 tháng 3 âm`                                 | LUNAR DOM GLUE MONTH LUNAR              | lunar {month 3, day 10}                                                                                                      |
| `tháng 2 nhuận`                                      | GLUE MONTH LUNAR                        | lunar {month 2, leap true} (`nhuận` là LUNAR)                                                                                |
| `Tết`, `Tết Nguyên Đán`, `Tết âm lịch`, `Tết ta`     | HOLIDAY(+)                              | holiday tet                                                                                                                  |
| `giao thừa`                                          | HOLIDAY HOLIDAY                         | holiday tet-eve                                                                                                              |
| `Giỗ tổ`, `Giỗ tổ Hùng Vương`, `10/3 âm lịch`        | HOLIDAY(+) / DOM GLUE MONTH LUNAR LUNAR | holiday hung-kings / lunar {3, 10}                                                                                           |
| `Trung thu`, `Tết Trung thu`, `rằm tháng 8`          | HOLIDAY(+)                              | holiday mid-autumn                                                                                                           |
| `rằm tháng giêng`, `Tết Nguyên tiêu`                 | LUNAR GLUE MONTH / HOLIDAY(+)           | lunar {1, 15} / holiday lantern-festival — hai dạng cho cùng ngày; cả hai đều hợp lệ                                         |
| `Tết Đoan Ngọ`, `mùng 5 tháng 5`                     | HOLIDAY(+) / LUNAR DOM GLUE MONTH       | holiday doan-ngo / lunar {5, 5}                                                                                              |
| `Vu Lan`, `lễ Vu Lan`                                | HOLIDAY(+)                              | holiday vu-lan                                                                                                               |
| `ông Táo`, `Tết ông Táo`, `23 tháng chạp`            | HOLIDAY(+) / DOM GLUE MONTH             | holiday kitchen-gods / lunar {12, 23} — **`tháng chạp` và `tháng giêng` mặc định là âm lịch**; `tháng 1`/`tháng 12` là dương |

Holiday dương lịch: `Tết dương lịch`/`Tết tây`/`năm mới` → new-year (1/1); `Valentine`/`lễ tình nhân` → valentines (14/2); `8/3`/`Quốc tế phụ nữ` → womens-day; `30/4`/`Giải phóng miền Nam` → liberation-day; `1/5`/`Quốc tế lao động` → labour-day; `2/9`/`Quốc khánh` → national-day; `20/10`/`Phụ nữ Việt Nam` → vn-womens-day; `20/11`/`Nhà giáo` → teachers-day; `Giáng sinh`/`Noel` → christmas; `đêm Giáng sinh` → christmas-eve; `giao thừa tây`/`31/12` → new-years-eve. Dạng số (`30/4`) luôn là calendar date, **không** phải holiday; chỉ dạng chữ mới là HOLIDAY.

### 6.1 Tháng nhuận, can chi, giờ địa chi

| Biểu thức                                        | Role                                | Schedule                                                                                                                                                            |
| ------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mùng 5 tháng 4 nhuận`, `tháng 6 nhuận năm 2025` | … MONTH LUNAR(`nhuận`) …            | lunar `leap: true`; năm không có tháng nhuận đó thì đọc như tháng thường                                                                                            |
| `năm Bính Ngọ`                                   | GLUE YEAR YEAR                      | lunar `cycle: 42` (vị trí trong vòng 60 năm, 0 = Giáp Tý); resolver chọn năm gần mốc nhất, hòa thì lấy năm sắp tới; `năm Bính Ngọ` một mình = cả năm âm (Tết → Tết) |
| `mùng 5 tháng 5 năm Bính Ngọ`                    | LUNAR DOM GLUE MONTH GLUE YEAR YEAR | lunar month 5 day 5 cycle 42                                                                                                                                        |
| `giờ Tý` … `giờ Hợi`                             | TIME_NAMED TIME_NAMED               | cửa sổ 2 giờ: Tý 23–01, Sửu 01–03, Dần 03–05, Mão 05–07, Thìn 07–09, Tỵ 09–11, Ngọ 11–13, Mùi 13–15, Thân 15–17, Dậu 17–19, Tuất 19–21, Hợi 21–23                   |

| `Tết Bính Ngọ`, `Tết năm Đinh Mùi`, `Trung thu 2027`, `Giáng sinh 2026`, `giao thừa Đinh Mùi` | HOLIDAY(+) [GLUE] YEAR(+) | holiday `year` / `cycle`: đúng dịp lễ của năm đó, không cuộn tới; lễ âm lấy năm âm |

Cặp can chi không tồn tại (`Giáp Sửu`) không phải YEAR. `tuổi Ngọ`, `mệnh Kim` không phải thời gian (O).

## 7. Duration, shift, recurrence, bounds, exceptions

| Biểu thức                                                              | Role                                                                                                                                                                                                 | Schedule                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sau 2 tiếng`, `2 tiếng nữa`, `2 tiếng sau`                            | DIR_AFTER NUM UNIT / NUM UNIT DIR_AFTER                                                                                                                                                              | shift after 2 hour                                                                                                                                                                                                                |
| `3 ngày trước`, `cách đây 3 ngày`, `trước đây 3 ngày`                  | NUM UNIT DIR_BEFORE / DIR_BEFORE(+) NUM UNIT                                                                                                                                                         | shift before 3 day                                                                                                                                                                                                                |
| `1 tiếng 30 phút nữa`                                                  | NUM UNIT NUM UNIT DIR_AFTER                                                                                                                                                                          | shift after, components [1h, 30m], amount 90 minute                                                                                                                                                                               |
| `2 ngày sau Tết`, `3 ngày trước ngày 15/3`                             | NUM UNIT DIR_AFTER HOLIDAY / …                                                                                                                                                                       | shift + date anchor                                                                                                                                                                                                               |
| `khoảng 2 tiếng nữa`, `tầm 3 ngày nữa`                                 | O NUM UNIT DIR_AFTER                                                                                                                                                                                 | shift approximate                                                                                                                                                                                                                 |
| `vài ngày nữa`, `mấy hôm nữa`                                          | NUM UNIT DIR_AFTER                                                                                                                                                                                   | shift after 3 day approximate                                                                                                                                                                                                     |
| `nửa tháng nữa`, `nửa năm nữa`, `nửa ngày nữa`                         | NUM UNIT DIR_AFTER                                                                                                                                                                                   | shift after 15 day / 6 month / 12 hour (`nửa` + đơn vị lịch đọc theo quy ước; `1 tháng rưỡi` vẫn bị từ chối)                                                                                                                      |
| `trong 2 tiếng`, `trong vòng 3 ngày`, `kéo dài 2 tuần`, `suốt 1 tiếng` | DUR(+) NUM UNIT                                                                                                                                                                                      | duration 2 hour                                                                                                                                                                                                                   |
| `từ 9h đến 17h`, `9h-17h`, `9h tới 17h`, `từ 9 đến 5 giờ chiều`        | RANGE_START HOUR GLUE RANGE_END HOUR GLUE                                                                                                                                                            | time 09:00–17:00                                                                                                                                                                                                                  |
| `từ 8 giờ tối đến 12 giờ đêm`                                          | …                                                                                                                                                                                                    | 20:00–00:00                                                                                                                                                                                                                       |
| `sau 6 giờ tối`, `từ 6 giờ tối` (không có đến)                         | DIR_AFTER HOUR GLUE MERIDIEM                                                                                                                                                                         | time start 18:00 open end                                                                                                                                                                                                         |
| `trước 9h sáng`, `đến 9h sáng` (không có từ)                           | DIR_BEFORE HOUR …                                                                                                                                                                                    | time end 09:00 open start                                                                                                                                                                                                         |
| `mỗi thứ hai`, `các thứ hai`, `thứ hai hàng tuần`                      | RECUR WEEKDAY(+) / WEEKDAY(+) RECUR UNIT                                                                                                                                                             | weekly byDay MO                                                                                                                                                                                                                   |
| `mỗi ngày`, `hàng ngày`, `hằng ngày`, `mỗi ngày một lần`               | RECUR UNIT                                                                                                                                                                                           | daily                                                                                                                                                                                                                             |
| `hàng tuần`, `mỗi tuần`                                                | RECUR UNIT                                                                                                                                                                                           | weekly                                                                                                                                                                                                                            |
| `hàng tháng`, `mỗi tháng`, `hàng năm`, `mỗi năm`                       | RECUR UNIT                                                                                                                                                                                           | monthly / yearly                                                                                                                                                                                                                  |
| `mỗi 2 tuần`, `2 tuần một lần`, `2 tuần 1 lần`                         | RECUR NUM UNIT / NUM UNIT RECUR RECUR                                                                                                                                                                | weekly interval 2                                                                                                                                                                                                                 |
| `cách tuần`, `cách ngày`, `cách một tuần`                              | RECUR UNIT                                                                                                                                                                                           | interval 2                                                                                                                                                                                                                        |
| `3 lần một tuần`, `3 lần/tuần`, `3 lần mỗi tuần`, `tuần 3 lần`         | NUM TIMES RECUR UNIT / UNIT NUM TIMES                                                                                                                                                                | weekly timesPer 3                                                                                                                                                                                                                 |
| `2 lần một ngày`                                                       | NUM TIMES RECUR UNIT                                                                                                                                                                                 | daily timesPer 2                                                                                                                                                                                                                  |
| `mỗi thứ hai và thứ tư`                                                | RECUR WEEKDAY(+) JOIN WEEKDAY(+)                                                                                                                                                                     | weekly byDay MO, WE                                                                                                                                                                                                               |
| `thứ hai, tư, sáu hàng tuần`                                           | WEEKDAY(+) JOIN WEEKDAY JOIN WEEKDAY RECUR UNIT                                                                                                                                                      | weekly byDay MO, WE, FR (`tư`, `sáu` là WEEKDAY vì có `thứ` phía trước trong cùng dãy)                                                                                                                                            |
| `từ thứ hai đến thứ sáu`                                               | RANGE_START WEEKDAY(+) RANGE_END WEEKDAY(+)                                                                                                                                                          | weekdayRange MO–FR → compiler đổi thành weekly byDay MO–FR như gpu-time                                                                                                                                                           |
| `ngày 15 hàng tháng`, `mỗi tháng ngày 15`, `mùng 1 hàng tháng`         | GLUE DOM RECUR UNIT                                                                                                                                                                                  | monthly byMonthDay 15 (`mùng 1 hàng tháng` → **lunar**? Không: `hàng tháng` dương; `mùng` chỉ kéo âm khi không có RECUR dương — **Quyết định:** `mùng X hàng tháng` = monthly byMonthDay X dương, ghi diagnostic `lunar-ignored`) |
| `ngày 1 và 15 hàng tháng`                                              | GLUE DOM JOIN DOM RECUR UNIT                                                                                                                                                                         | monthly byMonthDay [1, 15]                                                                                                                                                                                                        |
| `thứ hai đầu tiên hàng tháng`, `thứ sáu cuối cùng mỗi tháng`           | WEEKDAY(+) ORD(+) RECUR UNIT                                                                                                                                                                         | monthly byDay MO bySetPos 1 / FR −1                                                                                                                                                                                               |
| `hàng năm vào ngày 26/3`, `26/3 hàng năm`                              | …                                                                                                                                                                                                    | yearly byMonth 3 byMonthDay 26                                                                                                                                                                                                    |
| `mỗi thứ hai bắt đầu từ 1/10`, `kể từ tuần sau`                        | … BOUND_START(+) …                                                                                                                                                                                   | recurrence start                                                                                                                                                                                                                  |
| `mỗi thứ hai đến hết tháng 12`, `cho đến 31/12`, `tới cuối năm`        | … BOUND_END(+) …                                                                                                                                                                                     | recurrence until                                                                                                                                                                                                                  |
| `mỗi ngày trong 2 tuần`, `mỗi thứ hai trong 10 tuần`                   | … DUR NUM UNIT                                                                                                                                                                                       | recurrence span 10 week                                                                                                                                                                                                           |
| `mỗi thứ hai, 6 lần` , `6 buổi thứ hai`                                | … NUM TIMES                                                                                                                                                                                          | recurrence count 6                                                                                                                                                                                                                |
| `mỗi ngày trừ chủ nhật`, `các ngày thường trừ thứ sáu`                 | … EXCEPT WEEKDAY(+)                                                                                                                                                                                  | recurrence except                                                                                                                                                                                                                 |
| `mỗi thứ bảy trừ tuần cuối tháng`                                      | … EXCEPT UNIT EDGE UNIT? → **Quyết định:** `trừ` EXCEPT, `tuần cuối tháng` = ORD? Dùng ordinalWeekday −1 SA of relativeUnit month; nhãn: EXCEPT ORD ORD UNIT (`tuần cuối` = ORD ORD, `tháng` = UNIT) | except ordinalWeekday                                                                                                                                                                                                             |

## 8. Nhiều mệnh đề

`thứ hai 9h và thứ tư 10h` → hai clause, `và` = JOIN, `clauseStart` tại `thứ` (thứ hai) và `thứ` (thứ tư). `họp 9h sáng mai, deadline 17h thứ sáu` → hai clause; `,` = JOIN; `họp`, `deadline` = O.

Một `và` nối **hai WEEKDAY trần** (`thứ hai và thứ tư`) hoặc **hai DOM** (`ngày 1 và 15`) ở trong cùng một clause thì vẫn là JOIN nhưng không tạo clause mới (gpu-time làm y hệt với `Monday and Wednesday`).

## 9. Từ mơ hồ và cách phân định

| Từ                  | Nghĩa thời gian                                                  | Nghĩa khác                             | Phân định                                                                                                                    |
| ------------------- | ---------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `năm`               | UNIT (năm), NUM (5), DEICTIC không                               | `năm người`, `năm nay`                 | NUM khi đứng trước UNIT/`giờ`/`lần`/`tháng`(tháng năm=5); UNIT khi đứng sau NUM/DEICTIC theo sau/`năm` + 4 chữ số            |
| `sáu` / `sau`       | NUM 6 / DEICTIC hoặc DIR_AFTER                                   | —                                      | Dấu thanh phân biệt trong hash; không dùng chung                                                                             |
| `tư`                | NUM 4 (`hai mươi tư`, `thứ tư`, `tháng tư`)                      | `riêng tư`, `tư vấn`, `đầu tư`         | Ngữ cảnh                                                                                                                     |
| `ngày`              | GLUE / UNIT / REL_DAY / DAYGROUP                                 | `ngày càng`, `ngày xưa`                | Mục 5                                                                                                                        |
| `giờ`               | GLUE (đồng hồ) / UNIT / NOW                                      | `giờ giấc`, `bây giờ`                  | `bây giờ` = NOW NOW                                                                                                          |
| `thứ`               | WEEKDAY (thứ hai) / ORD (`thứ 2 của tháng`)                      | `thứ này`, `thứ tự`                    | `thứ` + số/`hai…bảy` = WEEKDAY trừ khi có `tuần`/`của` ngay trước hoặc `lần`                                                 |
| `chiều`             | MERIDIEM / DAYPART                                               | `chiều cao`, `chiều lòng`, `chiều dài` | Ngữ cảnh                                                                                                                     |
| `tối`               | MERIDIEM / DAYPART                                               | `tối đa`, `tối ưu`, `tối thiểu`        | Ngữ cảnh                                                                                                                     |
| `sáng`              | MERIDIEM / DAYPART                                               | `sáng tạo`, `sáng suốt`, `sáng sủa`    | Ngữ cảnh                                                                                                                     |
| `trưa`              | MERIDIEM / DAYPART                                               | —                                      | Sau HOUR → MERIDIEM; một mình → DAYPART (cửa sổ 11–13), không bao giờ TIME_NAMED; `giữa trưa`/`đúng trưa` = TIME_NAMED 12:00 |
| `mai`               | REL_DAY                                                          | `hoa mai`, `mai mối`, `mai sau`        | Ngữ cảnh                                                                                                                     |
| `qua`               | REL_DAY (`hôm qua`), DEICTIC (`tuần qua`)                        | `đi qua`, `qua đó`                     | Ngữ cảnh                                                                                                                     |
| `kia`               | REL_DAY (`ngày kia`)                                             | `bên kia`                              | Ngữ cảnh                                                                                                                     |
| `tháng`             | GLUE / UNIT                                                      | `tháng lương` (vẫn UNIT? → O)          | `tháng` + số = GLUE; NUM + `tháng` = UNIT                                                                                    |
| `lần`               | TIMES                                                            | `lần này`, `lần đầu`                   | Cần NUM phía trước                                                                                                           |
| `rưỡi`              | CLOCK_OFFSET (giờ) / NUM 0.5 (`2 tiếng rưỡi`)                    | —                                      | Sau HOUR = CLOCK_OFFSET; sau UNIT = NUM                                                                                      |
| `cuối`              | EDGE / DAYGROUP (`cuối tuần`) / ORD (`thứ sáu cuối`)             | `cuối cùng`                            | Ngữ cảnh                                                                                                                     |
| `đầu`               | EDGE / ORD (`đầu tiên`)                                          | `đầu tư`, `đầu tiên` (không thời gian) | Ngữ cảnh                                                                                                                     |
| `từ`                | RANGE_START / BOUND_START / O (`từ nay`)                         | `từ chối`, `từ điển`                   | Có `đến` → RANGE; có RECUR → BOUND                                                                                           |
| `đến`/`tới`         | RANGE_END / BOUND_END / DIR_AFTER (`2 ngày tới`) / O (`đến nhà`) | —                                      | Ngữ cảnh                                                                                                                     |
| `trước`             | DIR_BEFORE / DEICTIC                                             | `trước mặt`, `trước tiên`              | Mục 4                                                                                                                        |
| `mùng`              | LUNAR                                                            | —                                      | Luôn thời gian                                                                                                               |
| `hai`, `ba`, `bảy`… | NUM / WEEKDAY (sau `thứ`) / MONTH (sau `tháng`)                  | `ba mẹ`, `hai đứa`                     | Ngữ cảnh                                                                                                                     |

Số điện thoại (`0912 345 678`), giá tiền (`15k`, `3 triệu`, `200 nghìn`), phiên bản (`v2.3`), tỉ số (`3-1`), tuổi (`30 tuổi`), địa chỉ (`số 15 đường 3/2` — có `3/2`!), biển số — đều là O. `đường 3/2` và `ngã tư 30/4` là hard negative bắt buộc.

## 10. Số viết bằng chữ

`không`=0, `một`=1, `hai`=2, `ba`=3, `bốn`/`tư`=4, `năm`/`lăm`=5, `sáu`=6, `bảy`=7, `tám`=8, `chín`=9, `mười`=10, `mươi`=×10, `mốt`=1 (sau mươi), `trăm`=×100, `nghìn`/`ngàn`=×1000, `nửa`=0.5, `rưỡi`=+0.5 (hậu tố), `vài`/`mấy`/`dăm`=3 (approximate), `đôi`=2, `chục`=10.

Ghép: `mười lăm`=15, `hai mươi`=20, `hai mươi mốt`=21, `hai mươi lăm`=25, `hai mươi tư`=24, `ba mươi`=30, `một trăm hai mươi`=120, `hai nghìn không trăm hai mươi sáu`=2026 (hiếm, hỗ trợ tối thiểu tới 99 cho giờ/phút/ngày và 4 chữ số cho năm dạng số).

Mọi token của một số ghép mang **cùng role** với số đó (`hai mươi mốt giờ` = HOUR HOUR HOUR GLUE).

## 11. Family list (dùng cho `grammar.jsonl`, `natural.py`)

1. `now` — bây giờ, hiện tại
2. `relative-day` — hôm nay, mai, kia, mốt, qua, hôm kia
3. `relative-day-part` — sáng mai, tối nay, chiều hôm qua
4. `weekday` — thứ hai, T2, CN, chủ nhật
5. `weekday-deictic` — thứ hai tuần sau, thứ sáu này
6. `relative-unit` — tuần sau, tháng trước, năm ngoái
7. `relative-unit-edge` — đầu tuần sau, cuối tháng, giữa năm
8. `day-group` — cuối tuần, ngày thường
9. `clock` — 3 giờ, 15h30, 3 rưỡi, 3 giờ kém 15, 3pm
10. `clock-meridiem` — 3 giờ chiều, sáng 7h, 12 giờ đêm
11. `clock-spelled` — ba giờ chiều, mười lăm giờ
12. `time-named` — nửa đêm, giữa trưa
13. `day-part` — buổi sáng, chiều, tối
14. `time-window` — từ 9h đến 17h, 9h-17h, 8 giờ tối đến 12 giờ đêm
15. `open-clock` — sau 6 giờ tối, trước 9h sáng
16. `calendar-date` — ngày 15 tháng 3, 15/3/2026, 2026-03-15
17. `calendar-month` — tháng 3, tháng giêng năm sau, tháng 3 năm 2026
18. `calendar-year` — năm 2026, năm 2030
19. `calendar-period` — đầu tháng 3, tuần thứ 2 của tháng 3, giữa tháng 3
20. `date-range` — từ 10 đến 15 tháng 3, 15/3-20/4
21. `holiday-solar` — Giáng sinh, Quốc khánh, Tết dương lịch
22. `holiday-lunar` — Tết, Trung thu, Giỗ tổ, giao thừa
23. `lunar-date` — mùng 1 Tết, rằm tháng giêng, 15/8 âm lịch
24. `shift` — 2 tiếng nữa, cách đây 3 ngày, 1 tiếng 30 phút nữa
25. `anchored-shift` — 2 ngày sau Tết, 3 ngày trước 15/3
26. `duration` — trong 2 tiếng, kéo dài 3 ngày
27. `recurrence` — mỗi thứ hai, hàng ngày, 2 tuần một lần, 3 lần một tuần
28. `recurrence-monthly-yearly` — ngày 15 hàng tháng, thứ hai đầu tiên hàng tháng, 26/3 hàng năm
29. `recurrence-bound` — mỗi thứ hai đến hết tháng 12, kể từ tuần sau, trong 10 tuần, 6 lần
30. `recurrence-except` — mỗi ngày trừ chủ nhật
31. `combined` — 3 giờ chiều mai, thứ sáu tuần sau lúc 9h, 15/3 lúc 14h
32. `multi-clause` — thứ hai 9h và thứ tư 10h
33. `prose` — nhắc tôi họp lúc 3 giờ chiều mai
34. `chat-short` — t2 9h, cn 3h chiều, mai 8h
35. `negative` — không có thời gian (`null`)

## 12. Ví dụ resolve (reference 2026-09-17T09:00:00+07:00, Asia/Ho_Chi_Minh)

| Câu                         | Kết quả                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `3 giờ chiều mai`           | 2026-09-18T15:00+07:00                                                |
| `tối nay`                   | 2026-09-17T18:00 → 22:00                                              |
| `thứ hai tuần sau`          | 2026-09-28 (all day) — thứ hai của tuần kế tiếp, tuần bắt đầu thứ hai |
| `thứ hai`                   | 2026-09-21 (bareWeekday future)                                       |
| `cuối tuần này`             | 2026-09-19 → 2026-09-21T00:00                                         |
| `15/3`                      | 2027-03-15 (đã qua trong năm → năm sau, giống gpu-time)               |
| `mùng 1 Tết`                | 2027-02-06 (Tết Đinh Mùi) — **kiểm chứng trong test**                 |
| `rằm tháng 8`               | 2026-09-25 (Trung thu Bính Ngọ) — **kiểm chứng trong test**           |
| `2 tiếng nữa`               | 2026-09-17T11:00+07:00                                                |
| `mỗi thứ hai từ 9h đến 11h` | RRULE:FREQ=WEEKLY;BYDAY=MO + occurrences 09:00–11:00                  |

## 13. Quyết định đã chốt

- TIMES: `3 lần một tuần` = NUM TIMES RECUR UNIT; `2 tuần một lần` = NUM UNIT RECUR RECUR (`một lần` cả cụm là RECUR khi đứng sau UNIT).
- `tháng giêng`, `tháng chạp` mặc định âm lịch; `tháng 1`, `tháng 12` dương lịch.
- `mùng X hàng tháng` là dương lịch (`byMonthDay`), kèm diagnostic `lunar-ignored`.
- `giữa` + UNIT không có `edge` tương ứng trong types → chỉ hỗ trợ `giữa tháng X` = ngày 15; `giữa tuần` = thứ tư (weekday WE, modifier this); `giữa năm` → diagnostic `unsupported-edge`.
- Dạng số `30/4`, `2/9` là calendar date, không phải holiday.
- `sau`/`trước` phân định DIR vs DEICTIC theo vị trí so với NUM UNIT (mục 4).
- Tiếng lóng/chat có dấu được huấn luyện: `hnay`, `hqua`, `bây h`, `trc`, `weekend`, `thứ2`, `t2`, `9h`, `30p`, `:))`/`=))`/`ok`/`dc`/`k`/`nha` làm nền (O). Không nhận: `bh` (bây giờ hay bao giờ), `hn` (hôm nay hay Hà Nội), `th 3` (tháng hay thứ), `dl`; các cụm mơ hồ về lượng (`lát nữa`, `tí nữa`, `xíu nữa`, `hồi nãy`, `mai mốt`, `5h hơn`) không gán giờ. Không dấu vẫn ngoài phạm vi.
