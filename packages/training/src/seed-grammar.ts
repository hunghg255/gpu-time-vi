import { writeFileSync } from "node:fs";
import type {
  Clause as CoreClause,
  DateSpec as CoreDateSpec,
  Recurrence as CoreRecurrence,
  TimeSpec as CoreTimeSpec,
  Unit,
  Weekday,
} from "../../core/src/types.ts";

// Authored Vietnamese grammar surface. Expected schedules are written from the
// spec in docs/vietnamese-time-expressions.md, never from a parser.
//
// The `lunar` date kind, Vietnamese holiday names and the `noon` day part land
// in core/src/types.ts in Task 4. Until then the additions are declared here so
// this script type-checks against the planned contract. Replace these local
// aliases with the core imports once Task 4 merges.
type VietnameseHoliday =
  | "new-year"
  | "valentines"
  | "womens-day"
  | "liberation-day"
  | "labour-day"
  | "national-day"
  | "vn-womens-day"
  | "teachers-day"
  | "christmas"
  | "christmas-eve"
  | "new-years-eve"
  | "tet"
  | "tet-eve"
  | "lantern-festival"
  | "hung-kings"
  | "doan-ngo"
  | "vu-lan"
  | "mid-autumn"
  | "kitchen-gods";
type LunarDate = {
  kind: "lunar";
  year?: number;
  month?: number;
  day?: number;
  leap?: boolean;
};
type DateSpec =
  | Exclude<CoreDateSpec, { kind: "holiday" }>
  | { kind: "holiday"; name: VietnameseHoliday }
  | LunarDate;
type DayPart = "morning" | "noon" | "afternoon" | "evening" | "night";
type ClockTime =
  | { hour: number; minute: number; second?: number }
  | { named: "noon" | "midnight" }
  | { part: DayPart };
type TimeSpec = Omit<CoreTimeSpec, "start" | "end"> & {
  start: ClockTime;
  end?: ClockTime;
};
type Recurrence = Omit<CoreRecurrence, "until" | "start" | "except"> & {
  until?: DateSpec;
  start?: DateSpec;
  except?: DateSpec[];
};
type Clause = Omit<
  CoreClause,
  "date" | "endDate" | "time" | "recurrence"
> & {
  date?: DateSpec;
  endDate?: DateSpec;
  time?: TimeSpec;
  recurrence?: Recurrence;
};

const gold = new URL("../data/gold/", import.meta.url);

const clock = (hour: number, minute = 0): TimeSpec => ({
  start: { hour, minute },
});
const named = (name: "noon" | "midnight"): TimeSpec => ({
  start: { named: name },
});
const part = (name: DayPart): TimeSpec => ({ start: { part: name } });
const window = (
  start: number,
  end: number,
  startMinute = 0,
  endMinute = 0,
): TimeSpec => ({
  start: { hour: start, minute: startMinute },
  end: { hour: end, minute: endMinute },
});
const weekday = (...days: Weekday[]): DateSpec => ({ kind: "weekday", days });
const weekdayMod = (
  modifier: "this" | "next" | "last",
  ...days: Weekday[]
): DateSpec => ({ kind: "weekday", days, modifier });
const relative = (offset: number): DateSpec => ({
  kind: "relativeDay",
  offset,
});
const unit = (
  unit: Unit,
  modifier: "this" | "next" | "last",
  edge?: "start" | "end",
): DateSpec => ({
  kind: "relativeUnit",
  unit,
  modifier,
  ...(edge ? { edge } : {}),
});
const shift = (
  amount: number,
  unit: Unit,
  direction: "before" | "after",
  extra: Partial<NonNullable<Clause["shift"]>> = {},
): Clause => ({ shift: { amount, unit, direction, ...extra } });
const duration = (amount: number, unit: Unit): Clause => ({
  duration: { amount, unit },
});
const recurrence = (
  freq: Recurrence["freq"],
  extra: Partial<Recurrence> = {},
): Clause => ({ recurrence: { freq, interval: 1, ...extra } });
const calendar = (month: number, day?: number, year?: number): DateSpec => ({
  kind: "calendar",
  month,
  ...(day === undefined ? {} : { day }),
  ...(year === undefined ? {} : { year }),
});
const lunar = (month?: number, day?: number, year?: number): DateSpec => ({
  kind: "lunar",
  ...(month === undefined ? {} : { month }),
  ...(day === undefined ? {} : { day }),
  ...(year === undefined ? {} : { year }),
});
const holiday = (name: VietnameseHoliday): DateSpec => ({
  kind: "holiday",
  name,
});
const range = (
  from: { month?: number; day?: number; year?: number },
  to: { month?: number; day?: number; year?: number },
): DateSpec => ({ kind: "calendarRange", from, to });
const WEEKDAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR"];
const WEEKEND: Weekday[] = ["SA", "SU"];

