import type {
  CalendarDate,
  DateSpec,
  HolidayName,
  Modifier,
  ResolveOptions,
  Unit,
  Weekday,
} from "./types.js";
import { weekdays } from "./lexicon.js";
import { lunarMonthLength, lunarToSolar, solarToLunar } from "./lunar.js";
import {
  addDays,
  addMonths,
  dayOfWeek,
  daysInMonth,
  fromUTC,
  startOfDay,
  utc,
  valid,
  type Civil,
} from "./zoned.js";

export interface LocalPeriod {
  start: Civil;
  /** An exclusive end, used for date ranges and whole calendar periods. */
  end?: Civil;
}

// Solar holidays are [month, day]. Lunar ones carry a lunar month and day
// and resolve through lunar.ts (Task 9); until then they raise.
const holidays: Record<
  HolidayName,
  readonly [number, number] | { lunarMonth: number; lunarDay: number }
> = {
  "new-year": [1, 1],
  valentines: [2, 14],
  "womens-day": [3, 8],
  "liberation-day": [4, 30],
  "labour-day": [5, 1],
  "childrens-day": [6, 1],
  "national-day": [9, 2],
  "vn-womens-day": [10, 20],
  "teachers-day": [11, 20],
  christmas: [12, 25],
  "christmas-eve": [12, 24],
  "new-years-eve": [12, 31],
  tet: { lunarMonth: 1, lunarDay: 1 },
  // Resolved as the day before Tết, so the lunar day is only a placeholder.
  "tet-eve": { lunarMonth: 1, lunarDay: 0 },
  "lantern-festival": { lunarMonth: 1, lunarDay: 15 },
  "hung-kings": { lunarMonth: 3, lunarDay: 10 },
  "doan-ngo": { lunarMonth: 5, lunarDay: 5 },
  "vu-lan": { lunarMonth: 7, lunarDay: 15 },
  "mid-autumn": { lunarMonth: 8, lunarDay: 15 },
  "kitchen-gods": { lunarMonth: 12, lunarDay: 23 },
};

export function weekBeginning(
  date: Civil,
  weekStart: "MO" | "SU" = "MO",
): Civil {
  const firstDay = weekStart === "SU" ? 6 : 0;
  return addDays(startOfDay(date), -((dayOfWeek(date) - firstDay + 7) % 7));
}

function weekdayDate(
  day: Weekday,
  modifier: Modifier | undefined,
  reference: Civil,
  options: ResolveOptions,
): Civil {
  const target = weekdays.indexOf(day);
  const current = dayOfWeek(reference);
  const future = (target - current + 7) % 7;
  const weekStart = options.weekStart === "SU" ? 6 : 0;
  const position = (target - weekStart + 7) % 7;

  if (
    modifier === "this" ||
    (!modifier && options.bareWeekday === "thisWeek")
  ) {
    return addDays(weekBeginning(reference, options.weekStart), position);
  }
  if (modifier === "last") {
    return addDays(startOfDay(reference), -((current - target + 7) % 7 || 7));
  }
  if (modifier === "next") {
    if (options.nextWeekday === "immediate")
      return addDays(startOfDay(reference), future || 7);
    return addDays(weekBeginning(reference, options.weekStart), 7 + position);
  }
  if (options.bareWeekday === "nearest") {
    return addDays(startOfDay(reference), future > 3 ? future - 7 : future);
  }
  return addDays(startOfDay(reference), future);
}

function calendarDate(spec: CalendarDate, reference: Civil): Civil {
  const date = {
    ...startOfDay(reference),
    year: spec.year ?? reference.year,
    month: spec.month ?? reference.month,
    day: spec.day ?? 1,
  };

  if (!valid(date))
    throw new RangeError("The expression names an invalid calendar date.");
  return date;
}

export function addCivil(date: Civil, amount: number, unit: Unit): Civil {
  switch (unit) {
    case "second":
      return fromUTC(utc(date) + amount * 1000);
    case "minute":
      return fromUTC(utc(date) + amount * 60_000);
    case "hour":
      return fromUTC(utc(date) + amount * 3_600_000);
    case "day":
      return addDays(date, amount);
    case "week":
      return addDays(date, amount * 7);
    case "month":
      return addMonths(date, amount);
    case "year":
      return addMonths(date, amount * 12);
  }
}

function relativePeriod(
  spec: Extract<DateSpec, { kind: "relativeUnit" }>,
  reference: Civil,
  options: ResolveOptions,
): LocalPeriod {
  let beginning = startOfDay(reference);
  if (spec.unit === "week")
    beginning = weekBeginning(reference, options.weekStart);
  if (spec.unit === "month") beginning.day = 1;
  if (spec.unit === "year") beginning = { ...beginning, month: 1, day: 1 };
  if (spec.unit === "hour") beginning = { ...reference, minute: 0, second: 0 };
  if (spec.unit === "minute") beginning = { ...reference, second: 0 };
  if (spec.unit === "second") beginning = { ...reference };

  const offset =
    spec.modifier === "next" ? 1 : spec.modifier === "last" ? -1 : 0;
  const start = addCivil(beginning, offset, spec.unit);
  const end = addCivil(start, 1, spec.unit);

  if (spec.edge === "start") return { start };
  if (spec.edge === "end") {
    const isClockUnit =
      spec.unit === "second" || spec.unit === "minute" || spec.unit === "hour";
    return { start: isClockUnit ? fromUTC(utc(end) - 1000) : addDays(end, -1) };
  }
  return { start, end };
}

