import { Role } from "./labels.js";
import {
  key,
  number,
  quarterWords,
  spelledNumber,
  unit,
  vagueQuantities,
} from "./lexicon.js";
import type { Duration, PredictionToken as Token, Unit } from "./types.js";

const skip = (tokens: Token[], index: number) =>
  tokens[index]?.kind === 3 ? index + 1 : index;

/**
 * Read one number starting at `index` and return where it ends. Digits read
 * as they are, with "1,5" and "1.5" as decimals; words combine as spoken:
 * "hai mươi mốt", "mười lăm", "hai tiếng rưỡi" (the trailing "rưỡi" is read
 * by the caller once the unit is known). `approximate` marks "vài"/"mấy".
 */
export function readNumber(tokens: Token[], index: number, label = Role.NUM) {
  const words: string[] = [];
  let next = index;
  let approximate = false;
  for (;;) {
    // Peek past whitespace; `next` only advances over consumed tokens.
    const cursor = skip(tokens, next);
    if (tokens[cursor]?.label !== label || tokens[cursor].kind === 3) break;
    const word = key(tokens[cursor].text);
    // Digits after digits are two numbers ("15 3"), never one.
    if (words.length && /^\d+$/.test(word) && /^\d+$/.test(words.at(-1)!))
      break;
    if (vagueQuantities.has(word)) approximate = true;
    words.push(word);
    next = cursor + 1;
    // A decimal mark between two digit tokens: "1,5", "2.5".
    if (
      /^\d+$/.test(word) &&
      /^[.,]$/.test(tokens[next]?.text ?? "") &&
      tokens[next + 1]?.label === label &&
      /^\d+$/.test(tokens[next + 1].text)
    ) {
      words[words.length - 1] = `${word}.${tokens[next + 1].text}`;
      next += 2;
      break;
    }
  }
  if (!words.length) return { value: NaN, next: index, approximate };
  const last = words[words.length - 1];
  const value =
    words.length === 1 && /^\d+\.\d+$/.test(last)
      ? Number(last)
      : spelledNumber(words);
  return { value, next, approximate };
}

const clockUnits = new Set(["hour", "minute", "second"]);
const halves: Partial<Record<Unit, { amount: number; unit: Unit }>> = {
  day: { amount: 12, unit: "hour" },
  month: { amount: 15, unit: "day" },
  year: { amount: 6, unit: "month" },
};

/**
 * Read `NUM UNIT [rưỡi] [NUM UNIT]...` as one duration: "1 tiếng 30 phút",
 * "2 tiếng rưỡi", "3 ngày". Nothing when the run is not a duration.
 */
export function readDuration(
  tokens: Token[],
  index: number,
): { duration: Duration; next: number; approximate?: boolean } | undefined {
  const components = [];
  let next = index;
  let approximate = false;
  while (tokens[next]?.label === Role.NUM) {
    const quantity = readNumber(tokens, next);
    approximate ||= quantity.approximate;
    next = skip(tokens, quantity.next);
    const word = key(tokens[next]?.text ?? "");
    const quarter = quarterWords.has(word);
    const durationUnit =
      tokens[next]?.label === Role.UNIT
        ? quarter
          ? "month"
          : unit(word)
        : undefined;
    if (
      !durationUnit ||
      !Number.isFinite(quantity.value) ||
      quantity.value <= 0
    )
      return;
    let amount = quantity.value * (quarter ? 3 : 1);
    next = skip(tokens, next + 1);
    // "hai tiếng rưỡi": the half follows the unit.
    if (key(tokens[next]?.text ?? "") === "rưỡi") {
      amount += 0.5;
      next = skip(tokens, next + 1);
    }
    // "nửa tháng", "nửa năm", "nửa ngày" have a conventional whole reading;
    // other fractions of calendar units need a policy of their own. Clock
    // units are exact.
    const half = amount === 0.5 ? halves[durationUnit] : undefined;
    if (half) components.push(half);
    else if (!Number.isInteger(amount) && !clockUnits.has(durationUnit))
      return;
    else components.push({ amount, unit: durationUnit });
    if (tokens[next]?.label !== Role.NUM) break;
    const following = readNumber(tokens, next).next;
    if (tokens[skip(tokens, following)]?.label !== Role.UNIT) break;
  }
  if (!components.length) return;
  const [first, ...rest] = components;
  return {
    duration: { ...first, ...(rest.length ? { components: rest } : {}) },
    next,
    ...(approximate ? { approximate } : {}),
  };
}

/** Whole-number read of a single token; NaN otherwise. */
export function tokenNumber(token: Token | undefined): number {
  return token ? number(token.text) : NaN;
}
