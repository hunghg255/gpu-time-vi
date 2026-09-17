import { Role, labelId } from "./labels.js";
import type {
  CalendarDate,
  Clause,
  ClockTime,
  DateSpec,
  DayPart,
  Diagnostic,
  Expression,
  Modifier,
  ParserOptions,
  Recurrence,
  Schedule,
  Shift,
  TimeSpec,
  Token as SourceToken,
  PredictionToken as Token,
  Unit,
  Weekday,
} from "./types.js";
import {
  dayGroups,
  dayParts,
  edges,
  holiday as holidayName,
  key,
  lunarMonthWords,
  modifiers,
  month as monthNumber,
  namedTimes,
  nowWords,
  number,
  relativeDays,
  spelledNumber,
  unit as unitName,
  weekday as weekdayCode,
  weekdayAfterThu,
  weekdays,
} from "./lexicon.js";
import { readDuration, readNumber } from "./quantity.js";

// Words the model may leave as O inside an expression without it counting as
// ignored text. "khoảng" and friends also make a following quantity loose.
const approximately = new Set(["khoảng", "tầm", "chừng", "độ", "cỡ", "gần"]);
const filler = new Set([
  ...approximately,
  "lúc",
  "vào",
  "hồi",
  "nhằm",
  "là",
  "của",
  "và",
  "rồi",
  "thì",
  "ngày",
  "buổi",
  "đúng",
  "vừa",
  ",",
  ";",
  "&",
  ":",
  "-",
  "–",
  "—",
  ".",
  "/",
]);
const asideLimit = 3;

const unitFrequencies: Partial<Record<Unit, Recurrence["freq"]>> = {
  hour: "hourly",
  day: "daily",
  week: "weekly",
  month: "monthly",
  year: "yearly",
};
const dateRoles = new Set([
  Role.NOW,
  Role.REL_DAY,
  Role.WEEKDAY,
  Role.DAYGROUP,
  Role.MONTH,
  Role.DOM,
  Role.YEAR,
  Role.HOLIDAY,
  Role.LUNAR,
  Role.EDGE,
]);
const clockRoles = new Set([
  Role.HOUR,
  Role.TIME_NAMED,
  Role.DAYPART,
  Role.MERIDIEM,
]);
const skipped = new Set([Role.O, Role.GLUE, Role.JOIN]);

class CompileError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
  }
}
function diagnostic(
  token: Token,
  code: string,
  message: string,
  severity: Diagnostic["severity"] = "error",
): Diagnostic {
  return { code, message, start: token.start, end: token.end, severity };
}
function fail(token: Token, code: string, message: string): never {
  throw new CompileError(diagnostic(token, code, message));
}

// ---------------------------------------------------------------------------
// Segments: consecutive non-whitespace tokens with the same role, so "thứ hai",
// "hai mươi mốt" and "âm lịch" each arrive as one unit.

interface Segment {
  role: Role;
  tokens: Token[];
  text: string;
}

function phrase(tokens: Token[]): string {
  let text = "";
  for (let index = 0; index < tokens.length; index++) {
    if (index && tokens[index].start > tokens[index - 1].end) text += " ";
    text += tokens[index].text;
  }
  return key(text);
}

function segment(tokens: Token[]): Segment[] {
  const result: Segment[] = [];
  for (const token of tokens) {
    if (token.kind === 3) continue;
    const last = result.at(-1);
    const digits = token.kind === 1 && last?.tokens.at(-1)?.kind === 1;
    // Same role continues a segment, except two digit runs ("15 3") and
    // repeated separators, which never form one word.
    if (
      last &&
      last.role === token.label &&
      !digits &&
      !skipped.has(token.label)
    )
      last.tokens.push(token);
    else result.push({ role: token.label, tokens: [token], text: "" });
  }
  for (const item of result) item.text = phrase(item.tokens);
  return result;
}

class Reader {
  index = 0;
  constructor(readonly segments: Segment[]) {}
  peek(offset = 0): Segment | undefined {
    let position = this.index;
    let remaining = offset;
    while (position < this.segments.length) {
      const candidate = this.segments[position];
      if (!skipped.has(candidate.role)) {
        if (remaining === 0) return candidate;
        remaining--;
      }
      position++;
    }
    return undefined;
  }
  role(offset = 0): Role | undefined {
    return this.peek(offset)?.role;
  }
  /** The raw segment right before the cursor, filler included. */
  previous(): Segment | undefined {
    return this.segments[this.index - 1];
  }
  take(): Segment {
    while (skipped.has(this.segments[this.index].role)) this.index++;
    return this.segments[this.index++];
  }
  get done(): boolean {
    return this.peek() === undefined;
  }
  /** The tokens from the cursor on, filler removed, for the quantity readers. */
  segmentsFrom(): Token[] {
    const tokens: Token[] = [];
    for (
      let position = this.index;
      position < this.segments.length;
      position++
    ) {
      const item = this.segments[position];
      if (!skipped.has(item.role)) tokens.push(...item.tokens);
    }
    return tokens;
  }
  /** Advance past `consumed` tokens returned by `segmentsFrom()`. */
  skipQuantity(consumed: number): void {
    let remaining = consumed;
    while (remaining > 0) remaining -= this.take().tokens.length;
  }
}

const first = (segment: Segment) => segment.tokens[0];

// ---------------------------------------------------------------------------
// Numbers and small readers

function segmentNumber(segment: Segment): number {
  const words = segment.tokens.map((token) => key(token.text));
  const value = spelledNumber(words);
  if (!Number.isFinite(value))
    fail(first(segment), "invalid-number", `Cannot read ${segment.text}.`);
  return value;
}