const cases: {
  id: string;
  family: string;
  text: string;
  schedule: { clauses: Clause[] } | null;
}[] = [];
function example(family: string, text: string, ...clauses: Clause[]) {
  cases.push({
    id: `grammar-${String(cases.length + 1).padStart(3, "0")}`,
    family,
    text,
    schedule: { clauses },
  });
}
function negative(text: string) {
  cases.push({
    id: `grammar-${String(cases.length + 1).padStart(3, "0")}`,
    family: "negative",
    text,
    schedule: null,
  });
}

// 1. now
example("now", "bây giờ", { date: { kind: "now" } });
example("now", "hiện tại", { date: { kind: "now" } });
example("now", "ngay bây giờ", { date: { kind: "now" } });

// 2. relative-day
example("relative-day", "hôm nay", { date: relative(0) });
example("relative-day", "nay", { date: relative(0) });
example("relative-day", "ngày mai", { date: relative(1) });
example("relative-day", "mai", { date: relative(1) });
example("relative-day", "ngày kia", { date: relative(2) });
example("relative-day", "ngày mốt", { date: relative(2) });
example("relative-day", "hôm qua", { date: relative(-1) });
example("relative-day", "hôm kia", { date: relative(-2) });
example("relative-day", "bữa nay", { date: relative(0) });

// 3. relative-day-part
example("relative-day-part", "sáng mai", {
  date: relative(1),
  time: part("morning"),
});
example("relative-day-part", "tối nay", {
  date: relative(0),
  time: part("evening"),
});
example("relative-day-part", "chiều hôm qua", {
  date: relative(-1),
  time: part("afternoon"),
});
example("relative-day-part", "trưa mai", {
  date: relative(1),
  time: part("noon"),
});
example("relative-day-part", "đêm nay", {
  date: relative(0),
  time: part("night"),
});
example("relative-day-part", "tối thứ sáu", {
  date: weekday("FR"),
  time: part("evening"),
});

// 4. weekday
example("weekday", "thứ hai", { date: weekday("MO") });
example("weekday", "thứ 2", { date: weekday("MO") });
example("weekday", "t2", { date: weekday("MO") });
example("weekday", "T7", { date: weekday("SA") });
example("weekday", "thứ tư", { date: weekday("WE") });
example("weekday", "chủ nhật", { date: weekday("SU") });
example("weekday", "CN", { date: weekday("SU") });
example("weekday", "thứ hai và thứ tư", { date: weekday("MO", "WE") });

// 5. weekday-deictic
example("weekday-deictic", "thứ hai tuần sau", {
  date: weekdayMod("next", "MO"),
});
example("weekday-deictic", "thứ sáu tuần này", {
  date: weekdayMod("this", "FR"),
});
example("weekday-deictic", "thứ ba tuần trước", {
  date: weekdayMod("last", "TU"),
});
example("weekday-deictic", "thứ hai tới", { date: weekdayMod("next", "MO") });
example("weekday-deictic", "chủ nhật này", { date: weekdayMod("this", "SU") });
example("weekday-deictic", "cn tuần sau", { date: weekdayMod("next", "SU") });

// 6. relative-unit
example("relative-unit", "tuần sau", { date: unit("week", "next") });
example("relative-unit", "tuần tới", { date: unit("week", "next") });
example("relative-unit", "tuần này", { date: unit("week", "this") });
example("relative-unit", "tuần trước", { date: unit("week", "last") });
example("relative-unit", "tuần rồi", { date: unit("week", "last") });
example("relative-unit", "tháng sau", { date: unit("month", "next") });
example("relative-unit", "tháng này", { date: unit("month", "this") });
example("relative-unit", "tháng trước", { date: unit("month", "last") });
example("relative-unit", "năm sau", { date: unit("year", "next") });
example("relative-unit", "năm nay", { date: unit("year", "this") });
example("relative-unit", "năm ngoái", { date: unit("year", "last") });

