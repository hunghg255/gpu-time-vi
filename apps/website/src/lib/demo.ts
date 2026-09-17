import type { ParseResult } from "gpu-time-vi";

export const example = "mỗi thứ hai từ 8 giờ tối đến 10 giờ tối";

// The code block hardcodes `example`'s output, so the demo carries its own.
export const demoDefault = "họp nhóm mỗi thứ tư lúc 2 giờ chiều";

export type Kind = "date" | "time" | "repeat" | "duration";
export interface Part {
  text: string;
  kind?: Kind;
}

export const kinds: { kind: Kind; label: string }[] = [
  { kind: "date", label: "Ngày" },
  { kind: "time", label: "Giờ" },
  { kind: "repeat", label: "Lặp lại" },
  { kind: "duration", label: "Thời lượng" },
];

export const examples: { use: string; text: string }[] = [
  // Nhắc việc, hẹn gặp
  { use: "Nhắc việc", text: "9h sáng mai" },
  { use: "Đặt bàn, giữa câu", text: "đặt bàn tối ngày 2 tháng 10 lúc 8 giờ" },
  { use: "Giờ kém", text: "7 giờ kém 15 tối" },
  { use: "Cà phê cuối tuần", text: "cà phê sáng chủ nhật lúc 8h30" },
  { use: "Chuyến bay", text: "bay lúc 6h15 sáng ngày 20 tháng 12" },
  { use: "Hẹn giờ", text: "20 phút nữa trong nửa tiếng" },
  { use: "Khoảng", text: "khoảng 2 tiếng nữa" },
  { use: "Tái khám", text: "khám lại sau 2 tuần" },
  { use: "Quá khứ", text: "tối hôm qua lúc 9h" },
  { use: "Tuần trước", text: "thứ ba tuần trước" },
  // Deadline, giới hạn
  { use: "Hạn nộp", text: "nộp báo cáo trước 5h chiều thứ sáu" },
  { use: "Giờ văn phòng", text: "gửi báo cáo đầu giờ chiều mai" },
  { use: "Cuối tháng", text: "cuối tháng này" },
  { use: "Chuyến đi", text: "từ 4/9 đến 8/9" },
  { use: "Nghỉ lễ", text: "nghỉ từ 30/4 đến hết 1/5" },
  {
    use: "Nhiều ngày, có giờ",
    text: "từ 17/8/2027 2 giờ chiều đến 19/8/2027 2 giờ chiều",
  },
  // Lặp lại
  { use: "Họp hằng ngày", text: "mỗi ngày thường lúc 9 giờ sáng" },
  { use: "Lịch học", text: "thứ 2 4 6 lúc 6h chiều" },
  { use: "Lớp tối", text: "lịch học thứ 3 và thứ 5 từ 7h đến 9h tối" },
  { use: "Ca đêm", text: "thứ sáu từ 10 giờ tối đến 2 giờ sáng" },
  { use: "Uống thuốc", text: "uống thuốc 8h sáng và 8h tối hàng ngày" },
  { use: "Ngày lương", text: "thứ sáu cuối cùng mỗi tháng" },
  { use: "Tiền nhà", text: "ngày 5 hàng tháng trong 12 tháng" },
  { use: "Hai tuần một lần", text: "2 tuần một lần vào trưa thứ sáu" },
  { use: "Mỗi quý", text: "mỗi 3 tháng một lần" },
  { use: "Tập gym", text: "tập gym 3 lần một tuần" },
  { use: "Trừ chủ nhật", text: "mỗi ngày trừ chủ nhật" },
  { use: "Đến hết", text: "mỗi thứ hai đến hết tháng 12" },
  { use: "Sinh nhật", text: "sinh nhật 20/10 hàng năm" },
  { use: "Hai mệnh đề", text: "thứ hai 9h và thứ tư 10h" },
  // Âm lịch, ngày lễ
  { use: "Âm lịch", text: "mùng 1 Tết" },
  { use: "Trung thu", text: "rằm tháng 8" },
  { use: "Ông Táo", text: "23 tháng chạp" },
  { use: "Nghỉ Tết", text: "từ 27 tháng chạp đến mùng 6" },
  { use: "Giỗ tổ", text: "Giỗ tổ" },
  { use: "Giáng sinh", text: "Giáng sinh năm nay 7h tối" },
  { use: "Can chi", text: "giờ Ngọ mùng 5 tháng 5 năm Bính Ngọ" },
  { use: "Tết năm sau", text: "Tết Đinh Mùi" },
  { use: "Tháng nhuận", text: "mùng 6 tháng 6 nhuận năm 2025" },
  // Chat, tiếng lóng
  { use: "Chat", text: "ok dc, t2 9h nha :))" },
  { use: "Xin nghỉ", text: "sếp ơi e xin nghỉ hnay nha :))" },
  { use: "Thứ tám", text: "2h chiều thứ tám tuần này" },
  { use: "Tuần sau nữa", text: "thứ sáu tuần sau nữa" },
  { use: "Nửa tháng", text: "nửa tháng nữa" },
];