function ordinalValue(segment: Segment): number {
  const text = segment.text.replace(/^thứ\s+/, "");
  if (["đầu", "đầu tiên", "nhất", "thứ nhất"].includes(text)) return 1;
  if (["cuối", "cuối cùng", "chót"].includes(text)) return -1;
  const value = spelledNumber(text.split(" "));
  if (!Number.isInteger(value) || value < 1 || value > 5)
    fail(first(segment), "invalid-ordinal", `Cannot read ${segment.text}.`);
  return value;
}

/** "thứ hai", "thứ hai thứ tư", "thứ 2, 4", "t7 cn" → codes. */
function readWeekdays(segment: Segment, continuing = false): Weekday[] {
  const words = segment.tokens.map((token) => key(token.text));
  const result: Weekday[] = [];
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const pair = weekdayCode(`${word} ${words[index + 1] ?? ""}`);
    if (pair) {
      result.push(pair);
      index++;
      continue;
    }
    const single = weekdayCode(word);
    if (single) {
      result.push(single);
      continue;
    }
    // "thứ hai, tư, sáu": a bare number after an earlier weekday.
    const bare =
      result.length || continuing ? weekdayAfterThu(word) : undefined;
    if (!bare)
      fail(
        segment.tokens[index],
        "invalid-weekday",
        `Unknown weekday ${word}.`,
      );
    result.push(bare);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Clocks

interface ParsedClock {
  value: ClockTime;
  meridiem?: string;
  token: Token;
}

// Each part folds a twelve-hour reading onto the day; hours already past
// twelve keep their value.
function applyMeridiem(hour: number, part: string): number | undefined {
  if (hour > 12) return hour;
  switch (part) {
    case "sáng":
    case "am":
      return hour === 12 ? 0 : hour;
    case "trưa":
      return hour <= 2 ? hour + 12 : hour;
    case "chiều":
      return hour < 12 ? hour + 12 : hour;
    case "tối":
      return hour === 12 ? 0 : hour < 12 ? hour + 12 : hour;
    case "đêm":
    case "khuya":
      return hour === 12 ? 0 : hour >= 5 ? hour + 12 : hour;
    case "pm":
      return hour === 12 ? 12 : hour + 12;
  }
  return undefined;
}

function meridiemWord(segment: Segment): string {
  const text = segment.text.replace(/\./g, "").replace(/^buổi\s+/, "");
  return text === "a m" ? "am" : text === "p m" ? "pm" : text;
}

function readClock(reader: Reader, pending?: Segment): ParsedClock {
  const hourSegment = reader.take();
  const token = first(hourSegment);
  let hour = segmentNumber(hourSegment);
  let minute = 0;
  let second: number | undefined;
  if (reader.role() === Role.MINUTE) minute = segmentNumber(reader.take());
  if (reader.role() === Role.SECOND) second = segmentNumber(reader.take());
  while (reader.role() === Role.CLOCK_OFFSET) {
    const offset = reader.take();
    if (offset.text === "rưỡi") minute += 30;
    else if (offset.text === "kém" || offset.text === "hơn") {
      if (reader.role() !== Role.MINUTE)
        fail(first(offset), "invalid-time", "Expected minutes after kém/hơn.");
      const amount = segmentNumber(reader.take());
      if (offset.text === "kém") {
        hour -= 1;
        minute = 60 - amount;
      } else minute += amount;
    } else
      fail(first(offset), "invalid-time", `Unknown offset ${offset.text}.`);
  }
  let meridiem: string | undefined;
  let meridiemToken: Token | undefined;
  const following = reader.peek();
  if (
    following &&
    (following.role === Role.MERIDIEM || following.role === Role.DAYPART) &&
    applyMeridiem(0, meridiemWord(following)) !== undefined
  ) {
    meridiem = meridiemWord(reader.take());
    meridiemToken = first(following);
  } else if (pending) {
    meridiem = meridiemWord(pending);
    meridiemToken = first(pending);
  }
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59)
    fail(token, "invalid-time", "Clock components are out of range.");
  if (meridiem) {
    const folded = applyMeridiem(hour, meridiem);
    if (folded === undefined)
      fail(meridiemToken!, "invalid-time", `Unknown day part ${meridiem}.`);
    hour = folded;
  }
  if (hour === 24) hour = 0;
  return {
    value: { hour, minute, ...(second === undefined ? {} : { second }) },
    meridiem,
    token,
  };
}

/** "9 đến 5 chiều": the start borrows the end's part when that keeps it earlier. */
function inheritMeridiem(start: ParsedClock, end: ParsedClock): void {
  if (start.meridiem || !end.meridiem || !("hour" in start.value)) return;
  if (!("hour" in end.value)) return;
  const folded = applyMeridiem(start.value.hour, end.meridiem);
  if (folded !== undefined && folded < end.value.hour)
    start.value.hour = folded;
}

// ---------------------------------------------------------------------------
// Dates

interface DateState {
  now?: boolean;
  offset?: number;
  days?: Weekday[];
  modifier?: Modifier;
  unit?: Unit;
  edge?: "start" | "end" | "middle";
  group?: "weekday" | "weekend";
  day?: number;
  month?: number;
  year?: number;
  lunar?: boolean;
  leap?: boolean;
  holiday?: DateSpec & { kind: "holiday" };
  ordinal?: number;
  week?: number;
  /** "ngày 1 và 15": further days of the month after the first. */
  moreDays?: number[];
  token: Token;
}

function readModifier(segment: Segment): Modifier {
  const value = modifiers[segment.text];
  if (!value)
    fail(
      first(segment),
      "invalid-modifier",
      `Unknown modifier ${segment.text}.`,
    );
  return value;
}