// 7. relative-unit-edge
example("relative-unit-edge", "đầu tuần sau", {
  date: unit("week", "next", "start"),
});
example("relative-unit-edge", "cuối tháng", {
  date: unit("month", "this", "end"),
});
example("relative-unit-edge", "cuối tháng sau", {
  date: unit("month", "next", "end"),
});
example("relative-unit-edge", "đầu năm sau", {
  date: unit("year", "next", "start"),
});
example("relative-unit-edge", "cuối năm nay", {
  date: unit("year", "this", "end"),
});

// 8. day-group
example("day-group", "cuối tuần", {
  date: { kind: "dayGroup", group: "weekend" },
});
example("day-group", "cuối tuần này", {
  date: { kind: "dayGroup", group: "weekend", modifier: "this" },
});
example("day-group", "cuối tuần sau", {
  date: { kind: "dayGroup", group: "weekend", modifier: "next" },
});
example("day-group", "ngày thường", recurrence("weekly", { byDay: WEEKDAYS }));
example(
  "day-group",
  "các ngày làm việc",
  recurrence("weekly", { byDay: WEEKDAYS }),
);
example(
  "day-group",
  "từ thứ hai đến thứ sáu",
  recurrence("weekly", { byDay: WEEKDAYS }),
);

// 9. clock
example("clock", "3 giờ", { time: clock(3) });
example("clock", "15 giờ", { time: clock(15) });
example("clock", "15h", { time: clock(15) });
example("clock", "15h30", { time: clock(15, 30) });
example("clock", "15g30", { time: clock(15, 30) });
example("clock", "15:30", { time: clock(15, 30) });
example("clock", "15 giờ 30", { time: clock(15, 30) });
example("clock", "15 giờ 30 phút", { time: clock(15, 30) });
example("clock", "3 rưỡi", { time: clock(3, 30) });
example("clock", "3 giờ rưỡi", { time: clock(3, 30) });
example("clock", "3 giờ kém 15", { time: clock(2, 45) });
example("clock", "3h kém 15", { time: clock(2, 45) });
example("clock", "3 giờ hơn 10", { time: clock(3, 10) });
example("clock", "3pm", { time: clock(15) });
example("clock", "3 pm", { time: clock(15) });
example("clock", "10:05:20", { time: { start: { hour: 10, minute: 5, second: 20 } } });

// 10. clock-meridiem
example("clock-meridiem", "3 giờ chiều", { time: clock(15) });
example("clock-meridiem", "3h chiều", { time: clock(15) });
example("clock-meridiem", "7 giờ sáng", { time: clock(7) });
example("clock-meridiem", "7 giờ tối", { time: clock(19) });
example("clock-meridiem", "12 giờ trưa", { time: clock(12) });
example("clock-meridiem", "1 giờ trưa", { time: clock(13) });
example("clock-meridiem", "12 giờ đêm", { time: clock(0) });
example("clock-meridiem", "11 giờ đêm", { time: clock(23) });
example("clock-meridiem", "2 giờ đêm", { time: clock(2) });
example("clock-meridiem", "3 rưỡi chiều", { time: clock(15, 30) });
example("clock-meridiem", "7 giờ kém 15 tối", { time: clock(18, 45) });
example("clock-meridiem", "chiều 3 giờ", { time: clock(15) });
example("clock-meridiem", "sáng 7h", { time: clock(7) });
example("clock-meridiem", "15h chiều", { time: clock(15) });

// 11. clock-spelled
example("clock-spelled", "ba giờ chiều", { time: clock(15) });
example("clock-spelled", "mười lăm giờ", { time: clock(15) });
example("clock-spelled", "bảy giờ rưỡi sáng", { time: clock(7, 30) });
example("clock-spelled", "hai mươi mốt giờ", { time: clock(21) });

// 12. time-named
example("time-named", "nửa đêm", { time: named("midnight") });
example("time-named", "giữa trưa", { time: named("noon") });
example("time-named", "đúng trưa", { time: named("noon") });

