import type { DayPart, HolidayName, Modifier, Unit, Weekday } from "./types.js";

// Every table keys on a phrase that has been lowercased, NFC-composed and
// collapsed to single spaces. `key()` below is the one way to build such a key.
export function key(text: string): string {
  return text.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

export const weekdays: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export const dayNames = [
  "thứ hai",
  "thứ ba",
  "thứ tư",
  "thứ năm",
  "thứ sáu",
  "thứ bảy",
  "chủ nhật",
];

/** Single words with a numeric value. Compounds go through `spelledNumber`. */
export const quantities: Record<string, number> = {
  không: 0,
  một: 1,
  mốt: 1,
  hai: 2,
  đôi: 2,
  ba: 3,
  bốn: 4,
  tư: 4,
  năm: 5,
  lăm: 5,
  nhăm: 5,
  sáu: 6,
  bảy: 7,
  bẩy: 7,
  tám: 8,
  chín: 9,
  mười: 10,
  chục: 10,
  nửa: 0.5,
  rưỡi: 0.5,
  vài: 3,
  mấy: 3,
  dăm: 3,
};
const multipliers: Record<string, number> = {
  mươi: 10,
  trăm: 100,
  nghìn: 1000,
  ngàn: 1000,
};
/** These spellings mean "roughly": the compiler marks the quantity approximate. */
export const vagueQuantities = new Set(["vài", "mấy", "dăm"]);

/**
 * "hai mươi mốt" → 21, "mười lăm" → 15, "một trăm hai mươi" → 120, "hai
 * nghìn không trăm hai mươi sáu" → 2026. A single digit string or word also
 * reads. NaN when the words do not form one number.
 */
export function spelledNumber(words: string[]): number {
  if (words.length === 1) return number(words[0]);
  let total = 0;
  let current: number | undefined;
  let previous = Infinity;
  for (const raw of words) {
    const word = key(raw);
    if (Object.hasOwn(multipliers, word)) {
      const scale = multipliers[word];
      if (scale === 10) {
        // "mươi" needs a preceding ones digit: "hai mươi".
        if (current === undefined || current < 1 || current > 9) return NaN;
        current *= 10;
      } else {
        // "trăm" with no digit before it is one hundred; "không trăm" is none.
        const digits = current ?? 1;
        if (scale > previous) total = (total + digits) * scale;
        else total += digits * scale;
        current = undefined;
      }
      previous = scale;
      continue;
    }
    if (!Object.hasOwn(quantities, word) && !/^\d+$/.test(word)) return NaN;
    const value = number(word);
    if (word === "mười") {
      if (current !== undefined) return NaN;
      current = 10;
    } else if (word === "mốt" || word === "lăm" || word === "nhăm") {
      // Only after a tens word: "hai mươi mốt", "mười lăm".
      if (current === undefined || current < 10 || current % 10 !== 0)
        return NaN;
      current += value;
    } else if (word === "rưỡi") {
      if (current === undefined && total === 0) return NaN;
      current = (current ?? 0) + 0.5;
    } else if (word === "nửa") {
      if (current !== undefined) return NaN;
      current = 0.5;
    } else if (
      current !== undefined &&
      current >= 10 &&
      current % 10 === 0 &&
      value < 10
    ) {
      current += value;
    } else if (current === undefined) {
      current = value;
    } else return NaN;
  }
  return total + (current ?? 0);
}

export function number(text: string): number {
  const word = key(text);
  const spelledOut = Object.hasOwn(quantities, word)
    ? quantities[word]
    : undefined;
  if (spelledOut !== undefined) return spelledOut;
  return /^-?\d+$/.test(word) ? Number(word) : NaN;
}

const weekdayWords: Record<string, number> = {
  hai: 0,
  ba: 1,
  tư: 2,
  bốn: 2,
  năm: 3,
  sáu: 4,
  bảy: 5,
  bẩy: 5,
};
/** "thứ hai", "thứ 2", "t2", "T2", "cn", "chủ nhật", "chúa nhật" → weekday. */
export function weekday(text: string): Weekday | undefined {
  const word = key(text).replace(/\.$/, "");
  if (["cn", "chủ nhật", "chúa nhật", "chủ nhựt"].includes(word)) return "SU";
  const match = /^(?:thứ|t)\s*(\d|\p{L}+)$/u.exec(word);
  if (!match) return undefined;
  const value = /^\d$/.test(match[1])
    ? Number(match[1]) - 2
    : (weekdayWords[match[1]] ?? -1);
  return value >= 0 && value <= 5 ? weekdays[value] : undefined;
}

/** The weekday number that follows "thứ": "hai" → MO, "7" → SA. */
export function weekdayAfterThu(text: string): Weekday | undefined {
  return weekday(`thứ ${text}`);
}

const monthWords: Record<string, number> = {
  giêng: 1,
  một: 1,
  hai: 2,
  ba: 3,
  tư: 4,
  bốn: 4,
  năm: 5,
  sáu: 6,
  bảy: 7,
  bẩy: 7,
  tám: 8,
  chín: 9,
  mười: 10,
  "mười một": 11,
  "mười hai": 12,
  chạp: 12,
};
/** Months that default to the lunar calendar when named this way. */
export const lunarMonthWords = new Set(["giêng", "chạp"]);
/** "3", "tháng 3", "giêng", "tháng tư" → month number. */
export function month(text: string): number | undefined {
  const word = key(text).replace(/^tháng\s+/, "");
  if (/^\d{1,2}$/.test(word)) {
    const value = Number(word);
    return value >= 1 && value <= 12 ? value : undefined;
  }
  return monthWords[word];
}

const unitWords: Record<string, Unit> = {
  giây: "second",
  phút: "minute",
  giờ: "hour",
  tiếng: "hour",
  ngày: "day",
  hôm: "day",
  bữa: "day",
  tuần: "week",
  tháng: "month",
  năm: "year",
  // Chat spellings glued to a number: "2h", "30p".
  h: "hour",
  p: "minute",
  ph: "minute",
};
export function unit(text: string): Unit | undefined {
  return unitWords[key(text)];
}
/** "quý" is three months; the compiler scales the amount. */
export const quarterWords = new Set(["quý"]);

export const relativeDays: Record<string, number> = {
  "hôm nay": 0,
  nay: 0,
  "bữa nay": 0,
  "ngày hôm nay": 0,
  "ngày mai": 1,
  mai: 1,
  "ngày kia": 2,
  "ngày mốt": 2,
  mốt: 2,
  kia: 2,
  "ngày kìa": 3,
  "hôm qua": -1,
  qua: -1,
  "ngày hôm qua": -1,
  "hôm kia": -2,
  "hôm kìa": -3,
};
export const nowWords = new Set([
  "bây giờ",
  "hiện tại",
  "ngay bây giờ",
  "hiện giờ",
  "lúc này",
  "ngay",
  "giờ",
]);

export const dayParts: Record<string, DayPart> = {
  sáng: "morning",
  "buổi sáng": "morning",
  "sáng sớm": "morning",
  trưa: "noon",
  "buổi trưa": "noon",
  chiều: "afternoon",
  "buổi chiều": "afternoon",
  tối: "evening",
  "buổi tối": "evening",
  đêm: "night",
  "ban đêm": "night",
  "buổi đêm": "night",
  khuya: "night",
  "đêm khuya": "night",
};
export const namedTimes: Record<string, "noon" | "midnight"> = {
  "nửa đêm": "midnight",
  "giữa đêm": "midnight",
  trưa: "noon",
  "giữa trưa": "noon",
  "đúng trưa": "noon",
  "chính ngọ": "noon",
};

export const modifiers: Record<string, Modifier> = {
  này: "this",
  nay: "this",
  sau: "next",
  tới: "next",
  kế: "next",
  "kế tiếp": "next",
  "sắp tới": "next",
  "tiếp theo": "next",
  trước: "last",
  rồi: "last",
  qua: "last",
  ngoái: "last",
  "vừa rồi": "last",
  "vừa qua": "last",
};

export const edges: Record<string, "start" | "end" | "middle"> = {
  đầu: "start",
  "đầu tiên": "start",
  cuối: "end",
  "cuối cùng": "end",
  giữa: "middle",
};

export const dayGroups: Record<string, "weekday" | "weekend"> = {
  "cuối tuần": "weekend",
  "ngày thường": "weekday",
  "ngày làm việc": "weekday",
  "ngày trong tuần": "weekday",
  "ngày đi làm": "weekday",
};

export const holidayNames: Record<string, HolidayName> = {
  // Solar
  "tết dương lịch": "new-year",
  "tết tây": "new-year",
  "năm mới": "new-year",
  "tết dương": "new-year",
  valentine: "valentines",
  valentines: "valentines",
  "lễ tình nhân": "valentines",
  "tình nhân": "valentines",
  "quốc tế phụ nữ": "womens-day",
  "phụ nữ quốc tế": "womens-day",
  "giải phóng miền nam": "liberation-day",
  "giải phóng": "liberation-day",
  "thống nhất đất nước": "liberation-day",
  "quốc tế lao động": "labour-day",
  "lao động": "labour-day",
  "quốc tế thiếu nhi": "childrens-day",
  "thiếu nhi": "childrens-day",
  "quốc khánh": "national-day",
  "phụ nữ việt nam": "vn-womens-day",
  "nhà giáo việt nam": "teachers-day",
  "nhà giáo": "teachers-day",
  "hiến chương nhà giáo": "teachers-day",
  "giáng sinh": "christmas",
  noel: "christmas",
  "nô en": "christmas",
  "nô-en": "christmas",
  "đêm giáng sinh": "christmas-eve",
  "đêm noel": "christmas-eve",
  "giao thừa tây": "new-years-eve",
  "giao thừa dương lịch": "new-years-eve",
  // Lunar
  tết: "tet",
  "tết nguyên đán": "tet",
  "tết âm lịch": "tet",
  "tết ta": "tet",
  "tết cổ truyền": "tet",
  "tết âm": "tet",
  "nguyên đán": "tet",
  "giao thừa": "tet-eve",
  "đêm giao thừa": "tet-eve",
  "tết nguyên tiêu": "lantern-festival",
  "nguyên tiêu": "lantern-festival",
  "thượng nguyên": "lantern-festival",
  "giỗ tổ": "hung-kings",
  "giỗ tổ hùng vương": "hung-kings",
  "hùng vương": "hung-kings",
  "tết đoan ngọ": "doan-ngo",
  "đoan ngọ": "doan-ngo",
  "diệt sâu bọ": "doan-ngo",
  "vu lan": "vu-lan",
  "lễ vu lan": "vu-lan",
  "xá tội vong nhân": "vu-lan",
  "trung thu": "mid-autumn",
  "tết trung thu": "mid-autumn",
  "rằm trung thu": "mid-autumn",
  "ông táo": "kitchen-gods",
  "tết ông táo": "kitchen-gods",
  "ông công ông táo": "kitchen-gods",
  "táo quân": "kitchen-gods",
};
/** Holidays fixed on the lunar calendar. */
export const lunarHolidays = new Set<HolidayName>([
  "tet",
  "tet-eve",
  "lantern-festival",
  "hung-kings",
  "doan-ngo",
  "vu-lan",
  "mid-autumn",
  "kitchen-gods",
]);
/** Look a holiday up by phrase, ignoring a leading "ngày", "lễ", "dịp", "kỳ nghỉ". */
export function holiday(text: string): HolidayName | undefined {
  const word = key(text).replace(/^(ngày|lễ|dịp|kỳ nghỉ|nghỉ)\s+/, "");
  return holidayNames[word];
}

export const lunarWords = new Set([
  "âm lịch",
  "âm",
  "âl",
  "lịch âm",
  "lịch ta",
  "mùng",
  "mồng",
  "rằm",
  "nhuận",
]);

// Every phrase that makes a bare string look like it is about time. Used only
// by `mentionsTime()`, which gates the no-expression warning. Multi-word
// phrases match whole, so "đi làm" alone is not "ngày đi làm".
const timePhrases = new Set([
  ...Object.keys(unitWords),
  ...Object.keys(dayParts),
  ...Object.keys(relativeDays),
  ...Object.keys(dayGroups),
  ...Object.keys(holidayNames),
  ...Object.keys(namedTimes),
  ...lunarWords,
  "thứ",
  "cn",
  "hàng",
  "hằng",
  "mỗi",
  "tết",
  "lịch",
  "am",
  "pm",
  "hôm",
  "hẹn",
  "lúc",
]);
const longestPhrase = Math.max(
  ...[...timePhrases].map((phrase) => phrase.split(" ").length),
);

/** A cheap check for input that mentions time but compiled to no expression. */
export function mentionsTime(text: string): boolean {
  const words = key(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
  return words.some((word, index) => {
    if (/\d/.test(word) || weekday(word) !== undefined) return true;
    for (let length = 1; length <= longestPhrase; length++)
      if (timePhrases.has(words.slice(index, index + length).join(" ")))
        return true;
    return false;
  });
}