function lunarCivil(
  day: number,
  month: number,
  year: number,
  leap: boolean,
  reference: Civil,
): Civil {
  const solar =
    lunarToSolar(day, month, year, leap) ??
    // A leap month the year does not have reads as the ordinary month.
    (leap ? lunarToSolar(day, month, year, false) : undefined);
  if (!solar)
    throw new RangeError("The expression names an invalid lunar date.");
  return { ...startOfDay(reference), ...solar };
}

/** The lunar month after the given one, leap months included. */
function nextLunarMonth(
  month: number,
  year: number,
  leap: boolean,
  reference: Civil,
) {
  const start = lunarCivil(1, month, year, leap, reference);
  const next = addDays(start, lunarMonthLength(month, year, leap));
  return solarToLunar(next.day, next.month, next.year);
}

/**
 * A lunar date with missing fields names the next such date on or after
 * today, like a solar one. A month without a day is that month's first day.
 */
function resolveLunar(
  spec: { year?: number; month?: number; day?: number; leap?: boolean },
  today: Civil,
): LocalPeriod {
  const leap = spec.leap ?? false;
  if (spec.year !== undefined) {
    if (spec.month === undefined) {
      const start = lunarCivil(1, 1, spec.year, false, today);
      return { start, end: lunarCivil(1, 1, spec.year + 1, false, today) };
    }
    return {
      start: lunarCivil(spec.day ?? 1, spec.month, spec.year, leap, today),
    };
  }
  const current = solarToLunar(today.day, today.month, today.year);
  if (spec.month !== undefined) {
    for (const year of [current.year, current.year + 1]) {
      const date = lunarCivil(spec.day ?? 1, spec.month, year, leap, today);
      if (utc(date) >= utc(today)) return { start: date };
    }
  }
  if (spec.day !== undefined) {
    // "mùng 5", "rằm": this lunar month, or the next one that has the day.
    let cursor = {
      month: current.month,
      year: current.year,
      leap: current.leap,
    };
    for (let step = 0; step < 3; step++) {
      const solar = lunarToSolar(
        spec.day,
        cursor.month,
        cursor.year,
        cursor.leap,
      );
      if (solar) {
        const date = { ...startOfDay(today), ...solar };
        if (utc(date) >= utc(today)) return { start: date };
      }
      cursor = nextLunarMonth(cursor.month, cursor.year, cursor.leap, today);
    }
  }
  throw new RangeError("The expression names an invalid lunar date.");
}

function lunarRange(
  from: CalendarDate,
  to: CalendarDate,
  today: Civil,
): LocalPeriod {
  const start = resolveLunar(from, today).start;
  const lunarStart = solarToLunar(start.day, start.month, start.year);
  const month = to.month ?? lunarStart.month;
  let end = lunarCivil(
    to.day ?? 1,
    month,
    to.year ?? lunarStart.year,
    false,
    today,
  );
  if (utc(end) < utc(start) && to.year === undefined)
    end = lunarCivil(to.day ?? 1, month, lunarStart.year + 1, false, today);
  if (utc(end) < utc(start))
    throw new RangeError("A date range must end on or after its start date.");
  return { start, end: addDays(end, 1) };
}

