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
  // "thứ tám": playful Sunday, the day after "thứ bảy".
  tám: 6,
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
  return value >= 0 && value <= 6 ? weekdays[value] : undefined;
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
  hnay: 0,
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
  hqua: -1,
  qua: -1,
  "ngày hôm qua": -1,
  "hôm kia": -2,
  "hôm kìa": -3,
};
export const nowWords = new Set([
  "bây giờ",
  "bây h",
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
  "giữa trưa": "noon",
  "đúng trưa": "noon",
};
const stems = "giáp ất bính đinh mậu kỷ canh tân nhâm quý".split(" ");
const branches = "tý sửu dần mão thìn tỵ ngọ mùi thân dậu tuất hợi".split(" ");
const branchVariants: Record<string, string> = { tí: "tý", mẹo: "mão", tị: "tỵ" };

/**
 * "Bính Ngọ" → 42, its position in the sexagenary cycle (0 = Giáp Tý).
 * Undefined for pairs the cycle never produces, such as "Giáp Sửu".
 */
export function sexagenary(text: string): number | undefined {
  const words = key(text).split(" ");
  if (words.length !== 2) return undefined;
  const stem = stems.indexOf(words[0]);
  const branch = branches.indexOf(branchVariants[words[1]] ?? words[1]);
  if (stem < 0 || branch < 0 || (stem - branch) % 2) return undefined;
  for (let cycle = stem; cycle < 60; cycle += 10)
    if (cycle % 12 === branch) return cycle;
  return undefined;
}

/**
 * Office-hour phrases with a conventional clock reading, and the twelve
 * earthly-branch hours ("giờ Tý" is 23:00–01:00): "giờ hành chính" is
 * 08:00–17:00, "đầu giờ chiều" 13:00. Conventions, not law; documented in
 * docs/vietnamese-time-expressions.md so a reader can predict them.
 */
export const namedWindows: Record<
  string,
  { start: [number, number]; end?: [number, number] }
> = Object.fromEntries(
  (
    "giờ hành chính,giờ làm việc=8-17;giờ nghỉ trưa=12-13;" +
    "đầu giờ,đầu giờ sáng=8;cuối giờ sáng=11;đầu giờ chiều=13;" +
    "cuối giờ,cuối giờ chiều,cuối giờ làm,hết giờ làm=17;" +
    branches
      .map((name, index) => `giờ ${name}=${(23 + 2 * index) % 24}-${(1 + 2 * index) % 24}`)
      .join(";")
  )
    .split(";")
    .flatMap((entry) => {
      const [names, hours] = entry.split("=");
      const [start, end] = hours.split("-").map(Number);
      return names
        .split(",")
        .map((name) => [
          name,
          { start: [start, 0], ...(end ? { end: [end, 0] } : {}) },
        ]);
    }),
);

export const modifiers: Record<string, Modifier> = {
  này: "this",
  nay: "this",
  sau: "next",
  sang: "next",
  tới: "next",
  kế: "next",
  "kế tiếp": "next",
  "sắp tới": "next",
  "tiếp theo": "next",
  trước: "last",
  trc: "last",
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
  weekend: "weekend",
  "ngày thường": "weekday",
  "ngày làm việc": "weekday",
  "ngày trong tuần": "weekday",
  "ngày đi làm": "weekday",
};

// Aliases per holiday, as one string: "name=alias,alias;name=...". Parsed
// once at load; a table literal costs more of the size budget than this.
export const holidayNames: Record<string, HolidayName> = Object.fromEntries(
  (
    "new-year=tết dương lịch,tết tây,năm mới,tết dương;" +
    "valentines=valentine,valentines,lễ tình nhân,tình nhân;" +
    "womens-day=quốc tế phụ nữ;" +
    "liberation-day=giải phóng miền nam,giải phóng;" +
    "labour-day=quốc tế lao động,lao động;" +
    "childrens-day=quốc tế thiếu nhi,thiếu nhi;national-day=quốc khánh;" +
    "vn-womens-day=phụ nữ việt nam;" +
    "teachers-day=nhà giáo việt nam,nhà giáo;" +
    "christmas=giáng sinh,noel,nô en;" +
    "christmas-eve=đêm giáng sinh,đêm noel;" +
    "new-years-eve=giao thừa tây,giao thừa dương lịch;" +
    "tet=tết,tết nguyên đán,tết âm lịch,tết ta,tết cổ truyền,tết âm,nguyên đán;" +
    "tet-eve=giao thừa,đêm giao thừa;" +
    "lantern-festival=tết nguyên tiêu,nguyên tiêu;" +
    "hung-kings=giỗ tổ,giỗ tổ hùng vương,hùng vương;" +
    "doan-ngo=tết đoan ngọ,đoan ngọ;" +
    "vu-lan=vu lan,lễ vu lan;" +
    "mid-autumn=trung thu,tết trung thu,rằm trung thu;" +
    "kitchen-gods=ông táo,tết ông táo,ông công ông táo,táo quân"
  )
    .split(";")
    .flatMap((entry) => {
      const [name, aliases] = entry.split("=");
      return aliases.split(",").map((alias) => [alias, name as HolidayName]);
    }),
);
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
  // "Tết này", "Giáng sinh năm nay", "Trung thu tới": the modifier adds nothing
  // to a holiday, which is always its next occurrence.
  const word = key(text)
    .replace(/^(ngày|lễ|dịp|kỳ nghỉ|nghỉ)\s+/, "")
    .replace(/\s+(này|nay|năm nay|năm này|tới|sắp tới|sau|năm sau|năm tới)$/, "");
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
  ...Object.keys(namedWindows),
  ...nowWords,
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