// 13. day-part
example("day-part", "buổi sáng", { time: part("morning") });
example("day-part", "sáng", { time: part("morning") });
example("day-part", "buổi trưa", { time: part("noon") });
example("day-part", "chiều", { time: part("afternoon") });
example("day-part", "buổi tối", { time: part("evening") });
example("day-part", "đêm", { time: part("night") });
example("day-part", "khuya", { time: part("night") });

// 14. time-window
example("time-window", "từ 9h đến 17h", { time: window(9, 17) });
example("time-window", "9h-17h", { time: window(9, 17) });
example("time-window", "9h tới 17h", { time: window(9, 17) });
example("time-window", "từ 9 đến 5 giờ chiều", { time: window(9, 17) });
example("time-window", "từ 8 giờ tối đến 12 giờ đêm", { time: window(20, 0) });
example("time-window", "từ 9 giờ sáng đến 11 giờ trưa", {
  time: window(9, 11),
});
example("time-window", "từ 14h30 đến 16h", { time: window(14, 16, 30, 0) });
example("time-window", "giữa 9h và 10h", { time: window(9, 10) });

// 15. open-clock
example("open-clock", "sau 6 giờ tối", {
  time: { start: { hour: 18, minute: 0 }, open: "end" },
});
example("open-clock", "trước 9h sáng", {
  time: { start: { hour: 0, minute: 0 }, end: { hour: 9, minute: 0 }, open: "start" },
});
example("open-clock", "từ 6 giờ tối", {
  time: { start: { hour: 18, minute: 0 }, open: "end" },
});

// 16. calendar-date
example("calendar-date", "ngày 15", { date: { kind: "calendar", day: 15 } });
example("calendar-date", "ngày 15 tháng 3", { date: calendar(3, 15) });
example("calendar-date", "15 tháng 3", { date: calendar(3, 15) });
example("calendar-date", "15/3", { date: calendar(3, 15) });
example("calendar-date", "15-3", { date: calendar(3, 15) });
example("calendar-date", "ngày 15 tháng 3 năm 2026", {
  date: calendar(3, 15, 2026),
});
example("calendar-date", "15/3/2026", { date: calendar(3, 15, 2026) });
example("calendar-date", "15-3-2026", { date: calendar(3, 15, 2026) });
example("calendar-date", "15.3.2026", { date: calendar(3, 15, 2026) });
example("calendar-date", "2026-03-15", { date: calendar(3, 15, 2026) });
example("calendar-date", "ngày 1 tháng tư", { date: calendar(4, 1) });
example("calendar-date", "30/4", { date: calendar(4, 30) });
example("calendar-date", "2/9", { date: calendar(9, 2) });

// 17. calendar-month
example("calendar-month", "tháng 3", { date: calendar(3) });
example("calendar-month", "tháng tư", { date: calendar(4) });
example("calendar-month", "tháng 3 năm 2026", { date: calendar(3, undefined, 2026) });
example("calendar-month", "3/2026", { date: calendar(3, undefined, 2026) });
example("calendar-month", "tháng 3 năm sau", {
  date: { kind: "calendarPeriod", month: 3, modifier: "next" },
});
example("calendar-month", "tháng 12 năm ngoái", {
  date: { kind: "calendarPeriod", month: 12, modifier: "last" },
});

// 18. calendar-year
example("calendar-year", "năm 2026", { date: { kind: "calendar", year: 2026 } });
example("calendar-year", "năm 2030", { date: { kind: "calendar", year: 2030 } });

// 19. calendar-period
example("calendar-period", "đầu tháng 3", {
  date: { kind: "calendarPeriod", month: 3, edge: "start" },
});
example("calendar-period", "cuối tháng 12", {
  date: { kind: "calendarPeriod", month: 12, edge: "end" },
});
example("calendar-period", "giữa tháng 3", { date: calendar(3, 15) });
example("calendar-period", "tuần thứ 2 của tháng 3", {
  date: { kind: "calendarPeriod", month: 3, week: 2 },
});
example("calendar-period", "tuần đầu tháng 3", {
  date: { kind: "calendarPeriod", month: 3, week: 1 },
});

