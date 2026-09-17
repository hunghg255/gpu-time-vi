# gpu-time-vi

`gpu-time-vi` là thư viện chuyển **văn bản tiếng Việt tự nhiên thành thời gian**: ngày, khoảng giờ và quy tắc lặp RFC 5545. Một mô hình neural nhỏ (38 745 tham số, int6) gán vai trò cho từng token, rồi TypeScript lắp thành lịch và giải ra ngày giờ theo múi giờ. Mô hình chạy tại chỗ trên CPU hoặc WebGPU, không gửi dữ liệu đi đâu.

`gpu-time-vi` turns natural-language **Vietnamese** into dates, time ranges and RFC 5545 recurrence rules with a small neural tagger that runs on CPU or WebGPU. It is a Vietnamese rewrite of [gpu-time](https://github.com/arikchakma/gpu-time) (English) and keeps its architecture, size budget and evaluation discipline.

```js
import { parse } from "gpu-time-vi";

const result = await parse("họp nhóm 3 giờ chiều thứ hai tuần sau", {
  reference: "2026-09-17T09:00:00+07:00",
});

console.log(result.occurrences);
// [{ start: "2026-09-21T15:00:00+07:00", allDay: false }]
console.log(result.rrules); // RFC 5545 cho biểu thức lặp
console.log(result.diagnostics); // vì sao một biểu thức bị từ chối
console.log(result.spans); // vị trí trong chuỗi của mỗi kết quả
```

Múi giờ mặc định là `Asia/Ho_Chi_Minh`; truyền `timeZone` để đổi. `reference` là mốc "bây giờ" dạng ISO.

## Hỗ trợ

| Loại                | Ví dụ                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Giờ                 | `3 giờ chiều`, `15h30`, `3 rưỡi`, `7 giờ kém 15 tối`, `3pm`, `ba giờ chiều`                                                                  |
| Buổi                | `sáng mai`, `tối nay`, `chiều thứ sáu`, `nửa đêm`                                                                                            |
| Ngày tương đối      | `hôm nay`, `mai`, `ngày kia`, `hôm qua`, `tuần sau`, `cuối tháng`, `năm ngoái`                                                               |
| Thứ                 | `thứ hai`, `T2`, `CN`, `thứ hai tuần sau`, `cuối tuần này`                                                                                   |
| Ngày dương lịch     | `ngày 15 tháng 3`, `15/3/2026`, `2026-03-15`, `đầu tháng 3`, `từ 10 đến 15 tháng 3`                                                          |
| Âm lịch             | `mùng 1 Tết`, `rằm tháng giêng`, `15/8 âm lịch`, `23 tháng chạp`, `tháng 4 nhuận`, `năm Bính Ngọ`, `giờ Ngọ` (lịch Việt Nam, UTC+7)          |
| Ngày lễ             | `Tết`, `giao thừa`, `Trung thu`, `Giỗ tổ`, `Giáng sinh`, `Quốc khánh`, `Tết Bính Ngọ`, `Trung thu 2027`                                      |
| Dịch chuyển         | `2 tiếng nữa`, `cách đây 3 ngày`, `1 tiếng 30 phút nữa`, `2 ngày sau Tết`                                                                    |
| Thời lượng          | `trong 2 tiếng`, `kéo dài 2 tuần`                                                                                                            |
| Lặp                 | `mỗi thứ hai`, `hàng ngày lúc 7h`, `2 tuần một lần`, `3 lần một tuần`, `ngày 15 hàng tháng`, `thứ sáu cuối cùng mỗi tháng`                   |
| Giới hạn / loại trừ | `mỗi thứ hai đến hết tháng 12`, `kể từ tuần sau`, `trong 10 tuần`, `6 lần`, `trừ chủ nhật`                                                   |
| Khoảng giờ          | `từ 9h đến 17h`, `9h-17h`, `sau 6 giờ tối`, `trước 9h sáng`                                                                                  |
| Nhiều mệnh đề       | `thứ hai 9h và thứ tư 10h`                                                                                                                   |
| Chat có dấu         | `hnay`, `hqua`, `bây h`, `tuần trc`, `weekend này`, `thứ2`, `t2 9h`, `thứ 8` (= chủ nhật), `30p`, `nửa tháng nữa`; `ok dc nha :))` quanh câu |
| Giờ văn phòng       | `giờ hành chính` (08–17), `đầu giờ chiều` (13:00), `cuối giờ` (17:00), `giờ nghỉ trưa` (12–13)                                               |

Toàn bộ quy ước nằm trong [`docs/vietnamese-time-expressions.md`](docs/vietnamese-time-expressions.md). Chưa hỗ trợ: tiếng Việt **không dấu**, câu tiếng Anh. Cố ý không gán giờ cho các cụm mơ hồ về lượng (`lát nữa`, `tí nữa`, `mai mốt`, `5h hơn`) và các viết tắt hai nghĩa (`bh`, `hn`, `th 3`, `dl`).

## Cách hoạt động

1. **Tokenizer (CPU)** tách chuỗi thành tiếng, số và dấu; mỗi token thành một hàng đặc trưng thưa: kiểu, độ dài, lớp ký tự đầu/cuối (a–z, ă â đ ê ô ơ ư, số, dấu), hash chữ thường, hash khung phụ âm. Không có từ điển: mô hình chưa từng được bảo là `tháng` là tháng.
2. **Mô hình** quét hai chiều, gán mỗi token một trong 36 vai trò (giờ, phút, buổi, thứ, ngày, tháng, năm, âm lịch, lặp, giới hạn…) và chấm điểm ranh giới mệnh đề. Trên WebGPU, các khối chạy song song và chuyển tiếp ngữ cảnh qua ranh giới khối.
3. **Compiler (TypeScript)** đọc vai trò thành `Schedule` có kiểu: ngày, giờ, khoảng, dịch chuyển, quy tắc lặp.
4. **Resolver** áp dụng múi giờ, DST, mốc tham chiếu, âm lịch và giới hạn để trả về instant và RRULE.

`backend: "auto"` dùng WebGPU khi một batch đủ lớn (32 chuỗi hoặc 512 token), còn lại chạy CPU. Xem [`architecture.md`](architecture.md) và [`MODEL_CARD.md`](MODEL_CARD.md).

## Phát triển

Cần Node.js 24+, pnpm 11, uv, Python 3.13 và Chrome có WebGPU.

```sh
pnpm install
pnpm test           # core + benchmark utilities
pnpm build:core     # packages/core/dist
pnpm size:gate      # giới hạn phát hành 50 000 byte Brotli
pnpm test:browser   # parity CPU/WebGPU trên Chrome thật
pnpm test:training  # unit test của generator (Python)
pnpm benchmark      # kích thước, hiệu năng trình duyệt, độ chính xác → packages/benchmark/results/
```

Layout: `packages/core` là gói phát hành (không phụ thuộc runtime), `packages/training` là pipeline huấn luyện (generator tiếng Việt + PyTorch), `packages/benchmark` đo gói đã build. Xem [`AGENTS.md`](AGENTS.md) cho quy tắc làm việc.

## Giấy phép

MIT. Kiến trúc, kernel WGSL và pipeline huấn luyện kế thừa từ gpu-time (MIT, Arik Chakma). Thuật toán âm lịch theo Hồ Ngọc Đức. Câu nền lấy từ Tatoeba (CC-BY 2.0 FR). Xem [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
