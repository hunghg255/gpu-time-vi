"""Natural phrasing: sentence frames around independently sampled schedules.

Each family is a set of frames that fit one kind of expression. The frame's
words are background; the expression inside comes from semantic.py, so the
schedule is known. RESERVED frames never enter training: check-natural.py
renders them for the reserved evaluation that measures generalization.
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

import background
import semantic
from semantic import Specification

if TYPE_CHECKING:
    from generate import Sentence

# family → (semantic families it accepts, frames). "{}" is the expression; the
# rest of the frame is carrier text and must not contain time words.
FAMILIES: dict[str, tuple[list[str], list[str]]] = {
    "reminder": (
        ["relative-day", "weekday", "clock", "calendar", "shift", "holiday", "lunar-date"],
        [
            "nhắc tôi {}",
            "nhắc mình {} nhé",
            "nhắc em uống thuốc {}",
            "đặt báo thức {}",
            "tạo nhắc nhở {} giúp mình",
            "báo mình {} nha",
            "nhắc anh gọi cho khách {}",
            "note lại: {}",
            "ghi vào lịch giúp tôi {}",
        ],
    ),
    "meeting": (
        ["relative-day", "weekday", "clock", "time-window", "calendar", "relative-unit", "multi-clause"],
        [
            "họp nhóm {}",
            "họp {} ở phòng lớn",
            "mình họp {} được không",
            "book phòng họp {}",
            "buổi review {}",
            "phỏng vấn ứng viên {}",
            "gặp khách {}",
            "demo cho sếp {}",
            "cả team gặp nhau {}",
            "họp online {} trên Zoom",
        ],
    ),
    "deadline": (
        ["calendar", "relative-day", "weekday", "clock", "open-clock", "relative-unit", "calendar-period"],
        [
            "deadline là {}",
            "hạn nộp bài {}",
            "hạn chót {}",
            "nộp báo cáo {} nhé",
            "gửi hồ sơ {}",
            "hạn thanh toán {}",
            "cần xong {}",
            "chốt số liệu {}",
            "hợp đồng hết hạn {}",
        ],
    ),
    "travel": (
        ["clock", "relative-day", "calendar", "shift", "time-window", "weekday"],
        [
            "tàu chạy {}",
            "chuyến bay cất cánh {}",
            "xe khởi hành {}",
            "mình bay ra Hà Nội {}",
            "về quê {}",
            "đi Đà Lạt {}",
            "check-in khách sạn {}",
            "xe đón ở sân bay {}",
        ],
    ),
    "availability": (
        ["time-window", "relative-day", "weekday", "day-group", "open-clock", "clock"],
        [
            "mình rảnh {}",
            "anh có rảnh {} không",
            "em bận {}",
            "cửa hàng mở cửa {}",
            "quán đóng cửa {}",
            "văn phòng làm việc {}",
            "bác sĩ nhận bệnh {}",
            "shop nghỉ {}",
            "tôi ở nhà {}",
        ],
    ),
    "series": (
        ["recurrence", "recurrence-bound", "recurrence-except", "day-group"],
        [
            "lớp yoga {}",
            "học tiếng Anh {}",
            "team meeting {}",
            "đi bơi {}",
            "uống thuốc {}",
            "báo cáo tiến độ {}",
            "dọn nhà {}",
            "gửi newsletter {}",
            "chạy backup {}",
            "xe rác đến {}",
        ],
    ),
    "event": (
        ["calendar", "holiday", "lunar-date", "date-range", "calendar-period", "weekday"],
        [
            "sinh nhật em ấy là {}",
            "đám cưới bạn Lan {}",
            "lễ khai giảng {}",
            "giỗ ông nội {}",
            "hội chợ diễn ra {}",
            "kỳ nghỉ của mình {}",
            "công ty nghỉ {}",
            "cả nhà về quê ăn {}",
            "khai trương {}",
            "triển lãm mở cửa {}",
        ],
    ),
    "duration": (
        ["duration", "shift"],
        [
            "buổi họp kéo dài {}",
            "chuyến đi mất {}",
            "làm việc này {}",
            "em sẽ quay lại {}",
            "gọi lại cho anh {}",
            "kết quả có {}",
            "hàng về {}",
            "xe đến {}",
        ],
    ),
    "question": (
        ["relative-day", "weekday", "clock", "calendar", "time-window", "holiday"],
        [
            "{} bạn rảnh không",
            "{} mình gặp nhau nhé",
            "{} có họp không",
            "{} ai đi cùng không",
            "{} còn phòng không",
            "{} quán có mở không",
        ],
    ),
    "chat": (
        ["weekday", "relative-day", "clock", "calendar", "shift", "time-window"],
        ["{}", "{} nhé", "{} nha", "ok {}", "{} đi", "{} nhá", "chốt {}", "{} ạ"],
    ),
}
FAMILY_WEIGHTS = {
    "reminder": 3,
    "meeting": 3,
    "deadline": 2,
    "travel": 2,
    "availability": 2,
    "series": 3,
    "event": 2,
    "duration": 2,
    "question": 2,
    "chat": 3,
}
# Held-out carriers: same shapes, never trained on.
RESERVED = [
    "có thể sắp xếp một lời nhắc {} được không",
    "buổi tổng duyệt của chúng ta diễn ra {}",
    "tàu rời ga {}",
    "vui lòng ghi vào sổ tay của tôi {}",
    "tiết mục văn nghệ diễn ra {}",
]
background.reserve(frame.replace("{}", "").strip() for frame in RESERVED)
# Carrier words cannot be unambiguous time words; checked once at import. Words
# that only mean time in context ("cửa hàng", "tiếng Anh", "giỗ ông nội") are
# welcome: they are the contrast the model needs.
CONTEXTUAL = frozenset(
    "hàng tiếng lan giỗ tổ thu trung đầu cuối sau trước tới qua cách kể nửa giữa".split()
)
for _name, (_, _frames) in FAMILIES.items():
    for _frame in _frames + RESERVED:
        _words = set(_frame.replace("{}", " ").lower().split())
        _clash = _words & (background.TIME_WORDS - CONTEXTUAL)
        assert not _clash, (_name, _frame, _clash)


def render(s: Sentence, reserved: bool = False, family: str | None = None, bare: bool = False) -> Specification:
    r = s.rng
    family = family or r.choices(list(FAMILY_WEIGHTS), list(FAMILY_WEIGHTS.values()))[0]
    accepted, frames = FAMILIES[family]
    inner = r.choice(accepted)
    clause = semantic.sample_clause(inner, r)
    raw = {"clauses": clause if inner == "multi-clause" else [clause]}
    spec = Specification(family, semantic.clean(raw), raw)
    if bare:
        frame = "{}"
    elif reserved:
        frame = r.choice(RESERVED)
    else:
        frame = r.choice(frames)
    head, tail = frame.split("{}")
    if head.strip():
        s.add(head.strip())
    chat = family == "chat"
    style = 8 if chat else r.randrange(7)
    for index, item in enumerate(raw["clauses"]):
        if index:
            s.add(r.choice(["và", ",", "còn"]), "JOIN")
        s.clause()
        semantic.render_clause(item, s, style, chat)
    if tail.strip():
        s.in_expression = False
        s.add(tail.strip())
    return spec