// 20. date-range
example("date-range", "từ ngày 10 đến ngày 15 tháng 3", {
  date: range({ month: 3, day: 10 }, { month: 3, day: 15 }),
});
example("date-range", "10-15/3", {
  date: range({ month: 3, day: 10 }, { month: 3, day: 15 }),
});
example("date-range", "từ 15/3 đến 20/4", {
  date: range({ month: 3, day: 15 }, { month: 4, day: 20 }),
});
example("date-range", "từ tháng 3 đến tháng 5", {
  date: range({ month: 3 }, { month: 5 }),
});
example("date-range", "từ 25/12/2026 đến 2/1/2027", {
  date: range(
    { month: 12, day: 25, year: 2026 },
    { month: 1, day: 2, year: 2027 },
  ),
});

// 21. holiday-solar
example("holiday-solar", "Giáng sinh", { date: holiday("christmas") });
example("holiday-solar", "Noel", { date: holiday("christmas") });
example("holiday-solar", "đêm Giáng sinh", { date: holiday("christmas-eve") });
example("holiday-solar", "Tết dương lịch", { date: holiday("new-year") });
example("holiday-solar", "Quốc khánh", { date: holiday("national-day") });
example("holiday-solar", "ngày Nhà giáo Việt Nam", {
  date: holiday("teachers-day"),
});
example("holiday-solar", "Quốc tế phụ nữ", { date: holiday("womens-day") });
example("holiday-solar", "lễ 30/4", { date: calendar(4, 30) });
example("holiday-solar", "Valentine", { date: holiday("valentines") });

// 22. holiday-lunar
example("holiday-lunar", "Tết", { date: holiday("tet") });
example("holiday-lunar", "Tết Nguyên Đán", { date: holiday("tet") });
example("holiday-lunar", "Tết âm lịch", { date: holiday("tet") });
example("holiday-lunar", "giao thừa", { date: holiday("tet-eve") });
example("holiday-lunar", "Trung thu", { date: holiday("mid-autumn") });
example("holiday-lunar", "Tết Trung thu", { date: holiday("mid-autumn") });
example("holiday-lunar", "Giỗ tổ Hùng Vương", { date: holiday("hung-kings") });
example("holiday-lunar", "Giỗ tổ", { date: holiday("hung-kings") });
example("holiday-lunar", "Tết Đoan Ngọ", { date: holiday("doan-ngo") });
example("holiday-lunar", "lễ Vu Lan", { date: holiday("vu-lan") });
example("holiday-lunar", "Tết ông Táo", { date: holiday("kitchen-gods") });
example("holiday-lunar", "Tết Nguyên tiêu", {
  date: holiday("lantern-festival"),
});

// 23. lunar-date
example("lunar-date", "mùng 1", { date: lunar(undefined, 1) });
example("lunar-date", "mùng 1 Tết", { date: lunar(1, 1) });
example("lunar-date", "mùng 2 Tết", { date: lunar(1, 2) });
example("lunar-date", "30 Tết", { date: lunar(12, 30) });
example("lunar-date", "rằm", { date: lunar(undefined, 15) });
example("lunar-date", "rằm tháng giêng", { date: lunar(1, 15) });
example("lunar-date", "rằm tháng 7", { date: lunar(7, 15) });
example("lunar-date", "rằm tháng 8", { date: lunar(8, 15) });
example("lunar-date", "15/8 âm lịch", { date: lunar(8, 15) });
example("lunar-date", "15/8 ÂL", { date: lunar(8, 15) });
example("lunar-date", "ngày 15 tháng 8 âm lịch", { date: lunar(8, 15) });
example("lunar-date", "mùng 10 tháng 3 âm lịch", { date: lunar(3, 10) });
example("lunar-date", "10/3 âm lịch", { date: lunar(3, 10) });
example("lunar-date", "tháng 7 âm lịch", { date: lunar(7) });
example("lunar-date", "tháng giêng", { date: lunar(1) });
example("lunar-date", "tháng chạp", { date: lunar(12) });
example("lunar-date", "23 tháng chạp", { date: lunar(12, 23) });
example("lunar-date", "mùng 5 tháng 5", { date: lunar(5, 5) });
example("lunar-date", "ngày 1 tháng 1 âm lịch năm 2027", {
  date: lunar(1, 1, 2027),
});

