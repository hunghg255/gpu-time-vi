"""Vietnamese surface forms shared by the renderers.

Every helper writes labelled spans onto a Sentence following the contract in
docs/vietnamese-time-expressions.md, so the compiler reads back exactly the
schedule the renderer intended. Spellings mirror packages/core/src/lexicon.ts.
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from generate import Sentence

DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
DAY_WORDS = ["hai", "ba", "tư", "năm", "sáu", "bảy"]
MONTH_WORDS = [
    "một",
    "hai",
    "ba",
    "tư",
    "năm",
    "sáu",
    "bảy",
    "tám",
    "chín",
    "mười",
    "mười một",
    "mười hai",
]
ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín", "mười"]
UNIT_WORDS = {
    "second": ["giây"],
    "minute": ["phút", "phút"],
    "hour": ["tiếng", "giờ", "tiếng"],
    "day": ["ngày", "ngày", "hôm"],
    "week": ["tuần"],
    "month": ["tháng"],
    "year": ["năm"],
}
CHAT_UNITS = {"hour": "h", "minute": "p"}
MODIFIERS = {
    "this": ["này", "này", "nay"],
    "next": ["sau", "tới", "sau", "kế", "kế tiếp", "sắp tới"],
    "last": ["trước", "rồi", "qua", "vừa rồi", "vừa qua"],
}
YEAR_MODIFIERS = {"this": ["nay", "này"], "next": ["sau", "tới"], "last": ["ngoái", "trước", "rồi"]}
RELATIVE_DAYS = {
    0: ["hôm nay", "nay", "bữa nay", "ngày hôm nay"],
    1: ["ngày mai", "mai", "mai", "ngày mai"],
    2: ["ngày kia", "ngày mốt", "mốt"],
    3: ["ngày kìa"],
    -1: ["hôm qua", "ngày hôm qua"],
    -2: ["hôm kia"],
    -3: ["hôm kìa"],
}
PARTS = {
    "morning": ["sáng", "sáng", "buổi sáng", "sáng sớm"],
    "noon": ["trưa", "buổi trưa"],
    "afternoon": ["chiều", "chiều", "buổi chiều"],
    "evening": ["tối", "tối", "buổi tối"],
    "night": ["đêm", "khuya", "ban đêm", "đêm khuya"],
}
NAMED = {"noon": ["giữa trưa", "đúng trưa", "trưa"], "midnight": ["nửa đêm", "giữa đêm"]}
DAY_GROUPS = {
    "weekend": ["cuối tuần"],
    "weekday": ["ngày thường", "ngày làm việc", "ngày trong tuần", "ngày đi làm"],
}
HOLIDAYS = {
    "new-year": ["Tết dương lịch", "Tết tây", "năm mới", "tết dương"],
    "valentines": ["Valentine", "lễ tình nhân", "ngày lễ tình nhân"],
    "womens-day": ["Quốc tế phụ nữ", "ngày Quốc tế phụ nữ"],
    "liberation-day": ["Giải phóng miền Nam", "ngày Giải phóng"],
    "labour-day": ["Quốc tế lao động", "ngày Quốc tế lao động"],
    "childrens-day": ["Quốc tế thiếu nhi", "ngày Quốc tế thiếu nhi"],
    "national-day": ["Quốc khánh", "lễ Quốc khánh", "ngày Quốc khánh"],
    "vn-womens-day": ["Phụ nữ Việt Nam", "ngày Phụ nữ Việt Nam"],
    "teachers-day": ["Nhà giáo Việt Nam", "ngày Nhà giáo Việt Nam", "ngày Nhà giáo"],
    "christmas": ["Giáng sinh", "Noel", "lễ Giáng sinh", "giáng sinh", "noel"],
    "christmas-eve": ["đêm Giáng sinh", "đêm Noel"],
    "new-years-eve": ["giao thừa tây", "giao thừa dương lịch"],
    "tet": ["Tết", "Tết Nguyên Đán", "Tết âm lịch", "Tết ta", "tết", "Tết cổ truyền"],
    "tet-eve": ["giao thừa", "đêm giao thừa"],
    "lantern-festival": ["Tết Nguyên tiêu", "Nguyên tiêu"],
    "hung-kings": ["Giỗ tổ", "Giỗ tổ Hùng Vương", "ngày Giỗ tổ"],
    "doan-ngo": ["Tết Đoan Ngọ", "Đoan Ngọ"],
    "vu-lan": ["Vu Lan", "lễ Vu Lan"],
    "mid-autumn": ["Trung thu", "Tết Trung thu", "rằm Trung thu"],
    "kitchen-gods": ["ông Táo", "Tết ông Táo", "ông Công ông Táo", "Táo quân"],
}
# "rằm Nguyên tiêu" and "rằm Trung thu" read as holidays because the lexicon
# lists them; keep them out of the LUNAR-marker renderers.
SOLAR_HOLIDAYS = [
    "new-year",
    "valentines",
    "womens-day",
    "liberation-day",
    "labour-day",
    "childrens-day",
    "national-day",
    "vn-womens-day",
    "teachers-day",
    "christmas",
    "christmas-eve",
    "new-years-eve",
]
LUNAR_HOLIDAYS = [
    "tet",
    "tet-eve",
    "lantern-festival",
    "hung-kings",
    "doan-ngo",
    "vu-lan",
    "mid-autumn",
    "kitchen-gods",
]
LUNAR_MARKERS = ["âm lịch", "âm lịch", "ÂL", "âl", "âm", "lịch âm"]


def spell(value: int) -> str:
    """Spoken number: 15 → "mười lăm", 21 → "hai mươi mốt", 24 → "hai mươi tư"."""
    if value <= 10:
        return ONES[value]
    tens, ones = divmod(value, 10)
    if tens == 1:
        return "mười" + ("" if ones == 0 else " " + ("lăm" if ones == 5 else ONES[ones]))
    if tens >= 10:
        return str(value)
    tail = ""
    if ones == 1:
        tail = " mốt"
    elif ones == 4:
        tail = " tư"
    elif ones == 5:
        tail = " lăm"
    elif ones:
        tail = " " + ONES[ones]
    return ONES[tens] + " mươi" + tail


def number(s: Sentence, value: int, label: str = "NUM", spoken: float = 0.3) -> None:
    text = spell(value) if value <= 30 and s.rng.random() < spoken else str(value)
    s.add(text, label)


def weekday(s: Sentence, code: str, style: int | None = None) -> None:
    r = s.rng
    style = r.randrange(6) if style is None else style
    if code == "SU":
        s.add(r.choice(["chủ nhật", "chủ nhật", "Chủ nhật", "CN", "cn"]), "WEEKDAY")
        return
    index = DAY_CODES.index(code)
    if style in (0, 1, 2):
        text = f"thứ {DAY_WORDS[index]}"
        s.add(text.capitalize() if style == 2 else text, "WEEKDAY")
    elif style == 3:
        s.add(f"thứ {index + 2}", "WEEKDAY")
    else:
        s.add(r.choice(["t", "T"]), "WEEKDAY")
        s.add(str(index + 2), "WEEKDAY", separator="")


def weekdays(s: Sentence, codes: list[str]) -> None:
    style = s.rng.randrange(6)
    for position, code in enumerate(codes):
        if position:
            connector = s.rng.choice(["và", ",", ",", "&", ""])
            if connector:
                s.add(connector, "JOIN", separator="" if connector == "," else " ")
        weekday(s, code, style)


def unit(s: Sentence, name: str, label: str = "UNIT", chat: bool = False) -> None:
    if chat and name in CHAT_UNITS:
        s.add(CHAT_UNITS[name], label, separator="")
        return
    s.add(s.rng.choice(UNIT_WORDS[name]), label)


def modifier(s: Sentence, value: str, for_unit: str | None = None) -> None:
    words = YEAR_MODIFIERS[value] if for_unit == "year" else MODIFIERS[value]
    s.add(s.rng.choice(words), "DEICTIC")


def relative_day(s: Sentence, offset: int) -> None:
    s.add(s.rng.choice(RELATIVE_DAYS[offset]), "REL_DAY")


def day_part(s: Sentence, part: str) -> None:
    text = s.rng.choice(PARTS[part])
    if text.startswith("buổi ") or text.startswith("ban "):
        head, tail = text.split(" ", 1)
        s.glue(head)
        s.add(tail, "DAYPART")
    else:
        s.add(text, "DAYPART")


def named_time(s: Sentence, name: str) -> None:
    s.add(s.rng.choice(NAMED[name]), "TIME_NAMED")


def holiday(s: Sentence, name: str) -> None:
    text = s.rng.choice(HOLIDAYS[name])
    if text.startswith(("ngày ", "lễ ")) and s.rng.random() < 0.5:
        head, tail = text.split(" ", 1)
        s.glue(head)
        s.add(tail, "HOLIDAY")
    else:
        s.add(text, "HOLIDAY")


def twelve_hour(hour: int, rng: random.Random) -> tuple[int, str]:
    """A 24-hour value as (12-hour value, part) that the compiler folds back."""
    if hour == 0:
        return 12, "đêm"
    if 1 <= hour <= 4:
        return hour, rng.choice(["sáng", "đêm"])
    if 5 <= hour <= 10:
        return hour, "sáng"
    if hour == 11:
        return 11, rng.choice(["sáng", "trưa"])
    if hour == 12:
        return 12, "trưa"
    if hour == 13:
        return 1, rng.choice(["trưa", "chiều"])
    if 14 <= hour <= 17:
        return hour - 12, "chiều"
    if hour == 18:
        return 6, rng.choice(["chiều", "tối"])
    if 19 <= hour <= 21:
        return hour - 12, "tối"
    return hour - 12, rng.choice(["tối", "đêm"])


def clock(
    s: Sentence,
    hour: int,
    minute: int = 0,
    style: int | None = None,
    part_first: bool = False,
) -> None:
    """Write a clock whose compiled value is hour:minute (24-hour)."""
    r = s.rng
    style = r.randrange(9) if style is None else style
    # 0-2 twenty-four hour, 3-6 twelve hour with a part, 7 am/pm, 8 spoken.
    if style <= 2:
        if style == 0 or minute:
            glue = r.choice(["h", "g", ":", "giờ"])
            s.add(str(hour), "HOUR")
            if minute or r.random() < 0.5:
                if glue == "giờ":
                    s.glue("giờ")
                    s.add(f"{minute:02d}" if r.random() < 0.5 else str(minute), "MINUTE")
                    if r.random() < 0.4:
                        s.glue("phút")
                else:
                    s.glue(glue, separator="")
                    s.add(f"{minute:02d}", "MINUTE", separator="")
                    if glue in ("h", "g") and r.random() < 0.15:
                        s.glue("p", separator="")
            else:
                s.glue(glue, separator="" if glue != "giờ" else " ")
            return
        s.add(str(hour), "HOUR")
        s.glue(r.choice(["giờ", "h", "h", "g"]), separator=r.choice([" ", ""]))
        return
    if style == 7:
        twelve = hour % 12 or 12
        s.add(str(twelve), "HOUR")
        if minute:
            s.glue(":", separator="")
            s.add(f"{minute:02d}", "MINUTE", separator="")
        s.add(
            ("am" if hour < 12 else "pm") if r.random() < 0.7 else ("AM" if hour < 12 else "PM"),
            "MERIDIEM",
            separator=r.choice(["", " "]),
        )
        return
    twelve, part = twelve_hour(hour, r)
    if part_first:
        s.add(part, "MERIDIEM")
    spoken = style == 8
    if minute in (45, 40, 50) and 1 <= twelve <= 11 and r.random() < 0.4:
        # "3 giờ kém 15" is 2:45.
        s.add(spell(twelve + 1) if spoken else str(twelve + 1), "HOUR")
        s.glue(r.choice(["giờ", "h"]), separator="" if not spoken and r.random() < 0.5 else " ")
        s.add("kém", "CLOCK_OFFSET")
        s.add(str(60 - minute), "MINUTE")
    else:
        s.add(spell(twelve) if spoken else str(twelve), "HOUR")
        if minute == 30 and r.random() < 0.6:
            if r.random() < 0.5:
                s.glue(r.choice(["giờ", "h"]))
            s.add("rưỡi", "CLOCK_OFFSET")
        elif minute:
            glue = r.choice(["giờ", "h", "g", ":"])
            if glue == "giờ":
                s.glue("giờ")
                s.add(str(minute) if r.random() < 0.5 else f"{minute:02d}", "MINUTE")
                if r.random() < 0.3:
                    s.glue("phút")
            else:
                s.glue(glue, separator="")
                s.add(f"{minute:02d}", "MINUTE", separator="")
        else:
            s.glue(r.choice(["giờ", "giờ", "h"]), separator=" " if spoken else r.choice([" ", ""]))
    if not part_first:
        s.add(part, "MERIDIEM")


def calendar(s: Sentence, date: dict, style: int | None = None, lunar: bool = False) -> None:
    """Write a calendar or lunar date from {year?, month?, day?, leap?}."""
    r = s.rng
    style = r.randrange(6) if style is None else style
    day, month, year = date.get("day"), date.get("month"), date.get("year")
    # Something must say "lunar": a marker word, mùng/rằm, or giêng/chạp.
    marker = lunar
    lunar_word = False

    def write_month(separator: str = " ") -> None:
        nonlocal lunar_word
        name = month_name(r, month, lunar)
        lunar_word = name in ("giêng", "chạp")
        s.add(name, "MONTH", separator=separator)

    if lunar and day is not None and day <= 10 and r.random() < 0.6:
        s.add(r.choice(["mùng", "mùng", "mồng"]), "LUNAR")
        s.add(str(day), "DOM")
        if month is not None:
            s.glue("tháng")
            write_month()
        if year is not None:
            s.glue("năm")
            s.add(str(year), "YEAR")
        if marker and not lunar_word and month is not None and r.random() < 0.5:
            s.add(r.choice(LUNAR_MARKERS), "LUNAR")
        return
    if lunar and day == 15 and month is not None and r.random() < 0.5:
        s.add("rằm", "LUNAR")
        s.glue("tháng")
        write_month()
        if year is not None:
            s.glue("năm")
            s.add(str(year), "YEAR")
        return
    if style <= 2 and day is not None and month is not None:
        separator = r.choice(["/", "/", "-", "."])
        s.add(str(day), "DOM")
        s.glue(separator, separator="")
        s.add(str(month), "MONTH", separator="")
        if year is not None:
            s.glue(separator, separator="")
            s.add(str(year), "YEAR", separator="")
    elif style == 3 and day is not None and month is not None and year is not None:
        s.add(str(year), "YEAR")
        s.glue("-", separator="")
        s.add(f"{month:02d}", "MONTH", separator="")
        s.glue("-", separator="")
        s.add(f"{day:02d}", "DOM", separator="")
    elif style <= 3 and day is None and month is not None and year is not None:
        s.add(str(month), "MONTH")
        s.glue("/", separator="")
        s.add(str(year), "YEAR", separator="")
    else:
        if day is not None:
            if r.random() < 0.7:
                s.glue("ngày")
            s.add(spell(day) if r.random() < 0.15 else str(day), "DOM")
        if month is not None:
            s.glue("tháng")
            write_month()
        if year is not None:
            s.glue("năm")
            s.add(str(year), "YEAR")
    if marker and not lunar_word:
        s.add(r.choice(LUNAR_MARKERS), "LUNAR")


def month_name(r: random.Random, month: int, lunar: bool = False) -> str:
    if lunar and month == 1 and r.random() < 0.5:
        return "giêng"
    if lunar and month == 12 and r.random() < 0.5:
        return "chạp"
    return MONTH_WORDS[month - 1] if r.random() < 0.15 else str(month)


def quantity_unit(
    s: Sentence, amount: int, name: str, chat: bool = False, half: bool = False
) -> None:
    """"2 tiếng", "hai mươi phút", "2h", "2 tiếng rưỡi" (half adds NUM rưỡi)."""
    number(s, amount, spoken=0.0 if chat else 0.3)
    unit(s, name, chat=chat)
    if half:
        s.add("rưỡi", "NUM")
