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
  { use: "Nhắc việc", text: "9h sáng mai" },
  { use: "Đặt bàn, giữa câu", text: "đặt bàn tối ngày 2 tháng 10 lúc 8 giờ" },
  { use: "Họp hằng ngày", text: "mỗi ngày thường lúc 9 giờ sáng" },
  { use: "Ca đêm", text: "thứ sáu từ 10 giờ tối đến 2 giờ sáng" },
  { use: "Chuyến đi", text: "từ 4/9 đến 8/9" },
  { use: "Ngày lương", text: "thứ sáu cuối cùng mỗi tháng" },
  { use: "Hai tuần một lần", text: "2 tuần một lần vào trưa thứ sáu" },
  { use: "Hẹn giờ", text: "20 phút nữa trong nửa tiếng" },
  { use: "Âm lịch", text: "mùng 1 Tết" },
  { use: "Trung thu", text: "rằm tháng 8" },
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
        ? `Lặp lại · ${result.occurrences.length} lần trong 12 tháng tới`
        : result.truncated
          ? `${result.occurrences.length} lần tiếp theo`
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