// 24. shift
example("shift", "sau 2 tiếng", shift(2, "hour", "after"));
example("shift", "2 tiếng nữa", shift(2, "hour", "after"));
example("shift", "2 tiếng sau", shift(2, "hour", "after"));
example("shift", "30 phút nữa", shift(30, "minute", "after"));
example("shift", "3 ngày trước", shift(3, "day", "before"));
example("shift", "cách đây 3 ngày", shift(3, "day", "before"));
example("shift", "2 tuần nữa", shift(2, "week", "after"));
example("shift", "3 tháng sau", shift(3, "month", "after"));
example("shift", "1 năm nữa", shift(1, "year", "after"));
example("shift", "1 tiếng 30 phút nữa", {
  shift: {
    components: [
      { amount: 1, unit: "hour" },
      { amount: 30, unit: "minute" },
    ],
    amount: 90,
    unit: "minute",
    direction: "after",
  },
});
example("shift", "khoảng 2 tiếng nữa", shift(2, "hour", "after", { approximate: true }));
example("shift", "vài ngày nữa", shift(3, "day", "after", { approximate: true }));
example("shift", "hai tuần trước", shift(2, "week", "before"));
example("shift", "2 ngày tới", shift(2, "day", "after"));
example("shift", "3 tuần kể từ bây giờ", {
  ...shift(3, "week", "after"),
  date: { kind: "now" },
});

// 25. anchored-shift
example("anchored-shift", "2 ngày sau Tết", {
  ...shift(2, "day", "after"),
  date: holiday("tet"),
});
example("anchored-shift", "3 ngày trước 15/3", {
  ...shift(3, "day", "before"),
  date: calendar(3, 15),
});
example("anchored-shift", "1 tuần sau thứ hai", {
  ...shift(1, "week", "after"),
  date: weekday("MO"),
});
example("anchored-shift", "2 tiếng trước trưa mai", {
  ...shift(2, "hour", "before"),
  date: relative(1),
  time: named("noon"),
});

// 26. duration
example("duration", "trong 2 tiếng", duration(2, "hour"));
example("duration", "trong vòng 3 ngày", duration(3, "day"));
example("duration", "kéo dài 2 tuần", duration(2, "week"));
example("duration", "suốt 1 tiếng", duration(1, "hour"));
example("duration", "trong 90 phút", duration(90, "minute"));
example("duration", "trong 2 tiếng rưỡi", {
  duration: {
    components: [
      { amount: 2, unit: "hour" },
      { amount: 30, unit: "minute" },
    ],
    amount: 150,
    unit: "minute",
  },
});

// 27. recurrence
example("recurrence", "mỗi thứ hai", recurrence("weekly", { byDay: ["MO"] }));
example("recurrence", "các thứ hai", recurrence("weekly", { byDay: ["MO"] }));
example("recurrence", "thứ hai hàng tuần", recurrence("weekly", { byDay: ["MO"] }));
example("recurrence", "mỗi ngày", recurrence("daily"));
example("recurrence", "hàng ngày", recurrence("daily"));
example("recurrence", "hằng ngày", recurrence("daily"));
example("recurrence", "hàng tuần", recurrence("weekly"));
example("recurrence", "mỗi tuần", recurrence("weekly"));
example("recurrence", "hàng tháng", recurrence("monthly"));
example("recurrence", "hàng năm", recurrence("yearly"));
example("recurrence", "mỗi giờ", recurrence("hourly"));
example("recurrence", "mỗi 2 tuần", recurrence("weekly", { interval: 2 }));
example("recurrence", "2 tuần một lần", recurrence("weekly", { interval: 2 }));
example("recurrence", "2 tuần 1 lần", recurrence("weekly", { interval: 2 }));
example("recurrence", "cách tuần", recurrence("weekly", { interval: 2 }));
example("recurrence", "cách ngày", recurrence("daily", { interval: 2 }));
example("recurrence", "3 lần một tuần", recurrence("weekly", { timesPer: 3 }));
example("recurrence", "3 lần/tuần", recurrence("weekly", { timesPer: 3 }));
example("recurrence", "2 lần một ngày", recurrence("daily", { timesPer: 2 }));
example("recurrence", "mỗi thứ hai và thứ tư", recurrence("weekly", { byDay: ["MO", "WE"] }));
example("recurrence", "thứ hai, tư, sáu hàng tuần", recurrence("weekly", { byDay: ["MO", "WE", "FR"] }));
example("recurrence", "mỗi thứ hai lúc 8 giờ tối", {
  ...recurrence("weekly", { byDay: ["MO"] }),
  time: clock(20),
});
example("recurrence", "hàng ngày lúc 7h sáng", {
  ...recurrence("daily"),
  time: clock(7),
});
example("recurrence", "mỗi cuối tuần", recurrence("weekly", { byDay: WEEKEND }));
example("recurrence", "mỗi ngày thường", recurrence("weekly", { byDay: WEEKDAYS }));