function readUnit(segment: Segment): Unit {
  const value = unitName(segment.text) ?? unitName(segment.tokens[0].text);
  if (!value)
    fail(first(segment), "invalid-unit", `Unknown unit ${segment.text}.`);
  return value;
}

/**
 * Consume one date phrase. Calendar fields (ngày, tháng, năm, âm lịch, Tết)
 * gather in any order; the other kinds are single phrases with an optional
 * trailing modifier.
 */
function readDate(reader: Reader): DateState {
  const state: DateState = { token: first(reader.peek()!) };
  const takeCalendar = () => {
    for (;;) {
      const next = reader.peek();
      if (!next) return;
      if (next.role === Role.DOM) {
        if (state.day !== undefined) return;
        state.day = segmentNumber(reader.take());
      } else if (next.role === Role.MONTH) {
        if (state.month !== undefined) return;
        const value = monthNumber(next.text);
        if (!value)
          fail(first(next), "invalid-date", `Unknown month ${next.text}.`);
        state.month = value;
        if (lunarMonthWords.has(next.text)) state.lunar = true;
        reader.take();
      } else if (next.role === Role.YEAR) {
        if (state.year !== undefined) return;
        state.year = segmentNumber(reader.take());
      } else if (next.role === Role.LUNAR) {
        reader.take();
        state.lunar = true;
        if (next.text === "rằm") state.day ??= 15;
        if (next.text === "nhuận") state.leap = true;
      } else if (
        next.role === Role.HOLIDAY &&
        state.day !== undefined &&
        holidayName(next.text) === "tet"
      ) {
        // "mùng 1 Tết", "30 Tết": days of the lunar new year.
        reader.take();
        state.lunar = true;
        state.month ??= state.day >= 29 ? 12 : 1;
      } else return;
    }
  };
  const next = reader.peek()!;
  switch (next.role) {
    case Role.NOW:
      reader.take();
      state.now = true;
      return state;
    case Role.REL_DAY: {
      const segment = reader.take();
      const offset = relativeDays[segment.text];
      if (offset === undefined)
        fail(first(segment), "invalid-date", `Unknown day ${segment.text}.`);
      state.offset = offset;
      return state;
    }
    case Role.HOLIDAY: {
      const segment = reader.take();
      const name = holidayName(segment.text);
      if (!name)
        fail(
          first(segment),
          "invalid-date",
          `Unknown holiday ${segment.text}.`,
        );
      state.holiday = { kind: "holiday", name };
      return state;
    }
    case Role.DAYGROUP: {
      const segment = reader.take();
      const group = dayGroups[segment.text];
      if (!group)
        fail(
          first(segment),
          "invalid-date",
          `Unknown day group ${segment.text}.`,
        );
      state.group = group;
      if (reader.role() === Role.DEICTIC)
        state.modifier = readModifier(reader.take());
      return state;
    }
    case Role.WEEKDAY: {
      state.days = readWeekdays(reader.take());
      // "thứ hai và thứ tư", "thứ 2, 4"
      while (reader.role() === Role.WEEKDAY)
        state.days.push(...readWeekdays(reader.take(), true));
      if (reader.role() === Role.ORD) {
        state.ordinal = ordinalValue(reader.take());
        if (reader.role() === Role.MONTH) {
          takeCalendar();
          return state;
        }
      }
      if (reader.role() === Role.DEICTIC)
        state.modifier = readModifier(reader.take());
      else if (
        reader.role() === Role.UNIT &&
        ["week", "month"].includes(readUnit(reader.peek()!)) &&
        reader.role(1) === Role.DEICTIC
      ) {
        state.unit = readUnit(reader.take());
        state.modifier = readModifier(reader.take());
      } else if (reader.role() === Role.UNIT && state.ordinal !== undefined) {
        // "thứ sáu cuối tháng": the month itself is the container.
        state.unit = readUnit(reader.take());
      }
      return state;
    }
    case Role.EDGE: {
      const segment = reader.take();
      const edge = edges[segment.text];
      if (!edge)
        fail(first(segment), "invalid-date", `Unknown edge ${segment.text}.`);
      state.edge = edge;
      if (reader.role() === Role.UNIT) {
        state.unit = readUnit(reader.take());
        state.modifier =
          reader.role() === Role.DEICTIC ? readModifier(reader.take()) : "this";
        return state;
      }
      if (reader.role() === Role.MONTH) {
        takeCalendar();
        return state;
      }
      fail(first(segment), "invalid-date", "Expected a unit after the edge.");
    }
    case Role.UNIT: {
      // "tuần sau", "tuần thứ 2 của tháng 3", "tuần đầu tháng 3"
      const unit = readUnit(reader.peek()!);
      if (reader.role(1) === Role.DEICTIC) {
        reader.take();
        state.unit = unit;
        state.modifier = readModifier(reader.take());
        return state;
      }
      if (
        unit === "week" &&
        reader.role(1) === Role.ORD &&
        reader.role(2) === Role.MONTH
      ) {
        reader.take();
        const ordinal = ordinalValue(reader.take());
        if (ordinal < 1)
          fail(
            first(reader.previous()!),
            "invalid-date",
            "A week number must be positive.",
          );
        state.week = ordinal;
        takeCalendar();
        return state;
      }
      if (
        unit === "week" &&
        reader.role(1) === Role.ORD &&
        reader.role(2) === Role.UNIT
      ) {
        // "tuần cuối tháng": a week of the month, pinned to a weekday later.
        reader.take();
        state.week = ordinalValue(reader.take());
        state.unit = readUnit(reader.take());
        state.modifier =
          reader.role() === Role.DEICTIC ? readModifier(reader.take()) : "this";
        return state;
      }
      if (
        unit === "week" &&
        reader.role(1) === Role.EDGE &&
        reader.role(2) === Role.MONTH
      ) {
        reader.take();
        const edge = edges[reader.take().text];
        state.week = edge === "end" ? 5 : 1;
        takeCalendar();
        return state;
      }
      fail(
        first(reader.peek()!),
        "invalid-date",
        `Bare unit ${reader.peek()!.text}.`,
      );
    }
    default:
      takeCalendar();
      if (
        state.day === undefined &&
        state.month === undefined &&
        state.year === undefined &&
        !state.lunar
      )
        fail(
          first(next),
          "invalid-date",
          `Cannot read a date from ${next.text}.`,
        );
      // "tháng 3 năm sau", "tháng giêng năm tới"
      if (
        state.month !== undefined &&
        state.day === undefined &&
        reader.role() === Role.UNIT &&
        readUnit(reader.peek()!) === "year" &&
        reader.role(1) === Role.DEICTIC
      ) {
        state.unit = readUnit(reader.take());
        state.modifier = readModifier(reader.take());
      }
      return state;
  }
}