const clock =
  "(?:\\d{1,2}(?:[:h]\\d{2}| giờ(?: \\d{1,2}(?: phút)?)?| rưỡi| giờ rưỡi|h)?|(?:một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|mười một|mười hai) giờ(?: rưỡi)?)";
const part = "(?: (?:sáng|trưa|chiều|tối|đêm|am|pm))?";
const patterns: [Kind, RegExp][] = [
  [
    "repeat",
    /(mỗi|hàng|hằng|các|cách)\s+\S+(\s+(hai|ba|tư|năm|sáu|bảy|nhật))?|\d+\s+lần\s+(một|mỗi)\s+(ngày|tuần|tháng)|\S+\s+một lần|(ngày|tuần|tháng|năm)\s+một lần|trừ\s+\S+|đến hết\s+\S+/gi,
  ],
  [
    "duration",
    /(trong(?: vòng)?|kéo dài|suốt)\s+(\d+|một|hai|ba|nửa|vài)\s*(tiếng|giờ|phút|ngày|tuần|tháng)(\s+rưỡi)?/gi,
  ],
  [
    "time",
    new RegExp(
      `(?:từ\\s+)?${clock}${part}\\s*(?:-|–|đến|tới)\\s*${clock}${part}`,
      "gi",
    ),
  ],
  [
    "time",
    new RegExp(
      `(?:lúc\\s+)?${clock}${part}|\\b(nửa đêm|giữa trưa|buổi sáng|buổi trưa|buổi chiều|buổi tối)\\b|\\b(sáng|trưa|chiều|tối|đêm)(?=\\s+(nay|mai|qua|thứ|hôm))`,
      "gi",
    ),
  ],
  [
    "date",
    /\b(thứ (hai|ba|tư|năm|sáu|bảy)|chủ nhật|t[2-7]|cn)(\s+(tuần\s+)?(sau|tới|này|trước))?\b/gi,
  ],
  [
    "date",
    /\b(mùng|mồng)\s+\d+(\s+tết)?|rằm(\s+tháng\s+\S+)?|\d{1,2}\/\d{1,2}(\/\d{4})?(\s+âm lịch)?|ngày\s+\d{1,2}(\s+tháng\s+\d{1,2}(\s+năm\s+\d{4})?)?|tháng\s+(\d{1,2}|giêng|chạp)|tết|giáng sinh|noel|trung thu|giỗ tổ|quốc khánh/gi,
  ],
  [
    "date",
    /\b(hôm nay|ngày mai|ngày kia|ngày mốt|hôm qua|hôm kia|nay|mai|mốt)\b|\b(tuần|tháng|năm)\s+(sau|tới|này|trước|ngoái|nay)\b|\b(đầu|cuối)\s+(tuần|tháng|năm)(\s+(sau|này|trước))?|\bcuối tuần\b/gi,
  ],
];

export function highlight(text: string): Part[] {
  const claims: { start: number; end: number; kind: Kind }[] = [];
  for (const [kind, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (claims.some((claim) => start < claim.end && end > claim.start))
        continue;
      claims.push({ start, end, kind });
    }
  }
  claims.sort((first, second) => first.start - second.start);

  const parts: Part[] = [];
  let at = 0;
  for (const claim of claims) {
    if (claim.start > at) parts.push({ text: text.slice(at, claim.start) });
    parts.push({ text: text.slice(claim.start, claim.end), kind: claim.kind });
    at = claim.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

export function format(result: ParseResult, reference: Date, timeZone: string) {
  const dateFormat = new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  const timeFormat = new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const repeating = result.rrules.length > 0;
  const status = result.diagnostics.length
    ? result.diagnostics.map((diagnostic) => diagnostic.message).join(" ")
    : result.occurrences.length
      ? repeating
        ? `Lặp lại · ${result.occurrences.length} lần trong 12 tháng tới${result.truncated ? " (đã cắt bớt)" : ""}`
        : result.occurrences.length > 1
          ? `${result.occurrences.length} lần`
          : "Kết quả"
      : "Không tìm thấy ngày giờ. Thử một ngày hoặc một khoảng giờ.";

  const rows = result.occurrences.map((occurrence) => {
    const start = new Date(occurrence.start);
    const end = occurrence.end ? new Date(occurrence.end) : start;
    let time: string;
    if (!occurrence.end) {
      time = occurrence.allDay ? "Cả ngày" : timeFormat.format(start);
    } else if (occurrence.allDay) {
      // Date-only ranges have an exclusive end at the next midnight.
      const lastDay = new Date(end.getTime() - 1);
      time =
        dateFormat.format(start) === dateFormat.format(lastDay)
          ? "Cả ngày"
          : `đến hết ${dateFormat.format(lastDay)} · cả ngày`;
    } else {
      const endDate =
        dateFormat.format(start) === dateFormat.format(end)
          ? ""
          : `${dateFormat.format(end)}, `;
      time = `${timeFormat.format(start)} – ${endDate}${timeFormat.format(end)}`;
    }
    return { date: dateFormat.format(start), time };
  });

  return {
    status,
    rows,
    context: `Tính từ ${dateFormat.format(reference)} · ${timeZone}`,
  };
}