// 28. recurrence-monthly-yearly
example("recurrence-monthly-yearly", "ngày 15 hàng tháng", recurrence("monthly", { byMonthDay: [15] }));
example("recurrence-monthly-yearly", "mỗi tháng ngày 15", recurrence("monthly", { byMonthDay: [15] }));
example("recurrence-monthly-yearly", "ngày 1 và 15 hàng tháng", recurrence("monthly", { byMonthDay: [1, 15] }));
example("recurrence-monthly-yearly", "thứ hai đầu tiên hàng tháng", recurrence("monthly", { byDay: ["MO"], bySetPos: [1] }));
example("recurrence-monthly-yearly", "thứ sáu cuối cùng mỗi tháng", recurrence("monthly", { byDay: ["FR"], bySetPos: [-1] }));
example("recurrence-monthly-yearly", "26/3 hàng năm", recurrence("yearly", { byMonth: [3], byMonthDay: [26] }));
example("recurrence-monthly-yearly", "hàng năm vào ngày 26 tháng 3", recurrence("yearly", { byMonth: [3], byMonthDay: [26] }));
example("recurrence-monthly-yearly", "cuối tháng hàng tháng", recurrence("monthly", { byMonthDay: [-1] }));

// 29. recurrence-bound
example("recurrence-bound", "mỗi thứ hai bắt đầu từ 1/10", recurrence("weekly", { byDay: ["MO"], start: calendar(10, 1) }));
example("recurrence-bound", "hàng tuần kể từ tuần sau", recurrence("weekly", { start: unit("week", "next") }));
example("recurrence-bound", "mỗi thứ hai đến hết tháng 12", recurrence("weekly", { byDay: ["MO"], until: calendar(12) }));
example("recurrence-bound", "mỗi thứ hai cho đến 31/12", recurrence("weekly", { byDay: ["MO"], until: calendar(12, 31) }));
example("recurrence-bound", "mỗi ngày tới thứ sáu", recurrence("daily", { until: weekday("FR") }));
example("recurrence-bound", "mỗi thứ hai trong 10 tuần", recurrence("weekly", { byDay: ["MO"], span: { amount: 10, unit: "week" } }));
example("recurrence-bound", "mỗi thứ hai, 6 lần", recurrence("weekly", { byDay: ["MO"], count: 6 }));
example("recurrence-bound", "hàng ngày từ nay đến cuối tháng", recurrence("daily", { start: { kind: "now" }, until: unit("month", "this", "end") }));

// 30. recurrence-except
example("recurrence-except", "mỗi ngày trừ chủ nhật", recurrence("daily", { except: [weekday("SU")] }));
example("recurrence-except", "các ngày thường trừ thứ sáu", recurrence("weekly", { byDay: WEEKDAYS, except: [weekday("FR")] }));
example("recurrence-except", "mỗi ngày ngoại trừ cuối tuần", recurrence("daily", { except: [{ kind: "dayGroup", group: "weekend" }] }));
example("recurrence-except", "mỗi thứ bảy trừ tuần cuối tháng", recurrence("weekly", {
  byDay: ["SA"],
  except: [{ kind: "ordinalWeekday", ordinal: -1, day: "SA", of: { kind: "relativeUnit", unit: "month", modifier: "this" }, recurring: true }],
}));