function validateCalendar(state: DateState): void {
  if (state.month !== undefined && (state.month < 1 || state.month > 12))
    fail(state.token, "invalid-date", "The month is out of range.");
  if (state.day !== undefined && (state.day < 1 || state.day > 31))
    fail(state.token, "invalid-date", "The day is out of range.");
  if (
    state.day !== undefined &&
    state.month !== undefined &&
    !state.lunar &&
    state.day >
      [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][state.month - 1]
  )
    fail(
      state.token,
      "invalid-date",
      "The day is out of range for that month.",
    );
  if (state.year !== undefined && (state.year < 1 || state.year > 9999))
    fail(state.token, "invalid-date", "The year is out of range.");
}

function calendarFields(state: DateState): CalendarDate {
  return {
    ...(state.year === undefined ? {} : { year: state.year }),
    ...(state.month === undefined ? {} : { month: state.month }),
    ...(state.day === undefined ? {} : { day: state.day }),
  };
}

function toDateSpec(state: DateState, recurring = false): DateSpec {
  if (state.now) return { kind: "now" };
  if (state.offset !== undefined)
    return { kind: "relativeDay", offset: state.offset };
  if (state.holiday) return state.holiday;
  if (state.group)
    return {
      kind: "dayGroup",
      group: state.group,
      ...(state.modifier ? { modifier: state.modifier } : {}),
    };
  if (state.days) {
    if (state.ordinal !== undefined) {
      validateCalendar(state);
      const of =
        state.month !== undefined
          ? {
              kind: "calendar" as const,
              month: state.month,
              ...(state.year === undefined ? {} : { year: state.year }),
            }
          : {
              kind: "relativeUnit" as const,
              unit: (state.unit ?? "month") as "month" | "year",
              modifier: state.modifier ?? "this",
            };
      return {
        kind: "ordinalWeekday",
        ordinal: state.ordinal,
        day: state.days[0],
        of,
        ...(recurring ? { recurring: true } : {}),
      };
    }
    return {
      kind: "weekday",
      days: state.days,
      ...(state.modifier ? { modifier: state.modifier } : {}),
    };
  }
  if (state.week !== undefined && state.unit === "month") {
    return {
      kind: "ordinalWeekday",
      ordinal: state.week,
      day: "MO",
      of: {
        kind: "relativeUnit",
        unit: "month",
        modifier: state.modifier ?? "this",
      },
      ...(recurring ? { recurring: true } : {}),
    };
  }
  if (state.week !== undefined) {
    validateCalendar(state);
    return {
      kind: "calendarPeriod",
      month: state.month!,
      ...(state.year === undefined ? {} : { year: state.year }),
      week: state.week,
    };
  }
  if (state.edge) {
    if (state.unit) {
      if (state.edge === "middle") {
        if (state.unit === "week")
          return {
            kind: "weekday",
            days: ["WE"],
            modifier: state.modifier ?? "this",
          };
        fail(
          state.token,
          "unsupported-edge",
          "The middle of a period has no fixed date.",
        );
      }
      return {
        kind: "relativeUnit",
        unit: state.unit,
        modifier: state.modifier ?? "this",
        edge: state.edge,
      };
    }
    validateCalendar(state);
    if (state.edge === "middle")
      return {
        kind: state.lunar ? "lunar" : "calendar",
        ...calendarFields(state),
        day: 15,
      };
    return {
      kind: "calendarPeriod",
      month: state.month!,
      ...(state.year === undefined ? {} : { year: state.year }),
      edge: state.edge,
    };
  }
  if (state.unit) {
    if (state.month !== undefined) {
      validateCalendar(state);
      return {
        kind: "calendarPeriod",
        month: state.month,
        modifier: state.modifier!,
      };
    }
    return {
      kind: "relativeUnit",
      unit: state.unit,
      modifier: state.modifier!,
    };
  }
  validateCalendar(state);
  if (state.lunar)
    return {
      kind: "lunar",
      ...calendarFields(state),
      ...(state.leap ? { leap: true } : {}),
    };
  return { kind: "calendar", ...calendarFields(state) };
}

// ---------------------------------------------------------------------------
// Clauses

interface Rule extends Partial<Recurrence> {
  active: boolean;
  token?: Token;
}

