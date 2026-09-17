import type {
  Clause,
  DateSpec,
  DayPart,
  HolidayName,
  Recurrence,
  TimeSpec,
  Unit,
  Weekday,
} from "../../core/src/types.ts";

// Typed builders shared by the gold seed scripts, so every expected schedule
// type-checks against core's Schedule.

export const clock = (hour: number, minute = 0): TimeSpec => ({
  start: { hour, minute },
});
export const named = (name: "noon" | "midnight"): TimeSpec => ({
  start: { named: name },
});
export const part = (name: DayPart): TimeSpec => ({ start: { part: name } });
export const window = (
  start: number,
  end: number,
  startMinute = 0,
  endMinute = 0,
): TimeSpec => ({
  start: { hour: start, minute: startMinute },
  end: { hour: end, minute: endMinute },
});
export const weekday = (...days: Weekday[]): DateSpec => ({
  kind: "weekday",
  days,
});
export const weekdayMod = (
  modifier: "this" | "next" | "last",
  ...days: Weekday[]
): DateSpec => ({ kind: "weekday", days, modifier });
export const relative = (offset: number): DateSpec => ({
  kind: "relativeDay",
  offset,
});
export const unit = (
  unit: Unit,
  modifier: "this" | "next" | "last",
  edge?: "start" | "end",
): DateSpec => ({
  kind: "relativeUnit",
  unit,
  modifier,
  ...(edge ? { edge } : {}),
});
export const shift = (
  amount: number,
  unit: Unit,
  direction: "before" | "after",
  extra: Partial<NonNullable<Clause["shift"]>> = {},
): Clause => ({ shift: { amount, unit, direction, ...extra } });
export const duration = (amount: number, unit: Unit): Clause => ({
  duration: { amount, unit },
});
export const recurrence = (
  freq: Recurrence["freq"],
  extra: Partial<Recurrence> = {},
): Clause => ({ recurrence: { freq, interval: 1, ...extra } });
export const calendar = (
  month: number,
  day?: number,
  year?: number,
): DateSpec => ({
  kind: "calendar",
  month,
  ...(day === undefined ? {} : { day }),
  ...(year === undefined ? {} : { year }),
});
export const lunar = (
  month?: number,
  day?: number,
  year?: number,
): DateSpec => ({
  kind: "lunar",
  ...(month === undefined ? {} : { month }),
  ...(day === undefined ? {} : { day }),
  ...(year === undefined ? {} : { year }),
});
export const holiday = (name: HolidayName): DateSpec => ({
  kind: "holiday",
  name,
});
export const range = (
  from: { month?: number; day?: number; year?: number },
  to: { month?: number; day?: number; year?: number },
): DateSpec => ({ kind: "calendarRange", from, to });
export const WEEKDAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR"];
export const WEEKEND: Weekday[] = ["SA", "SU"];