// 31. combined
example("combined", "3 giờ chiều mai", { date: relative(1), time: clock(15) });
example("combined", "mai 3 giờ chiều", { date: relative(1), time: clock(15) });
example("combined", "9h sáng thứ hai", { date: weekday("MO"), time: clock(9) });
example("combined", "thứ sáu tuần sau lúc 9h", { date: weekdayMod("next", "FR"), time: clock(9) });
example("combined", "15/3 lúc 14h", { date: calendar(3, 15), time: clock(14) });
example("combined", "tối mai 8 giờ", { date: relative(1), time: clock(20) });
example("combined", "chiều thứ tư lúc 2 giờ", { date: weekday("WE"), time: clock(14) });
example("combined", "ngày 20 tháng 11 lúc 7 giờ sáng", { date: calendar(11, 20), time: clock(7) });
example("combined", "sáng mai từ 8h đến 10h", { date: relative(1), time: window(8, 10) });
example("combined", "mùng 1 Tết lúc 12 giờ đêm", { date: lunar(1, 1), time: clock(0) });
example("combined", "Giáng sinh lúc 7 giờ tối", { date: holiday("christmas"), time: clock(19) });
example("combined", "cuối tuần sau lúc 10h sáng", {
  date: { kind: "dayGroup", group: "weekend", modifier: "next" },
  time: clock(10),
});

// 32. multi-clause
example(
  "multi-clause",
  "thứ hai 9h và thứ tư 10h",
  { date: weekday("MO"), time: clock(9) },
  { date: weekday("WE"), time: clock(10) },
);
example(
  "multi-clause",
  "thứ hai 9h, thứ tư 10h, thứ sáu 11h",
  { date: weekday("MO"), time: clock(9) },
  { date: weekday("WE"), time: clock(10) },
  { date: weekday("FR"), time: clock(11) },
);
example(
  "multi-clause",
  "thứ bảy chủ nhật từ 1 giờ đến 8 giờ tối và thứ hai từ 10 giờ tối đến 12 giờ đêm",
  { date: weekday("SA", "SU"), time: window(13, 20) },
  { date: weekday("MO"), time: window(22, 0) },
);

// 33. prose
example("prose", "nhắc tôi họp lúc 3 giờ chiều mai", { date: relative(1), time: clock(15) });
example("prose", "hẹn bác sĩ vào thứ hai tuần sau lúc 9h sáng", { date: weekdayMod("next", "MO"), time: clock(9) });
example("prose", "deadline nộp báo cáo là 17h thứ sáu", { date: weekday("FR"), time: clock(17) });
example("prose", "họp nhóm mỗi thứ tư lúc 2 giờ chiều", { ...recurrence("weekly", { byDay: ["WE"] }), time: clock(14) });
example("prose", "cả nhà về quê ăn Tết", { date: holiday("tet") });
example("prose", "sinh nhật em ấy là ngày 20 tháng 11", { date: calendar(11, 20) });
example("prose", "tàu khởi hành lúc 6 giờ 15 sáng mai", { date: relative(1), time: clock(6, 15) });
example("prose", "đặt bàn 4 người tối thứ bảy lúc 7 giờ", { date: weekday("SA"), time: clock(19) });
example("prose", "gọi lại cho anh sau 30 phút nữa", shift(30, "minute", "after"));
example("prose", "lớp yoga diễn ra 3 lần một tuần", recurrence("weekly", { timesPer: 3 }));

// 34. chat-short
example("chat-short", "t2 9h", { date: weekday("MO"), time: clock(9) });
example("chat-short", "cn 3h chiều", { date: weekday("SU"), time: clock(15) });
example("chat-short", "mai 8h", { date: relative(1), time: clock(8) });
example("chat-short", "tối nay 8h", { date: relative(0), time: clock(20) });
example("chat-short", "t6 tuần sau", { date: weekdayMod("next", "FR") });
example("chat-short", "15/3 14h", { date: calendar(3, 15), time: clock(14) });
example("chat-short", "2h nữa", shift(2, "hour", "after"));
example("chat-short", "sáng mai 7h30", { date: relative(1), time: clock(7, 30) });

// 35. negative — no time expression at all
negative("năm người đi ăn tối");
negative("chiều cao của anh ấy là 1m75");
negative("tối đa 3 người một phòng");
negative("hoa mai nở rộ");
negative("số 15 đường 3/2");
negative("giá 15k một ly");
negative("gọi số 0912 345 678");
negative("phiên bản v2.3 đã phát hành");
negative("thứ này rất tốt");
negative("sáng tạo là chìa khoá");
negative("tôi 30 tuổi");
negative("đầu tư vào giáo dục");

writeFileSync(
  new URL("grammar.jsonl", gold),
  cases.map((value) => JSON.stringify(value)).join("\n") + "\n",
);
console.log(
  `Authored ${cases.length} Vietnamese grammar cases across ${new Set(cases.map((value) => value.family)).size} families.`,
);