function frequencyOf(unit: Unit, token: Token): Recurrence["freq"] {
  const frequency = unitFrequencies[unit];
  if (!frequency)
    fail(
      token,
      "unsupported",
      "Expected an hourly, daily, weekly, monthly, or yearly period.",
    );
  return frequency;
}

function compileClause(tokens: Token[], diagnostics: Diagnostic[]): Clause {
  const reader = new Reader(segment(tokens));
  const clause: Clause = {};
  const rule: Rule = { active: false };
  let date: DateState | undefined;
  let endDate: DateState | undefined;
  let start: ParsedClock | undefined;
  let end: ParsedClock | undefined;
  let part: DayPart | undefined;
  let pendingMeridiem: Segment | undefined;
  let open: TimeSpec["open"] | undefined;
  let range: "start" | "end" | undefined;
  let bound: "start" | "until" | undefined;
  let except = false;
  let direction: Shift["direction"] | undefined;
  let directionToken: Token | undefined;
  let duration: "duration" | "span" | undefined;
  let interval: number | undefined;
  let count: { value: number; token: Token } | undefined;

  const setDate = (state: DateState) => {
    if (bound === "start") {
      rule.start = toDateSpec(state);
      bound = undefined;
    } else if (bound === "until") {
      rule.until = toDateSpec(state);
      bound = undefined;
    } else if (except) {
      rule.except = [...(rule.except ?? []), toDateSpec(state, true)];
      except = false;
    } else if (range === "end" && date) {
      endDate = state;
      range = undefined;
    } else if (date && date.days && state.days && !state.modifier) {
      date.days.push(...state.days);
    } else if (
      date &&
      date.day !== undefined &&
      state.day !== undefined &&
      state.month === undefined &&
      !state.lunar
    ) {
      date.moreDays = [...(date.moreDays ?? []), state.day];
    } else if (
      date &&
      !date.holiday &&
      state.holiday &&
      date.day !== undefined
    ) {
      date.holiday = state.holiday;
    } else date = state;
  };

  const setShift = (
    quantity: NonNullable<ReturnType<typeof readDuration>>,
    shiftDirection: Shift["direction"],
  ) => {
    if (clause.shift)
      fail(tokens[0], "invalid-shift", "Only one shift is allowed.");
    const previous = reader.segments
      .slice(0, reader.index)
      .reverse()
      .find((item) => item.role === Role.NUM);
    const before = previous
      ? reader.segments[reader.segments.indexOf(previous) - 1]
      : undefined;
    const loose =
      quantity.approximate ||
      (before?.role === Role.O && approximately.has(before.text));
    const { duration: amount } = quantity;
    clause.shift = {
      amount: amount.amount,
      unit: amount.unit,
      ...(amount.components ? { components: amount.components } : {}),
      direction: shiftDirection,
      ...(loose ? { approximate: true } : {}),
    };
  };

  while (!reader.done) {
    const next = reader.peek()!;
    const token = first(next);
    switch (next.role) {
      case Role.RANGE_START:
        reader.take();
        range = "start";
        break;
      case Role.RANGE_END:
        reader.take();
        range = "end";
        break;
      case Role.BOUND_START:
        reader.take();
        bound = "start";
        rule.active = true;
        break;
      case Role.BOUND_END:
        reader.take();
        bound = "until";
        rule.active = true;
        break;
      case Role.EXCEPT:
        reader.take();
        except = true;
        rule.active = true;
        break;
      case Role.RECUR: {
        reader.take();
        rule.active = true;
        rule.token ??= token;
        if (next.text === "cách") interval = 2;
        break;
      }
      case Role.DUR:
        reader.take();
        duration = rule.active ? "span" : "duration";
        break;
      case Role.DIR_BEFORE:
      case Role.DIR_AFTER: {
        reader.take();
        const towards = next.role === Role.DIR_AFTER ? "after" : "before";
        if (reader.role() === Role.NUM && reader.role(1) === Role.UNIT) {
          const quantity = readDuration(reader.segmentsFrom(), 0);
          reader.skipQuantity(quantity!.next);
          setShift(quantity!, towards);
        } else if (
          reader.role() === Role.HOUR ||
          reader.role() === Role.MERIDIEM ||
          reader.role() === Role.DAYPART
        ) {
          // "sau 6 giờ tối", "trước 9h sáng": an open clock bound.
          open = towards === "after" ? "end" : "start";
        } else if (clause.shift && clause.shift.direction === towards) {
          // "sau 30 phút nữa": the direction was already said.
        } else {
          direction = towards;
          directionToken = token;
        }
        break;
      }
      case Role.NUM: {
        if (reader.role(1) === Role.UNIT) {
          const quantity = readDuration(reader.segmentsFrom(), 0);
          if (!quantity)
            fail(
              token,
              "invalid-quantity",
              `Cannot read a quantity from ${next.text}.`,
            );
          reader.skipQuantity(quantity.next);
          const following = reader.peek();
          if (
            following?.role === Role.DIR_AFTER ||
            following?.role === Role.DIR_BEFORE
          ) {
            reader.take();
            setShift(
              quantity,
              following.role === Role.DIR_AFTER ? "after" : "before",
            );
          } else if (direction) {
            setShift(quantity, direction);
            direction = undefined;
          } else if (following?.role === Role.RECUR) {
            // "2 tuần một lần"
            while (reader.role() === Role.RECUR) reader.take();
            rule.active = true;
            rule.token ??= token;
            rule.freq = frequencyOf(quantity.duration.unit, token);
            interval = quantity.duration.amount;
          } else if (duration === "span" || (rule.active && duration)) {
            rule.span = quantity.duration;
            duration = undefined;
          } else if (rule.active && rule.freq === undefined && !duration) {
            // "mỗi 2 tuần"
            rule.freq = frequencyOf(quantity.duration.unit, token);
            interval = quantity.duration.amount;
          } else {
            if (clause.duration)
              fail(token, "invalid-duration", "Only one duration is allowed.");
            clause.duration = quantity.duration;
            duration = undefined;
          }
        } else if (reader.role(1) === Role.TIMES) {
          const value = segmentNumber(reader.take());
          const times = reader.take();
          if (reader.role() === Role.RECUR && reader.role(1) === Role.UNIT) {
            // "3 lần một tuần"
            reader.take();
            const unit = readUnit(reader.take());
            rule.active = true;
            rule.token ??= token;
            rule.freq = frequencyOf(unit, token);
            rule.timesPer = value;
          } else if (rule.active) {
            if (rule.freq === undefined && !rule.token) rule.token = token;
            count = { value, token: first(times) };
          } else
            fail(first(times), "unsupported", "A count needs a recurrence.");
        } else
          fail(
            token,
            "invalid-quantity",
            `A number needs a unit: ${next.text}.`,
          );
        break;
      }
      case Role.UNIT: {
        // "tuần 3 lần", "mỗi tuần", "hàng ngày", "tháng sau"
        if (reader.role(1) === Role.NUM && reader.role(2) === Role.TIMES) {
          const unit = readUnit(reader.take());
          const value = segmentNumber(reader.take());
          reader.take();
          rule.active = true;
          rule.token ??= token;
          rule.freq = frequencyOf(unit, token);
          rule.timesPer = value;
        } else if (
          rule.active &&
          reader.role(1) !== Role.DEICTIC &&
          !bound &&
          !except
        ) {
          const unit = readUnit(reader.take());
          if (rule.freq !== undefined)
            fail(
              token,
              "unsupported",
              "Only one recurrence period is allowed.",
            );
          rule.freq = frequencyOf(unit, token);
          if (interval === undefined && next.text === "cách") interval = 2;
        } else setDate(readDate(reader));
        break;
      }
      case Role.HOUR: {
        const clock = readClock(reader, pendingMeridiem);
        pendingMeridiem = undefined;
        if (range === "end" || (start && range === "start")) {
          if (!start)
            fail(clock.token, "invalid-time", "A range end needs a start.");
          end = clock;
          range = undefined;
        } else if (start)
          fail(clock.token, "invalid-time", "Only one start time is allowed.");
        else start = clock;
        break;
      }
      case Role.MERIDIEM:
      case Role.DAYPART: {
        reader.take();
        if (reader.role() === Role.HOUR) {
          pendingMeridiem = next;
          break;
        }
        const value = dayParts[next.text] ?? dayParts[meridiemWord(next)];
        if (!value)
          fail(token, "invalid-time", `Unknown day part ${next.text}.`);
        if (start && !end && range !== "end") {
          // "8 giờ tối" the model split as HOUR then DAYPART.
          const folded =
            "hour" in start.value
              ? applyMeridiem(start.value.hour, meridiemWord(next))
              : undefined;
          if (folded !== undefined && !start.meridiem) {
            start.value = { ...start.value, hour: folded };
            start.meridiem = meridiemWord(next);
            break;
          }
        }
        if (part && part !== value)
          fail(token, "invalid-time", "Conflicting day parts.");
        part = value;
        break;
      }
      case Role.TIME_NAMED: {
        reader.take();
        const value = namedTimes[next.text];
        if (!value)
          fail(token, "invalid-time", `Unknown named time ${next.text}.`);
        const clock: ParsedClock = { value: { named: value }, token };
        if (range === "end" && start) {
          end = clock;
          range = undefined;
        } else if (start)
          fail(token, "invalid-time", "Only one start time is allowed.");
        else start = clock;
        break;
      }
      case Role.MINUTE:
      case Role.SECOND:
      case Role.CLOCK_OFFSET:
        fail(token, "invalid-time", `${next.text} needs an hour before it.`);
      case Role.TIMES:
        fail(token, "invalid-quantity", "A count needs a number before it.");
      case Role.FREQ:
        fail(token, "unsupported", "Frequency words are not supported.");
      case Role.DEICTIC:
        fail(
          token,
          "invalid-modifier",
          `${next.text} needs a period before it.`,
        );
      case Role.ORD:
        fail(
          token,
          "invalid-ordinal",
          `${next.text} needs a weekday before it.`,
        );
      default:
        if (dateRoles.has(next.role)) setDate(readDate(reader));
        else fail(token, "unsupported", `Unsupported role at ${next.text}.`);
    }
  }

  if (bound !== undefined)
    fail(
      tokens.at(-1)!,
      "invalid-bound",
      "A recurrence bound needs a date after it.",
    );
  if (except)
    fail(
      tokens.at(-1)!,
      "invalid-bound",
      "An exception needs a date after it.",
    );
  if (direction && directionToken)
    fail(directionToken, "invalid-shift", "A shift needs a quantity.");
  if (pendingMeridiem) {
    const value = dayParts[pendingMeridiem.text];
    if (value) part = value;
  }

  // Time
  if (start) {
    if (end) inheritMeridiem(start, end);
    const time: TimeSpec = { start: start.value };
    if (end) time.end = end.value;
    if (open === "start" && !end) {
      time.end = start.value;
      time.start = { hour: 0, minute: 0 };
    }
    if (open || (range === "start" && !end)) time.open = open ?? "end";
    clause.time = time;
    if (part && "hour" in start.value && !start.meridiem) {
      const folded = applyMeridiem(start.value.hour, dayPartWord(part));
      if (folded !== undefined) time.start = { ...start.value, hour: folded };
    }
  } else if (part) {
    clause.time = { start: { part } };
  }

  // Recurrence
  if (
    rule.active ||
    date?.group === "weekday" ||
    (date?.days &&
      date.ordinal !== undefined &&
      date.unit === "month" &&
      !date.modifier)
  ) {
    const recurrence: Recurrence = {
      freq: rule.freq ?? "daily",
      interval: interval ?? 1,
    };
    if (rule.timesPer) recurrence.timesPer = rule.timesPer;
    if (date) {
      if (date.group) {
        recurrence.byDay =
          date.group === "weekend" ? ["SA", "SU"] : weekdays.slice(0, 5);
        if (rule.freq === undefined) recurrence.freq = "weekly";
      } else if (
        date.days &&
        date.ordinal !== undefined &&
        !date.modifier &&
        date.month === undefined
      ) {
        recurrence.byDay = [date.days[0]];
        recurrence.bySetPos = [date.ordinal];
        if (rule.freq === undefined) recurrence.freq = "monthly";
      } else if (date.days) {
        recurrence.byDay = date.days;
        if (rule.freq === undefined) recurrence.freq = "weekly";
      } else if (date.edge === "end" && date.unit === "month") {
        recurrence.byMonthDay = [-1];
        if (rule.freq === undefined) recurrence.freq = "monthly";
      } else if (
        date.day !== undefined &&
        (date.month !== undefined || rule.freq === "yearly")
      ) {
        validateCalendar(date);
        recurrence.byMonth = [date.month!];
        recurrence.byMonthDay = [date.day];
        if (rule.freq === undefined) recurrence.freq = "yearly";
        if (date.lunar)
          diagnostics.push(
            diagnostic(
              date.token,
              "lunar-ignored",
              "Recurring lunar dates repeat on the solar calendar.",
              "warning",
            ),
          );
      } else if (date.day !== undefined) {
        validateCalendar(date);
        recurrence.byMonthDay = [date.day, ...(date.moreDays ?? [])];
        if (rule.freq === undefined) recurrence.freq = "monthly";
        if (date.lunar)
          diagnostics.push(
            diagnostic(
              date.token,
              "lunar-ignored",
              "Recurring lunar dates repeat on the solar calendar.",
              "warning",
            ),
          );
      } else if (rule.freq === undefined) {
        fail(date.token, "unsupported", "Cannot repeat on that date.");
      } else {
        // "hàng năm vào tháng 3" and similar keep the date as the anchor.
        clause.date = toDateSpec(date);
      }
      if (endDate && date.day !== undefined && endDate.day !== undefined) {
        const days: number[] = [];
        for (let day = date.day; day <= endDate.day; day++) days.push(day);
        recurrence.byMonthDay = days;
      }
      date = undefined;
    } else if (rule.freq === undefined && !rule.timesPer)
      fail(
        rule.token ?? tokens[0],
        "unsupported",
        "A recurrence needs a period or a day.",
      );
    if (count) recurrence.count = count.value;
    if (rule.start) recurrence.start = rule.start;
    if (rule.until) recurrence.until = rule.until;
    if (rule.span) recurrence.span = rule.span;
    if (rule.except) {
      // "trừ tuần cuối tháng" names a week of the month; pin it to the rule's day.
      recurrence.except = rule.except.map((value) =>
        value.kind === "ordinalWeekday" && recurrence.byDay?.length === 1
          ? { ...value, day: recurrence.byDay[0] }
          : value,
      );
    }
    clause.recurrence = recurrence;
  } else if (count)
    fail(count.token, "unsupported", "A count needs a recurrence.");

  // Date
  if (date) {
    if (endDate) {
      validateCalendar(date);
      validateCalendar(endDate);
      const from = calendarFields(date);
      const to = calendarFields(endDate);
      // "từ 10 đến 15 tháng 3": the start shares the end's month and year.
      if (from.month === undefined && to.month !== undefined)
        from.month = to.month;
      if (
        from.year === undefined &&
        to.year !== undefined &&
        from.month !== undefined
      )
        from.year = to.year;
      if (date.days && endDate.days) {
        const range = weekdayRange(date.days[0], endDate.days[0]);
        clause.recurrence = { freq: "weekly", interval: 1, byDay: range };
      } else {
        const lunar = date.lunar || endDate.lunar;
        clause.date = {
          kind: "calendarRange",
          from,
          to,
          ...(lunar ? { lunar: true } : {}),
        };
      }
    } else if (
      date.days &&
      date.group === undefined &&
      date.ordinal === undefined &&
      date.day !== undefined
    ) {
      fail(
        date.token,
        "invalid-date",
        "A weekday and a calendar day cannot combine.",
      );
    } else clause.date = toDateSpec(date);
  } else if (endDate)
    fail(endDate.token, "invalid-date", "A date range needs a start.");

  if (clause.duration && clause.time?.end && !clause.recurrence)
    fail(
      tokens[0],
      "invalid-duration",
      "A duration cannot combine with an explicit end.",
    );
  if (
    !clause.date &&
    !clause.time &&
    !clause.shift &&
    !clause.duration &&
    !clause.recurrence
  )
    fail(tokens[0], "empty", "No schedule could be read.");
  return clause;
}