export function resolveDates(
  spec: DateSpec | undefined,
  reference: Civil,
  options: ResolveOptions,
): LocalPeriod[] {
  const today = startOfDay(reference);
  if (!spec) return [{ start: today }];

  switch (spec.kind) {
    case "now":
      return [{ start: reference }];

    case "relativeDay":
      return [{ start: addDays(today, spec.offset) }];

    case "weekday":
      return spec.days.map((day) => ({
        start: weekdayDate(day, spec.modifier, reference, options),
      }));

    case "weekdayRange": {
      const start = weekdayDate(spec.from, undefined, reference, options);
      const length =
        ((weekdays.indexOf(spec.to) - weekdays.indexOf(spec.from) + 7) % 7) + 1;
      return [{ start, end: addDays(start, length) }];
    }

    case "dayGroup": {
      const selectedDays =
        spec.group === "weekend" ? weekdays.slice(5) : weekdays.slice(0, 5);
      if (spec.modifier) {
        let start = weekdayDate(selectedDays[0], "this", reference, options);
        if (spec.modifier === "last") start = addDays(start, -7);
        if (spec.modifier === "next") {
          const upcoming =
            options.nextWeekday === "immediate" && utc(start) > utc(today);
          if (!upcoming) start = addDays(start, 7);
        }
        return selectedDays.map((_, index) => ({
          start: addDays(start, index),
        }));
      }
      return selectedDays.map((day) => ({
        start: weekdayDate(day, spec.modifier, reference, options),
      }));
    }

    case "calendar": {
      const date = calendarDate(spec, reference);
      // Without a year, "January 2" and "the 3rd" name the next such date.
      if (spec.year === undefined && utc(date) < utc(today))
        return [
          {
            start: calendarDate(
              spec,
              addCivil(
                reference,
                1,
                spec.month === undefined ? "month" : "year",
              ),
            ),
          },
        ];
      return [{ start: date }];
    }

    case "calendarPeriod": {
      let year = spec.year ?? reference.year;
      if (spec.year === undefined && spec.modifier === "next")
        year += spec.month <= reference.month ? 1 : 0;
      if (spec.year === undefined && spec.modifier === "last")
        year -= spec.month >= reference.month ? 1 : 0;
      let beginning = calendarDate(
        { year, month: spec.month, day: 1 },
        reference,
      );
      let end = addMonths(beginning, 1);
      // Without a year or modifier, a month that has passed is next year's.
      if (
        spec.year === undefined &&
        spec.modifier === undefined &&
        utc(end) <= utc(today)
      ) {
        beginning = addMonths(beginning, 12);
        end = addMonths(end, 12);
      }
      if (spec.edge === "start") return [{ start: beginning }];
      if (spec.edge === "end") return [{ start: addDays(end, -1) }];
      if (spec.week !== undefined) {
        const start = addDays(beginning, (spec.week - 1) * 7);
        if (spec.week < 1 || spec.week > 5 || start.month !== beginning.month)
          throw new RangeError(
            "The requested week does not exist in that month.",
          );
        const next = addDays(start, 7);
        return [{ start, end: utc(next) < utc(end) ? next : end }];
      }
      return [{ start: beginning, end }];
    }

    case "relativeUnit":
      return [relativePeriod(spec, reference, options)];

    case "lunar":
      return [resolveLunar(spec, today)];

    case "holiday": {
      const entry = holidays[spec.name];
      if ("lunarMonth" in entry) {
        if (spec.name === "tet-eve") {
          // The last day of the lunar year: the day before the next Tết,
          // unless that is today.
          const current = solarToLunar(today.day, today.month, today.year);
          for (const year of [current.year, current.year + 1]) {
            const eve = addDays(lunarCivil(1, 1, year, false, today), -1);
            if (utc(eve) >= utc(today)) return [{ start: eve }];
          }
        }
        return [
          resolveLunar({ month: entry.lunarMonth, day: entry.lunarDay }, today),
        ];
      }
      const inYear = (year: number): Civil =>
        calendarDate({ year, month: entry[0], day: entry[1] }, reference);
      let date = inYear(reference.year);
      if (utc(date) < utc(today)) date = inYear(reference.year + 1);
      return [{ start: date }];
    }

    case "ordinalWeekday": {
      const beginning =
        spec.of.kind === "calendar"
          ? calendarDate({ ...spec.of, day: 1 }, reference)
          : relativePeriod(spec.of, reference, options).start;
      const target = weekdays.indexOf(spec.day);
      let date: Civil;

      if (spec.ordinal > 0) {
        date = addDays(
          beginning,
          ((target - dayOfWeek(beginning) + 7) % 7) + (spec.ordinal - 1) * 7,
        );
      } else {
        const last = {
          ...beginning,
          day: daysInMonth(beginning.year, beginning.month),
        };
        date = addDays(
          last,
          -((dayOfWeek(last) - target + 7) % 7) + (spec.ordinal + 1) * 7,
        );
      }

      if (
        !Number.isInteger(spec.ordinal) ||
        spec.ordinal === 0 ||
        date.month !== beginning.month
      ) {
        throw new RangeError(
          "The requested ordinal weekday does not exist in that month.",
        );
      }
      return [{ start: date }];
    }

    case "calendarRange": {
      if (spec.lunar) return [lunarRange(spec.from, spec.to, today)];
      const start = calendarDate(spec.from, reference);
      let end = calendarDate({ month: start.month, ...spec.to }, start);

      if (
        utc(end) < utc(start) &&
        spec.to.year === undefined &&
        spec.to.month !== undefined
      ) {
        end = calendarDate({ ...spec.to, year: start.year + 1 }, start);
      }
      if (utc(end) < utc(start))
        throw new RangeError(
          "A date range must end on or after its start date.",
        );
      // A range without any year that has fully passed is next year's.
      if (
        spec.from.year === undefined &&
        spec.to.year === undefined &&
        utc(addDays(end, 1)) <= utc(today)
      )
        return [
          { start: addMonths(start, 12), end: addDays(addMonths(end, 12), 1) },
        ];

      return [{ start, end: addDays(end, 1) }];
    }
  }
}
