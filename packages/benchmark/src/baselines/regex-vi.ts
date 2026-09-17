import { reference, type Adapter } from "../types.ts";

// A deliberately small hand-written baseline: the kind of regex parser a
// product would ship without a model. It reads relative days, weekdays,
// numeric dates and clocks, and nothing else, so its coverage on the gold
// corpora is the floor a learned parser has to clear.
const relativeDays: Record<string, number> = {
  "hôm nay": 0,
  "ngày mai": 1,
  mai: 1,
  "ngày kia": 2,
  "ngày mốt": 2,
  "hôm qua": -1,
  "hôm kia": -2,
};
const weekdays = [
  "thứ hai",
  "thứ ba",
  "thứ tư",
  "thứ năm",
  "thứ sáu",
  "thứ bảy",
  "chủ nhật",
];
const parts: Record<string, number> = {
  sáng: 0,
  trưa: 12,
  chiều: 12,
  tối: 12,
  đêm: 12,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function iso(date: Date, hour?: number, minute = 0): string {
  const local = new Date(date.getTime() + 7 * 3_600_000);
  const day = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  return `${day}T${pad(hour ?? 0)}:${pad(minute)}:00+07:00`;
}

export function parse(input: string) {
  const text = input.toLowerCase();
  const base = new Date(reference);
  let date: Date | undefined;
  for (const [phrase, offset] of Object.entries(relativeDays))
    if (new RegExp(`(^|\s)${phrase}(\s|$)`).test(text)) {
      date = new Date(base.getTime() + offset * 86_400_000);
      break;
    }
  if (!date)
    for (const [index, name] of weekdays.entries())
      if (text.includes(name)) {
        const current = (base.getUTCDay() + 6) % 7;
        date = new Date(
          base.getTime() + ((index - current + 7) % 7) * 86_400_000,
        );
        break;
      }
  const numeric = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/.exec(text);
  if (!date && numeric) {
    const year = numeric[3] ? Number(numeric[3]) : 2026;
    date = new Date(
      Date.UTC(year, Number(numeric[2]) - 1, Number(numeric[1]), -7),
    );
  }
  const clock =
    /(\d{1,2})\s*(?:h|g|giờ|:)\s*(\d{2})?\s*(sáng|trưa|chiều|tối|đêm|am|pm)?/.exec(
      text,
    );
  if (!date && !clock) return { occurrences: [] };
  let hour: number | undefined;
  let minute = 0;
  if (clock) {
    hour = Number(clock[1]);
    minute = clock[2] ? Number(clock[2]) : 0;
    const part = clock[3];
    if (part && hour < 12 && (parts[part] ?? (part === "pm" ? 12 : 0)))
      hour += 12;
    if (part === "đêm" && hour === 12) hour = 0;
  }
  return {
    occurrences: [
      { start: iso(date ?? base, hour, minute), allDay: hour === undefined },
    ],
  };
}

export function create(): Adapter {
  return {
    parse,
    normalize(value: ReturnType<typeof parse>) {
      return {
        occurrences: value.occurrences,
        rrules: null,
        abstained: value.occurrences.length === 0,
        limitation: "relative days, weekdays, numeric dates and clocks only",
      };
    },
  };
}