function dayPartWord(part: DayPart): string {
  return {
    morning: "sáng",
    noon: "trưa",
    afternoon: "chiều",
    evening: "tối",
    night: "đêm",
  }[part];
}

function weekdayRange(from: Weekday, to: Weekday): Weekday[] {
  const start = weekdays.indexOf(from);
  const end = weekdays.indexOf(to);
  const result: Weekday[] = [];
  for (let index = start; ; index = (index + 1) % 7) {
    result.push(weekdays[index]);
    if (index === end) break;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Expressions

function splitExpressions(tokens: Token[]): Token[][] {
  const expressions: Token[][] = [];
  let current: Token[] = [];
  let aside: Token[] = [];
  let leading: Token[] = [];

  for (const token of tokens) {
    if (token.kind === 3) continue;
    if (!current.length && token.label === Role.O) {
      leading.push(token);
      continue;
    }
    if (token.label !== Role.O || filler.has(key(token.text))) {
      // "khoảng 2 tiếng nữa": the qualifier belongs to the quantity it loosens.
      if (
        !current.length &&
        token.label === Role.NUM &&
        approximately.has(key(leading.at(-1)?.text ?? ""))
      )
        current.push(leading.at(-1)!);
      leading = [];
      if (aside.length > asideLimit) {
        expressions.push(current);
        current = [];
      } else current.push(...aside);
      aside = [];
      current.push(token);
    } else if (current.length) aside.push(token);
  }
  if (current.length) expressions.push(current);

  return expressions.filter((expression) => {
    const cue = () =>
      approximately.has(key(expression[0].text)) &&
      expression[1]?.label === Role.NUM;
    while (expression[0] && skipped.has(expression[0].label) && !cue())
      expression.shift();
    while (expression.length && skipped.has(expression.at(-1)!.label))
      expression.pop();
    return expression.length > 0;
  });
}

function splitClauses(tokens: Token[]): Token[][] {
  const clauses: Token[][] = [[]];
  for (const token of tokens) {
    const current = clauses.at(-1)!;
    const hasMeaning = current.some((part) => !skipped.has(part.label));
    if (token.clauseStart && hasMeaning) clauses.push([]);
    clauses.at(-1)!.push(token);
  }
  return clauses;
}

function compileExpression(text: string, tokens: Token[]): Expression {
  const start = tokens[0].start;
  const end = tokens.at(-1)!.end;
  const diagnostics: Diagnostic[] = [];
  let schedule: Schedule | null = null;

  try {
    schedule = {
      clauses: splitClauses(tokens).map((clause) =>
        compileClause(clause, diagnostics),
      ),
    };
  } catch (error) {
    if (!(error instanceof CompileError)) throw error;
    diagnostics.push(error.diagnostic);
  }

  const ignored = tokens.filter(
    (token) =>
      token.label === Role.O &&
      token.kind !== 3 &&
      !filler.has(key(token.text)),
  );
  if (ignored.length)
    diagnostics.push({
      code: "filler-ignored",
      message: `Ignored ${ignored.map((token) => token.text).join(" ")} inside the expression.`,
      start: ignored[0].start,
      end: ignored.at(-1)!.end,
      severity: "warning",
    });

  const scores = tokens
    .filter((token) => !skipped.has(token.label))
    .map((token) => token.score);
  const confidence = Math.min(...scores);
  if (confidence < 0.5)
    diagnostics.push(
      diagnostic(
        tokens[0],
        "low-confidence",
        "The model is uncertain about this expression.",
        "warning",
      ),
    );

  return {
    start,
    end,
    text: text.slice(start, end),
    confidence,
    schedule,
    diagnostics,
  };
}

/**
 * Numeric dates read day/month/year unless the caller asks for month first.
 * A year-first date is always year/month/day.
 */
function numericDateOrder(tokens: Token[], order: "MDY" | "DMY"): Token[] {
  const result = [...tokens];
  const separator = (token: Token | undefined) =>
    token && skipped.has(token.label) && ["/", ".", "-"].includes(token.text);
  for (let index = 0; index + 2 < tokens.length; index++) {
    const a = tokens[index];
    const b = tokens[index + 2];
    const pair =
      [Role.MONTH, Role.DOM].includes(a.label) &&
      [Role.MONTH, Role.DOM].includes(b.label);
    if (!pair || !separator(tokens[index + 1]) || b.clauseStart) continue;
    if (!/^\d+$/.test(a.text) || !/^\d+$/.test(b.text)) continue;
    const yearFirst =
      tokens[index - 1]?.label === Role.YEAR ||
      (separator(tokens[index - 1]) && tokens[index - 2]?.label === Role.YEAR);
    if (yearFirst) {
      result[index] = { ...a, label: Role.MONTH };
      result[index + 2] = { ...b, label: Role.DOM };
      continue;
    }
    const x = Number(a.text);
    const y = Number(b.text);
    if (x < 1 || x > 31 || y < 1 || y > 31 || (x > 12 && y > 12)) continue;
    const selected = x > 12 ? "DMY" : y > 12 ? "MDY" : order;
    result[index] = { ...a, label: selected === "MDY" ? Role.MONTH : Role.DOM };
    result[index + 2] = {
      ...b,
      label: selected === "MDY" ? Role.DOM : Role.MONTH,
    };
  }
  return result;
}

export function compilePredictions(
  text: string,
  tokens: Token[],
  options: Pick<ParserOptions, "dateOrder"> = {},
): Expression[] {
  return splitExpressions(tokens).map((expression) =>
    compileExpression(
      text,
      numericDateOrder(expression, options.dateOrder ?? "DMY"),
    ),
  );
}

// Oracle and diagnostic tools keep their readable string-label interface.
export function compile(
  text: string,
  tokens: SourceToken[],
  options: Pick<ParserOptions, "dateOrder"> = {},
): Expression[] {
  return compilePredictions(
    text,
    tokens.map((token) => ({ ...token, label: labelId[token.label] as Role })),
    options,
  );
}
