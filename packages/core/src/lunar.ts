// Vietnamese lunisolar calendar after Hồ Ngọc Đức's algorithm
// (https://www.informatik.uni-leipzig.de/~duc/amlich/), which follows the
// astronomical rules in Jean Meeus, "Astronomical Algorithms". New moons and
// solar terms are taken at the Vietnamese meridian, UTC+7, which is what makes
// this calendar differ from the Chinese one in some years.

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  leap: boolean;
}

export const VIETNAM_OFFSET = 7;

const RADIANS = Math.PI / 180;
const SYNODIC_MONTH = 29.530588853;
const EPOCH_NEW_MOON = 2415021.076998695;

/** Julian day number of a Gregorian (or, before 1582-10-15, Julian) date. */
export function julianDay(day: number, month: number, year: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jd =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;
  if (jd < 2299161)
    jd =
      day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  return jd;
}

export function fromJulianDay(jd: number): {
  day: number;
  month: number;
  year: number;
} {
  let b: number;
  let c: number;
  if (jd > 2299160) {
    const a = jd + 32044;
    b = Math.floor((4 * a + 3) / 146097);
    c = a - Math.floor((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: b * 100 + d - 4800 + Math.floor(m / 10),
  };
}

/** Julian day (with fraction) of the k-th new moon after 1900-01-01. */
function newMoon(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  let jd = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * RADIANS);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 =
    (0.1734 - 0.000393 * T) * Math.sin(M * RADIANS) +
    0.0021 * Math.sin(2 * RADIANS * M);
  C1 =
    C1 -
    0.4068 * Math.sin(Mpr * RADIANS) +
    0.0161 * Math.sin(RADIANS * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(RADIANS * 3 * Mpr);
  C1 =
    C1 +
    0.0104 * Math.sin(RADIANS * 2 * F) -
    0.0051 * Math.sin(RADIANS * (M + Mpr));
  C1 =
    C1 -
    0.0074 * Math.sin(RADIANS * (M - Mpr)) +
    0.0004 * Math.sin(RADIANS * (2 * F + M));
  C1 =
    C1 -
    0.0004 * Math.sin(RADIANS * (2 * F - M)) -
    0.0006 * Math.sin(RADIANS * (2 * F + Mpr));
  C1 =
    C1 +
    0.001 * Math.sin(RADIANS * (2 * F - Mpr)) +
    0.0005 * Math.sin(RADIANS * (2 * Mpr + M));
  const deltaT =
    T < -11
      ? 0.001 +
        0.000839 * T +
        0.0002261 * T2 -
        0.00000845 * T3 -
        0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return jd + C1 - deltaT;
}

/** Apparent solar longitude in radians, 0 to 2π. */
function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545) / 36525;
  const T2 = T * T;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  const DL =
    (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(RADIANS * M) +
    (0.019993 - 0.000101 * T) * Math.sin(RADIANS * 2 * M) +
    0.00029 * Math.sin(RADIANS * 3 * M);
  const L = (L0 + DL) * RADIANS;
  return L - Math.PI * 2 * Math.floor(L / (Math.PI * 2));
}

/** The solar term index (0-11, each 30°) of the day, at local midnight. */
function sunLongitudeIndex(dayNumber: number, offset: number): number {
  return Math.floor(
    (sunLongitude(dayNumber - 0.5 - offset / 24) / Math.PI) * 6,
  );
}

function newMoonDay(k: number, offset: number): number {
  return Math.floor(newMoon(k) + 0.5 + offset / 24);
}

/** The new moon that starts lunar month 11 of the given solar year. */
function lunarMonth11(year: number, offset: number): number {
  const off = julianDay(31, 12, year) - 2415021;
  const k = Math.floor(off / SYNODIC_MONTH);
  let nm = newMoonDay(k, offset);
  if (sunLongitudeIndex(nm, offset) >= 9) nm = newMoonDay(k - 1, offset);
  return nm;
}

function leapMonthOffset(a11: number, offset: number): number {
  const k = Math.floor((a11 - EPOCH_NEW_MOON) / SYNODIC_MONTH + 0.5);
  let last: number;
  let i = 1;
  let arc = sunLongitudeIndex(newMoonDay(k + i, offset), offset);
  do {
    last = arc;
    i++;
    arc = sunLongitudeIndex(newMoonDay(k + i, offset), offset);
  } while (arc !== last && i < 14);
  return i - 1;
}

export function solarToLunar(
  day: number,
  month: number,
  year: number,
  offset = VIETNAM_OFFSET,
): LunarDate {
  const dayNumber = julianDay(day, month, year);
  const k = Math.floor((dayNumber - EPOCH_NEW_MOON) / SYNODIC_MONTH);
  let monthStart = newMoonDay(k + 1, offset);
  if (monthStart > dayNumber) monthStart = newMoonDay(k, offset);
  let a11 = lunarMonth11(year, offset);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = year;
    a11 = lunarMonth11(year - 1, offset);
  } else {
    lunarYear = year + 1;
    b11 = lunarMonth11(year + 1, offset);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = Math.floor((monthStart - a11) / 29);
  let leap = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapDiff = leapMonthOffset(a11, offset);
    if (diff >= leapDiff) {
      lunarMonth = diff + 10;
      if (diff === leapDiff) leap = true;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { year: lunarYear, month: lunarMonth, day: lunarDay, leap };
}

/**
 * The solar date of a lunar date, or undefined when the month does not exist
 * (a leap month the year does not have, or a 30th of a 29-day month).
 */
export function lunarToSolar(
  day: number,
  month: number,
  year: number,
  leap = false,
  offset = VIETNAM_OFFSET,
): { day: number; month: number; year: number } | undefined {
  let a11: number;
  let b11: number;
  if (month < 11) {
    a11 = lunarMonth11(year - 1, offset);
    b11 = lunarMonth11(year, offset);
  } else {
    a11 = lunarMonth11(year, offset);
    b11 = lunarMonth11(year + 1, offset);
  }
  const k = Math.floor(0.5 + (a11 - EPOCH_NEW_MOON) / SYNODIC_MONTH);
  let off = month - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = leapMonthOffset(a11, offset);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (leap && month !== leapMonth) return undefined;
    if (leap || off >= leapOff) off += 1;
  } else if (leap) return undefined;
  const monthStart = newMoonDay(k + off, offset);
  if (day < 1 || day > 30) return undefined;
  const result = fromJulianDay(monthStart + day - 1);
  // A 29-day month has no 30th: the conversion would land on the next month.
  const check = solarToLunar(result.day, result.month, result.year, offset);
  if (check.day !== day || check.month !== month || check.leap !== leap)
    return undefined;
  return result;
}

/** Days in a lunar month: 29 or 30. */
export function lunarMonthLength(
  month: number,
  year: number,
  leap = false,
  offset = VIETNAM_OFFSET,
): number {
  return lunarToSolar(30, month, year, leap, offset) ? 30 : 29;
}
