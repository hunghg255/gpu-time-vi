"""Sample Vietnamese schedules first, then render their words and supervision.

The expected schedule comes from the sampled specification. Neither the browser
parser nor any external recognizer supplies labels. check-semantic.ts feeds the
rendered spans through the real compiler and demands the same schedule back.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import TYPE_CHECKING

import background
import vi
from vi import DAY_CODES

if TYPE_CHECKING:
    from generate import Sentence

FAMILIES = [
    "now",
    "relative-day",
    "weekday",
    "relative-unit",
    "day-group",
    "clock",
    "time-window",
    "open-clock",
    "calendar",
    "calendar-period",
    "date-range",
    "holiday",
    "lunar-date",
    "shift",
    "duration",
    "recurrence",
    "recurrence-bound",
    "recurrence-except",
    "multi-clause",
]
WEIGHTS = [1, 4, 5, 3, 2, 5, 3, 1, 5, 2, 2, 2, 3, 5, 2, 5, 2, 1, 2]
UNITS = ["minute", "hour", "day", "week", "month", "year"]
FREQ_OF = {"hour": "hourly", "day": "daily", "week": "weekly", "month": "monthly", "year": "yearly"}


@dataclass
class Specification:
    family: str
    schedule: dict
    # The sampled clauses with rendering hints (keys starting with "_") that
    # never reach the schedule.
    raw: dict | None = None


def clean(value):
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items() if not key.startswith("_")}
    if isinstance(value, list):
        return [clean(item) for item in value]
    return value


def clock_value(rng: random.Random, common: bool = True) -> dict:
    hour = rng.randrange(24)
    minute = rng.choice([0, 0, 0, 30, 15, 45, rng.randrange(60)]) if common else rng.randrange(60)
    return {"hour": hour, "minute": minute}


def sample_time(rng: random.Random) -> dict:
    draw = rng.random()
    if draw < 0.65:
        return {"start": clock_value(rng)}
    if draw < 0.85:
        return {"start": {"part": rng.choice(list(vi.PARTS))}}
    return {"start": {"named": rng.choice(["noon", "midnight"])}}


def sample_date(rng: random.Random, allow_modifier: bool = True) -> dict:
    """A one-off date used as an anchor or bound."""
    draw = rng.random()
    if draw < 0.3:
        return {"kind": "relativeDay", "offset": rng.choice([0, 1, 1, 2, -1, -2])}
    if draw < 0.55:
        spec: dict = {"kind": "weekday", "days": [rng.choice(DAY_CODES)]}
        if allow_modifier and rng.random() < 0.4:
            spec["modifier"] = rng.choice(["this", "next", "last"])
        return spec
    if draw < 0.75:
        month = rng.randint(1, 12)
        date: dict = {"kind": "calendar", "month": month, "day": rng.randint(1, 28)}
        if rng.random() < 0.3:
            date["year"] = rng.randint(2024, 2032)
        return date
    if draw < 0.9:
        return {"kind": "relativeUnit", "unit": rng.choice(["week", "month", "year"]), "modifier": rng.choice(["this", "next", "last"])}
    return {"kind": "holiday", "name": rng.choice(vi.SOLAR_HOLIDAYS + vi.LUNAR_HOLIDAYS)}


def sample(rng: random.Random) -> Specification:
    family = rng.choices(FAMILIES, WEIGHTS)[0]
    clause = sample_clause(family, rng)
    raw = {"clauses": clause if family == "multi-clause" else [clause]}
    return Specification(family, clean(raw), raw)


def sample_clause(family: str, rng: random.Random) -> dict | list[dict]:
    if family == "now":
        return {"date": {"kind": "now"}}
    if family == "relative-day":
        clause: dict = {"date": {"kind": "relativeDay", "offset": rng.choice([0, 0, 1, 1, 1, 2, 2, 3, -1, -1, -2, -3])}}
        if rng.random() < 0.6:
            clause["time"] = sample_time(rng)
        return clause
    if family == "weekday":
        count = rng.choice([1, 1, 1, 2, 3])
        days = sorted(rng.sample(DAY_CODES, count), key=DAY_CODES.index)
        date: dict = {"kind": "weekday", "days": days}
        if rng.random() < 0.4:
            date["modifier"] = rng.choice(["this", "next", "next", "last"])
        clause = {"date": date}
        draw = rng.random()
        if draw < 0.4:
            clause["time"] = sample_time(rng)
        elif draw < 0.55:
            clause["time"] = window(rng)
        return clause
    if family == "relative-unit":
        unit = rng.choice(["week", "week", "month", "month", "year"])
        date = {"kind": "relativeUnit", "unit": unit, "modifier": rng.choice(["this", "next", "next", "last"])}
        if rng.random() < 0.3:
            date["edge"] = rng.choice(["start", "end"])
        clause = {"date": date}
        if "edge" not in date and rng.random() < 0.3:
            clause["time"] = {"start": clock_value(rng)}
        return clause
    if family == "day-group":
        if rng.random() < 0.6:
            date = {"kind": "dayGroup", "group": "weekend"}
            if rng.random() < 0.5:
                date["modifier"] = rng.choice(["this", "next", "last"])
            clause = {"date": date}
            if rng.random() < 0.4:
                clause["time"] = {"start": clock_value(rng)}
            return clause
        return {"recurrence": {"freq": "weekly", "interval": 1, "byDay": DAY_CODES[:5]}}
    if family == "clock":
        return {"time": sample_time(rng)}
    if family == "time-window":
        clause = {"time": window(rng)}
        if rng.random() < 0.4:
            clause["date"] = sample_date(rng)
        return clause
    if family == "open-clock":
        value = clock_value(rng)
        if rng.random() < 0.5:
            return {"time": {"start": value, "open": "end"}}
        return {"time": {"start": {"hour": 0, "minute": 0}, "end": value, "open": "start"}}
    if family == "calendar":
        month = rng.randint(1, 12)
        day = rng.randint(1, 28)
        year = rng.randint(2024, 2032)
        draw = rng.random()
        if draw < 0.4:
            date = {"kind": "calendar", "month": month, "day": day}
        elif draw < 0.7:
            date = {"kind": "calendar", "year": year, "month": month, "day": day}
        elif draw < 0.8:
            date = {"kind": "calendar", "day": day}
        elif draw < 0.9:
            date = {"kind": "calendar", "month": month}
        elif draw < 0.95:
            date = {"kind": "calendar", "year": year, "month": month}
        else:
            date = {"kind": "calendar", "year": year}
        clause = {"date": date}
        if "day" in date and rng.random() < 0.45:
            clause["time"] = sample_time(rng)
        return clause
    if family == "calendar-period":
        month = rng.randint(1, 12)
        draw = rng.random()
        if draw < 0.35:
            return {"date": {"kind": "calendarPeriod", "month": month, "modifier": rng.choice(["next", "last"])}}
        if draw < 0.7:
            return {"date": {"kind": "calendarPeriod", "month": month, "edge": rng.choice(["start", "end"])}}
        if draw < 0.85:
            return {"date": {"kind": "calendarPeriod", "month": month, "week": rng.randint(1, 4)}}
        return {"date": {"kind": "calendar", "month": month, "day": 15}, "_middle": True}
    if family == "date-range":
        month = rng.randint(1, 12)
        first = rng.randint(1, 14)
        last = rng.randint(first + 1, 28)
        draw = rng.random()
        if draw < 0.5:
            return {"date": {"kind": "calendarRange", "from": {"month": month, "day": first}, "to": {"month": month, "day": last}}}
        if draw < 0.8:
            other = rng.randint(1, 12)
            if other == month:
                other = month % 12 + 1
            return {"date": {"kind": "calendarRange", "from": {"month": month, "day": first}, "to": {"month": other, "day": last}}}
        if draw < 0.9:
            # Around Tết: "từ 27 tháng chạp đến mùng 6"; or a plain lunar range.
            if rng.random() < 0.5:
                return {"date": {"kind": "calendarRange", "from": {"month": 12, "day": rng.randint(23, 29)}, "to": {"month": 1, "day": rng.randint(3, 10)}, "lunar": True}}
            return {"date": {"kind": "calendarRange", "from": {"month": month, "day": first}, "to": {"month": month, "day": last}, "lunar": True}}
        other = rng.randint(month, 12)
        if other == month:
            other = min(12, month + 1) if month < 12 else 12
        if other == month:
            return {"date": {"kind": "calendarRange", "from": {"month": 3, "day": first}, "to": {"month": 5, "day": last}}}
        return {"date": {"kind": "calendarRange", "from": {"month": month}, "to": {"month": other}}}
    if family == "holiday":
        clause = {"date": {"kind": "holiday", "name": rng.choice(vi.SOLAR_HOLIDAYS + vi.LUNAR_HOLIDAYS * 2)}}
        if rng.random() < 0.35:
            clause["time"] = sample_time(rng)
        return clause
    if family == "lunar-date":
        month = rng.randint(1, 12)
        draw = rng.random()
        if draw < 0.3:
            date = {"kind": "lunar", "month": month, "day": rng.choice([1, 2, 3, 15, 15, rng.randint(1, 29)])}
        elif draw < 0.45:
            date = {"kind": "lunar", "month": 1, "day": rng.randint(1, 5), "_tet": True}
        elif draw < 0.55:
            date = {"kind": "lunar", "month": 12, "day": rng.choice([29, 30]), "_tet": True}
        elif draw < 0.7:
            date = {"kind": "lunar", "day": rng.choice([1, 15, 15, rng.randint(1, 10)])}
        elif draw < 0.85:
            date = {"kind": "lunar", "month": month}
        else:
            date = {"kind": "lunar", "year": rng.randint(2025, 2030), "month": month, "day": rng.randint(1, 28)}
        clause = {"date": date}
        if "day" in date and rng.random() < 0.25:
            clause["time"] = sample_time(rng)
        return clause
    if family == "shift":
        unit = rng.choice(["minute", "hour", "hour", "day", "day", "week", "month", "year"])
        amount = rng.choice(AMOUNTS[unit])
        shift: dict = {"amount": amount, "unit": unit, "direction": rng.choice(["after", "after", "before"])}
        draw = rng.random()
        if draw < 0.12 and unit in ("hour", "day", "week"):
            shift["components"] = [{"amount": rng.choice([15, 30, 45] if unit == "hour" else [1, 2, 3]), "unit": {"hour": "minute", "day": "hour", "week": "day"}[unit]}]
        elif draw < 0.22:
            shift["approximate"] = True
            if rng.random() < 0.5:
                # "vài"/"mấy" read as three.
                shift["amount"] = 3
                shift["_vague"] = True
        clause = {"shift": shift}
        if rng.random() < 0.3:
            clause["date"] = sample_date(rng)
            if clause["date"]["kind"] in ("relativeDay", "weekday") and rng.random() < 0.4:
                clause["time"] = {"start": clock_value(rng)} if rng.random() < 0.6 else {"start": {"named": rng.choice(["noon", "midnight"])}}
        elif rng.random() < 0.1:
            clause["date"] = {"kind": "now"}
            shift["direction"] = "after"
            shift.pop("approximate", None)
            shift.pop("_vague", None)
        return clause
    if family == "duration":
        unit = rng.choice(["minute", "hour", "hour", "day", "week", "month"])
        amount = rng.choice(AMOUNTS[unit])
        duration: dict = {"amount": amount, "unit": unit}
        if unit == "hour" and rng.random() < 0.2:
            duration["amount"] = amount + 0.5
        elif unit in ("hour", "day") and rng.random() < 0.15:
            duration["components"] = [{"amount": rng.choice([15, 30] if unit == "hour" else [2, 3, 6]), "unit": "minute" if unit == "hour" else "hour"}]
        clause = {"duration": duration}
        if rng.random() < 0.4:
            clause["date"] = sample_date(rng)
            if rng.random() < 0.5:
                clause["time"] = {"start": clock_value(rng)}
        return clause
    if family == "recurrence":
        return {"recurrence": sample_recurrence(rng), **({"time": {"start": clock_value(rng)}} if rng.random() < 0.35 else {})}
    if family == "recurrence-bound":
        rule = sample_recurrence(rng, simple=True)
        draw = rng.random()
        if draw < 0.3:
            rule["start"] = sample_date(rng, allow_modifier=False)
            if rule["start"]["kind"] == "weekday":
                rule["start"] = {"kind": "relativeUnit", "unit": "week", "modifier": "next"}
        elif draw < 0.65:
            until = sample_date(rng, allow_modifier=False)
            if until["kind"] == "relativeUnit":
                until = {"kind": "relativeUnit", "unit": until["unit"], "modifier": "this", "edge": "end"}
            if until["kind"] == "calendar" and rng.random() < 0.4:
                until = {"kind": "calendarPeriod", "month": until["month"], "edge": "end"}
            rule["until"] = until
        elif draw < 0.85:
            rule["span"] = {"amount": rng.choice([2, 3, 4, 6, 10, 12]), "unit": rng.choice(["week", "month"])}
        else:
            rule["count"] = rng.choice([3, 4, 5, 6, 8, 10])
        return {"recurrence": rule}
    if family == "recurrence-except":
        rule = sample_recurrence(rng, simple=True)
        draw = rng.random()
        if draw < 0.6:
            rule["except"] = [{"kind": "weekday", "days": [rng.choice(DAY_CODES)]}]
        elif draw < 0.85:
            rule["except"] = [{"kind": "dayGroup", "group": "weekend"}]
        else:
            rule["except"] = [{"kind": "holiday", "name": rng.choice(["tet", "christmas", "national-day"])}]
        return {"recurrence": rule}
    if family == "multi-clause":
        clauses = []
        used: set[str] = set()
        for _ in range(rng.choice([2, 2, 3])):
            day = rng.choice([code for code in DAY_CODES if code not in used])
            used.add(day)
            clauses.append({"date": {"kind": "weekday", "days": [day]}, "time": {"start": clock_value(rng)} if rng.random() < 0.6 else window(rng)})
        return clauses
    raise ValueError(family)


AMOUNTS = {
    "minute": [5, 10, 15, 20, 30, 45, 90],
    "hour": [1, 2, 2, 3, 4, 5, 6, 8, 12, 24],
    "day": [1, 2, 2, 3, 3, 4, 5, 7, 10, 14],
    "week": [1, 2, 2, 3, 4, 6],
    "month": [1, 2, 3, 6],
    "year": [1, 2, 5],
}


def window(rng: random.Random) -> dict:
    start = rng.randrange(0, 22)
    end = rng.randrange(start + 1, 24)
    return {"start": {"hour": start, "minute": rng.choice([0, 0, 30])}, "end": {"hour": end, "minute": rng.choice([0, 0, 30])}}


def sample_recurrence(rng: random.Random, simple: bool = False) -> dict:
    draw = rng.random()
    if draw < 0.3:
        count = rng.choice([1, 1, 1, 2, 3])
        return {"freq": "weekly", "interval": 1, "byDay": sorted(rng.sample(DAY_CODES, count), key=DAY_CODES.index)}
    if draw < 0.5:
        return {"freq": FREQ_OF[rng.choice(["day", "day", "week", "month", "year", "hour"])], "interval": 1}
    if draw < 0.6:
        return {"freq": FREQ_OF[rng.choice(["day", "week", "week", "month"])], "interval": rng.choice([2, 2, 3, 4])}
    if simple or draw < 0.7:
        return {"freq": "weekly", "interval": 1, "byDay": rng.choice([DAY_CODES[:5], DAY_CODES[5:]])}
    if draw < 0.78:
        return {"freq": rng.choice(["daily", "weekly"]), "interval": 1, "timesPer": rng.choice([2, 3, 4, 5])}
    if draw < 0.88:
        days = sorted(rng.sample(range(1, 29), rng.choice([1, 1, 2])))
        return {"freq": "monthly", "interval": 1, "byMonthDay": days}
    if draw < 0.95:
        return {"freq": "monthly", "interval": 1, "byDay": [rng.choice(DAY_CODES)], "bySetPos": [rng.choice([1, 2, 3, -1])]}
    return {"freq": "yearly", "interval": 1, "byMonth": [rng.randint(1, 12)], "byMonthDay": [rng.randint(1, 28)]}


# ---------------------------------------------------------------------------
# Rendering


def render(spec: Specification, s: Sentence, style: int) -> None:
    r = s.rng
    chat = style in (7, 8)
    lead = None if chat else background.prefix(r) if r.random() < 0.55 else None
    if lead:
        s.add(lead)
    clauses = (spec.raw or spec.schedule)["clauses"]
    for index, clause in enumerate(clauses):
        if index:
            s.add(r.choice(["và", ",", ";", "còn", "rồi"]), "JOIN", separator="" if r.random() < 0.3 else " ")
        s.clause()
        render_clause(clause, s, style, chat)


def render_clause(clause: dict, s: Sentence, style: int, chat: bool) -> None:
    r = s.rng
    if clause.get("shift"):
        render_shift(clause, s, style, chat)
        return
    rule = clause.get("recurrence")
    date = clause.get("date")
    time = clause.get("time")
    duration = clause.get("duration")
    if rule:
        render_recurrence(rule, s, style, chat, time)
        if duration:
            render_duration(duration, s, chat)
        return
    time_first = time and date and style % 3 == 0 and not clause.get("_middle")
    if time and date and not time_first and not chat and r.random() < 0.15:
        # "mai họp lúc 9h": the date opens the sentence, the verb sits between.
        render_date(date, s, style, chat, middle=bool(clause.get("_middle")))
        s.in_expression = False
        s.add(r.choice(["họp", "gặp nhau", "đi ăn", "nhớ gọi", "em qua", "mình chốt", "có lịch", "bay"]))
        s.in_expression = True
        s.glue(r.choice(["lúc", "lúc", "vào", "vào lúc"]))
        render_time(time, s, style, chat)
        if duration:
            render_duration(duration, s, chat)
        return
    if time_first:
        render_time(time, s, style, chat)
        render_date(date, s, style, chat, middle=bool(clause.get("_middle")))
    else:
        if date:
            render_date(date, s, style, chat, middle=bool(clause.get("_middle")))
        if time:
            if date and r.random() < 0.6:
                s.glue(r.choice(["lúc", "lúc", "vào", "vào lúc", "hồi"]))
            render_time(time, s, style, chat)
    if duration:
        render_duration(duration, s, chat)


def render_time(time: dict, s: Sentence, style: int, chat: bool) -> None:
    r = s.rng
    start = time["start"]
    end = time.get("end")
    open_ = time.get("open")
    if open_ == "end":
        word, label = r.choice(
            [("sau", "DIR_AFTER"), ("từ", "RANGE_START"), ("từ sau", "DIR_AFTER"), ("sau", "DIR_AFTER")]
        )
        s.add(word, label)
        render_clock(start, s, style, chat)
        return
    if open_ == "start":
        s.add("trước", "DIR_BEFORE")
        render_clock(end, s, style, chat)
        return
    if end:
        opener = r.random()
        if opener < 0.5:
            s.add("từ", "RANGE_START")
        elif opener < 0.6:
            s.add("giữa", "RANGE_START")
        # Both ends share a style, so a bare start never borrows the end's part.
        pair = r.choice([0, 1, 2, 7]) if chat or r.random() < 0.5 else r.choice([3, 4, 5, 6, 8])
        vi.clock(s, start["hour"], start["minute"], style=pair)
        if opener < 0.5 or opener >= 0.6:
            connector = r.choice(["đến", "đến", "tới", "-", "–"])
        else:
            connector = "và"
        s.add(connector, "RANGE_END", separator="" if connector in ("-", "–") and chat else " ")
        vi.clock(s, end["hour"], end["minute"], style=pair)
        return
    render_clock(start, s, style, chat)


def render_clock(value: dict, s: Sentence, style: int, chat: bool) -> None:
    if "named" in value:
        vi.named_time(s, value["named"])
        return
    if "part" in value:
        vi.day_part(s, value["part"])
        return
    if chat:
        vi.clock(s, value["hour"], value["minute"], style=s.rng.choice([0, 1, 2, 7]))
        return
    vi.clock(s, value["hour"], value["minute"], part_first=style == 4 and s.rng.random() < 0.5)


def render_date(date: dict, s: Sentence, style: int, chat: bool, middle: bool = False) -> None:
    r = s.rng
    kind = date["kind"]
    if kind == "now":
        s.add(r.choice(["bây giờ", "hiện tại", "ngay bây giờ", "lúc này", "hiện giờ"]), "NOW")
    elif kind == "relativeDay":
        vi.relative_day(s, date["offset"])
    elif kind == "weekday":
        vi.weekdays(s, date["days"])
        if "modifier" in date:
            if r.random() < 0.6 or date["modifier"] == "last":
                s.add(r.choice(["tuần"]), "UNIT")
                vi.modifier(s, date["modifier"])
            else:
                vi.modifier(s, date["modifier"])
    elif kind == "relativeUnit":
        if "edge" not in date and date["modifier"] == "next" and r.random() < 0.15:
            # "sang tuần", "sang năm": the modifier leads.
            s.add("sang", "DEICTIC")
            s.add(r.choice(vi.UNIT_WORDS[date["unit"]][:1]), "UNIT")
            return
        if "edge" in date:
            s.add(r.choice(["đầu", "đầu"]) if date["edge"] == "start" else r.choice(["cuối", "cuối"]), "EDGE")
        s.add(r.choice(vi.UNIT_WORDS[date["unit"]][:1]), "UNIT")
        if "edge" in date and date["modifier"] == "this" and r.random() < 0.5:
            return
        vi.modifier(s, date["modifier"], date["unit"])
    elif kind == "dayGroup":
        s.add(r.choice(vi.DAY_GROUPS[date["group"]]), "DAYGROUP")
        if "modifier" in date:
            vi.modifier(s, date["modifier"])
    elif kind == "calendar":
        if middle:
            s.add("giữa", "EDGE")
            s.glue("tháng")
            s.add(vi.month_name(r, date["month"]), "MONTH")
            return
        vi.calendar(s, date, style=r.choice([0, 1, 2, 3, 4, 5]) if not chat else r.choice([0, 1, 2]))
    elif kind == "lunar":
        if date.get("_tet"):
            if date["month"] == 1:
                s.add(r.choice(["mùng", "mồng"]), "LUNAR")
            s.add(str(date["day"]), "DOM")
            s.add(r.choice(["Tết", "tết", "Tết"]), "HOLIDAY")
            return
        vi.calendar(s, date, lunar=True)
    elif kind == "calendarPeriod":
        if "edge" in date:
            s.add("đầu" if date["edge"] == "start" else "cuối", "EDGE")
            s.glue("tháng")
            s.add(vi.month_name(r, date["month"]), "MONTH")
        elif "week" in date:
            s.add("tuần", "UNIT")
            week = date["week"]
            if week == 1 and r.random() < 0.5:
                word = r.choice(["đầu", "đầu tiên"])
                s.add(word, "EDGE" if word == "đầu" else "ORD")
            else:
                s.add(f"thứ {week}" if r.random() < 0.6 else f"thứ {vi.DAY_WORDS[week - 2] if week >= 2 else 'nhất'}", "ORD")
            s.glue(r.choice(["của tháng", "tháng"]))
            s.add(vi.month_name(r, date["month"]), "MONTH")
        else:
            s.glue("tháng")
            s.add(vi.month_name(r, date["month"]), "MONTH")
            s.add("năm", "UNIT")
            vi.modifier(s, date["modifier"], "year")
    elif kind == "calendarRange" and date.get("lunar"):
        frm, to = date["from"], date["to"]
        if r.random() < 0.8:
            s.add("từ", "RANGE_START")
        if frm["month"] == 12 and to["month"] == 1:
            s.add(str(frm["day"]), "DOM")
            s.glue("tháng")
            s.add("chạp", "MONTH")
            s.add(r.choice(["đến", "đến hết", "tới"]), "RANGE_END")
            s.add(r.choice(["mùng", "mồng"]), "LUNAR")
            s.add(str(to["day"]), "DOM")
            if r.random() < 0.5:
                s.glue("tháng")
                s.add("giêng", "MONTH")
        else:
            vi.calendar(s, frm, style=4, lunar=True)
            s.add(r.choice(["đến", "tới"]), "RANGE_END")
            vi.calendar(s, to, style=4, lunar=True)
    elif kind == "calendarRange":
        frm, to = date["from"], date["to"]
        if r.random() < 0.7:
            s.add("từ", "RANGE_START")
        if "day" in frm:
            if frm.get("month") == to.get("month") and r.random() < 0.5:
                if r.random() < 0.5:
                    s.glue("ngày")
                s.add(str(frm["day"]), "DOM")
            else:
                vi.calendar(s, frm, style=r.choice([0, 1, 4, 5]))
        else:
            s.glue("tháng")
            s.add(vi.month_name(r, frm["month"]), "MONTH")
        connector = r.choice(["đến", "đến", "tới", "-", "–"])
        s.add(connector, "RANGE_END")
        if "day" in to:
            vi.calendar(s, to, style=r.choice([0, 1, 4, 5]))
        else:
            s.glue("tháng")
            s.add(vi.month_name(r, to["month"]), "MONTH")
    elif kind == "holiday":
        vi.holiday(s, date["name"])
    else:
        raise ValueError(kind)


def render_shift(clause: dict, s: Sentence, style: int, chat: bool) -> None:
    r = s.rng
    shift = clause["shift"]
    direction = shift["direction"]
    approximate = shift.get("approximate")
    anchor = clause.get("date")
    time = clause.get("time")

    def quantity() -> None:
        if shift.get("_vague"):
            s.add(r.choice(["vài", "mấy"]), "NUM")
            vi.unit(s, shift["unit"])
            return
        if approximate:
            s.add(r.choice(["khoảng", "tầm", "chừng", "độ"]))
            vi.quantity_unit(s, shift["amount"], shift["unit"], chat=chat and shift["unit"] in vi.CHAT_UNITS)
        else:
            vi.quantity_unit(s, shift["amount"], shift["unit"], chat=chat and shift["unit"] in vi.CHAT_UNITS)
        for component in shift.get("components", []):
            vi.quantity_unit(s, component["amount"], component["unit"], chat=chat and component["unit"] in vi.CHAT_UNITS)

    if anchor and anchor["kind"] == "now":
        quantity()
        s.add(r.choice(["kể từ", "tính từ", "từ"]), "DIR_AFTER")
        s.add(r.choice(["bây giờ", "lúc này"]), "NOW")
        return
    if anchor is None and not chat and r.random() < 0.4:
        # Direction first: "sau 2 tiếng", "cách đây 3 ngày".
        if direction == "after":
            s.add("sau", "DIR_AFTER")
        else:
            s.add(r.choice(["cách đây", "trước đây"]), "DIR_BEFORE")
        quantity()
        return
    quantity()
    if direction == "after":
        s.add(r.choice(["nữa", "nữa", "sau", "tới"]) if anchor is None else "sau", "DIR_AFTER")
    else:
        s.add("trước", "DIR_BEFORE")
    if anchor:
        render_date(anchor, s, style, chat)
        if time:
            if r.random() < 0.5:
                s.glue("lúc")
            render_clock(time["start"], s, style, chat)


def render_duration(duration: dict, s: Sentence, chat: bool) -> None:
    r = s.rng
    s.add(r.choice(["trong", "trong", "trong vòng", "kéo dài", "suốt"]), "DUR")
    amount = duration["amount"]
    half = amount != int(amount)
    vi.quantity_unit(s, int(amount), duration["unit"], chat=chat and duration["unit"] in vi.CHAT_UNITS, half=half)
    for component in duration.get("components", []):
        vi.quantity_unit(s, component["amount"], component["unit"], chat=chat and component["unit"] in vi.CHAT_UNITS)


def render_recurrence(rule: dict, s: Sentence, style: int, chat: bool, time: dict | None) -> None:
    r = s.rng
    freq = rule["freq"]
    interval = rule.get("interval", 1)
    period = {"hourly": "hour", "daily": "day", "weekly": "week", "monthly": "month", "yearly": "year"}[freq]
    by_day = rule.get("byDay")
    time_written = False

    if rule.get("timesPer"):
        if r.random() < 0.6:
            vi.number(s, rule["timesPer"])
            s.add("lần", "TIMES")
            s.add(r.choice(["một", "mỗi", "/", "mỗi"]), "RECUR")
            s.add(r.choice(vi.UNIT_WORDS[period][:1]), "UNIT")
        else:
            s.add(r.choice(vi.UNIT_WORDS[period][:1]), "UNIT")
            vi.number(s, rule["timesPer"])
            s.add("lần", "TIMES")
    elif by_day in (DAY_CODES[:5], DAY_CODES[5:]) and interval == 1 and "bySetPos" not in rule:
        group = "weekday" if by_day == DAY_CODES[:5] else "weekend"
        # "cuối tuần" alone is one weekend; the series needs its marker. A
        # bounded weekday series keeps it too so the bound reads as a span.
        bounded = any(key in rule for key in ("start", "until", "span", "count", "except"))
        if group == "weekend" or bounded or r.random() < 0.7:
            s.add(r.choice(["mỗi", "các", "hàng", "vào các"]), "RECUR")
        s.add(r.choice(vi.DAY_GROUPS[group]), "DAYGROUP")
    elif rule.get("bySetPos"):
        vi.weekday(s, by_day[0])
        position = rule["bySetPos"][0]
        if position == -1:
            s.add(r.choice(["cuối cùng", "cuối"]), "ORD")
        elif position == 1:
            s.add(r.choice(["đầu tiên", "đầu", "thứ nhất"]), "ORD")
        else:
            s.add(f"thứ {position}" if r.random() < 0.5 else f"thứ {vi.DAY_WORDS[position - 2]}", "ORD")
        s.add(r.choice(["hàng", "mỗi", "của mỗi"]), "RECUR")
        s.add("tháng", "UNIT")
    elif rule.get("byMonthDay") and freq == "monthly":
        days = rule["byMonthDay"]
        if r.random() < 0.5:
            for index, day in enumerate(days):
                if index:
                    s.add(r.choice(["và", ","]), "JOIN")
                elif r.random() < 0.8:
                    s.glue("ngày")
                s.add(str(day), "DOM")
            s.add(r.choice(["hàng", "mỗi", "hằng"]), "RECUR")
            s.add("tháng", "UNIT")
        else:
            s.add(r.choice(["mỗi", "hàng"]), "RECUR")
            s.add("tháng", "UNIT")
            for index, day in enumerate(days):
                if index:
                    s.add(r.choice(["và", ","]), "JOIN")
                elif r.random() < 0.8:
                    s.glue(r.choice(["ngày", "vào ngày"]))
                s.add(str(day), "DOM")
    elif rule.get("byMonth"):
        day, month = rule["byMonthDay"][0], rule["byMonth"][0]
        if r.random() < 0.5:
            vi.calendar(s, {"month": month, "day": day}, style=r.choice([0, 4]))
            s.add(r.choice(["hàng", "mỗi"]), "RECUR")
            s.add("năm", "UNIT")
        else:
            s.add(r.choice(["hàng", "mỗi"]), "RECUR")
            s.add("năm", "UNIT")
            if r.random() < 0.5:
                s.glue("vào")
            vi.calendar(s, {"month": month, "day": day}, style=r.choice([0, 4]))
    elif by_day:
        if r.random() < 0.65:
            s.add(r.choice(["mỗi", "mỗi", "các", "hàng", "vào các", "vào mỗi"]), "RECUR")
            vi.weekdays(s, by_day)
        else:
            vi.weekdays(s, by_day)
            if time and r.random() < 0.5:
                write_time(time, s, style, chat)
                time_written = True
            s.add(r.choice(["hàng", "mỗi"]), "RECUR")
            s.add("tuần", "UNIT")
    elif interval > 1:
        if r.random() < 0.5:
            s.add("mỗi", "RECUR")
            vi.number(s, interval)
            s.add(r.choice(vi.UNIT_WORDS[period][:1]), "UNIT")
        elif interval == 2 and r.random() < 0.3:
            s.add("cách", "RECUR")
            s.add(r.choice(vi.UNIT_WORDS[period][:1]), "UNIT")
        else:
            vi.number(s, interval)
            s.add(r.choice(vi.UNIT_WORDS[period][:1]), "UNIT")
            s.add(r.choice(["một", "1"]), "RECUR")
            s.add("lần", "RECUR")
    else:
        s.add(r.choice(["mỗi", "hàng", "hằng", "mỗi"]), "RECUR")
        s.add(r.choice(vi.UNIT_WORDS[period][:1]), "UNIT")

    if time and not time_written:
        if r.random() < 0.6:
            s.glue(r.choice(["lúc", "vào lúc", "vào"]))
        write_time(time, s, style, chat)

    if rule.get("start"):
        s.add(r.choice(["bắt đầu từ", "kể từ", "từ", "tính từ"]), "BOUND_START")
        render_date(rule["start"], s, style, chat)
    if rule.get("until"):
        until = rule["until"]
        if until["kind"] == "calendarPeriod":
            s.add(r.choice(["đến hết", "cho đến hết", "tới hết"]), "BOUND_END")
            s.glue("tháng")
            s.add(vi.month_name(r, until["month"]), "MONTH")
        else:
            s.add(r.choice(["đến", "cho đến", "tới"]), "BOUND_END")
            render_date(until, s, style, chat)
    if rule.get("span"):
        s.add(r.choice(["trong", "trong vòng"]), "DUR")
        vi.quantity_unit(s, rule["span"]["amount"], rule["span"]["unit"])
    if rule.get("count"):
        s.add(",", "JOIN", separator="")
        vi.number(s, rule["count"])
        s.add(r.choice(["lần", "buổi"]), "TIMES")
    if rule.get("except"):
        s.add(r.choice(["trừ", "ngoại trừ", "trừ", "không kể"]), "EXCEPT")
        for value in rule["except"]:
            render_date(value, s, style, chat)


def write_time(time: dict, s: Sentence, style: int, chat: bool) -> None:
    render_time(time, s, style, chat)
