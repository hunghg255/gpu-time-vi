"""Vietnamese prose around and instead of time expressions.

Every token written here is background (label O). Nothing in these tables may
be a time word, or the model learns to read filler as time; hard negatives are
the deliberate exception and live in their own generator so their share is
measured.
"""

from __future__ import annotations

import random
import re
from functools import lru_cache
from pathlib import Path

# Words a carrier may end with in front of an expression: "họp lúc 3 giờ".
CONNECTORS = frozenset({"lúc", "vào", "từ", "đến", "tới", "khoảng", "tầm", "hồi", "là", "nhằm"})
PROSE = Path(__file__).resolve().parent.parent / "data/prose/sentences.txt"
RESERVED: set[str] = set()

# Time words that must not appear in borrowed prose. Mirrors lexicon.ts.
TIME_WORDS = frozenset(
    """giây phút giờ tiếng ngày hôm bữa tuần tháng năm quý sáng trưa chiều tối đêm khuya
    nay mai mốt kia kìa qua thứ cn hàng hằng mỗi tết âm rằm mùng mồng nhuận am pm
    lúc noel valentine giáng trung thu giỗ tổ đoan ngọ vu lan táo khánh
    nửa giữa cuối đầu sau trước tới nữa cách kể""".split()
)

# Spoken numbers read as quantities next to a unit; alone they are nothing.
NUMBER_WORDS = frozenset(
    "không một hai ba bốn tư năm lăm sáu bảy tám chín mười mươi mốt trăm nghìn ngàn nửa rưỡi vài mấy chục lần".split()
)

NAMES = ["Lan", "Minh", "Hương", "Tuấn", "Linh", "Nam", "Hà", "Quang", "Thảo", "Dũng", "chị Mai", "anh Hùng", "sếp", "khách"]
EVENTS = [
    "họp nhóm",
    "buổi họp",
    "cuộc họp",
    "họp phụ huynh",
    "phỏng vấn",
    "lịch phỏng vấn",
    "hẹn khám",
    "lịch khám răng",
    "buổi tập",
    "lớp yoga",
    "lớp tiếng Anh",
    "buổi bảo vệ",
    "sinh nhật",
    "đám cưới",
    "tiệc tất niên",
    "chuyến bay",
    "chuyến xe",
    "workshop",
    "buổi demo",
    "review sprint",
    "deadline",
    "hạn nộp bài",
    "hạn thanh toán",
    "lịch bảo trì",
    "buổi livestream",
    "trận đấu",
    "lễ khai giảng",
    "buổi chụp ảnh",
    "họp ban giám đốc",
    "lịch tiêm",
]
PREDICATES = ["là", "vào", "diễn ra", "diễn ra vào", "bắt đầu lúc", "sẽ diễn ra", "dời sang", "chuyển sang", "được lên lịch", "lúc"]
REQUESTS = [
    "nhắc tôi",
    "nhắc mình",
    "nhắc em",
    "đặt lịch",
    "đặt bàn",
    "đặt lịch họp",
    "lên lịch",
    "hẹn gặp",
    "hẹn bác sĩ",
    "gọi cho khách",
    "gọi lại cho anh",
    "gửi báo cáo",
    "nộp hồ sơ",
    "thanh toán tiền nhà",
    "đóng học phí",
    "tạo sự kiện",
    "book phòng họp",
    "đặt vé",
    "đặt xe",
    "chuyển khoản",
    "nhắn cho Lan",
    "đi khám",
    "đi chợ",
    "về quê",
    "bay ra Hà Nội",
    "sang văn phòng",
]
LEADS = ["", "", "làm ơn", "giúp mình", "nhớ", "anh ơi", "em ơi", "sếp ơi", "mọi người ơi", "à", "ừm"]
PLACES = ["ở văn phòng", "tại quán cà phê", "ở Hà Nội", "ở Sài Gòn", "qua Zoom", "ở nhà", "tại công ty", "ở trường", "trên Teams", "ở phòng họp lớn", "ở Đà Nẵng", "tại bệnh viện"]
TAILS = ["nhé", "nha", "được không", "được không ạ", "ạ", "nhớ đấy", "cho em", "giúp mình", "nếu tiện", "thì tốt", "đúng không", "nhá", "ok không", "nhé mọi người", "để bàn kế hoạch", "để chốt hợp đồng", "với chị Mai", "với cả team", "cùng cả nhà"]
QUESTIONS = ["bạn rảnh", "anh có rảnh", "em có bận", "mình gặp nhau", "có kịp", "còn phòng", "ai đi", "mọi người có đi", "chị có nhà", "quán có mở cửa", "còn vé", "mình chốt"]
STATEMENTS = ["mình rảnh", "anh bận", "em đi vắng", "cửa hàng mở cửa", "quán đóng cửa", "shop nghỉ", "văn phòng làm việc", "tôi sẽ về", "chúng ta gặp nhau", "khách sẽ đến", "hàng sẽ về", "kết quả sẽ có", "bên em giao hàng", "team sẽ demo", "xe khởi hành", "tàu chạy", "máy bay cất cánh", "cô giáo dạy bù"]
NEUTRAL = [
    "trời đẹp quá",
    "em thích ăn phở",
    "xe hỏng rồi",
    "anh gửi file giúp em",
    "dự án đang chạy tốt",
    "cảm ơn mọi người",
    "mình đã đọc tài liệu",
    "báo cáo này khá dài",
    "khách hàng rất hài lòng",
    "phòng họp đang bận",
    "mạng công ty chậm quá",
    "nhớ mang theo laptop",
    "tôi không hiểu câu này",
    "bản thiết kế cần sửa",
    "giá vé khá đắt",
    "chúc mừng cả team",
    "hàng đã giao rồi",
    "bạn khoẻ không",
    "đường đang kẹt xe",
    "quán này ngon lắm",
    "sếp vừa duyệt ngân sách",
    "mọi người nhớ điểm danh",
    "file đính kèm bị lỗi",
    "cà phê ở đây được đấy",
    "code đã merge",
    "mình sẽ gửi link",
    "cái này để mai tính",  # "mai" here is temporal; excluded below
]
NEUTRAL = [text for text in NEUTRAL if not set(text.split()) & TIME_WORDS]
NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "15", "20", "25", "30", "45", "50", "99", "100", "250", "500"]


def normal(text: str) -> str:
    return " ".join(text.lower().split())


def reserve(phrases) -> None:
    RESERVED.update(normal(phrase) for phrase in phrases)


@lru_cache(maxsize=1)
def borrowed() -> tuple[str, ...]:
    """Borrowed prose, one sentence per line, already filtered of time words."""
    try:
        lines = PROSE.read_text(encoding="utf-8").splitlines()
    except OSError:
        return ()
    kept = []
    for line in map(str.strip, lines):
        if not 0 < len(line) <= 120:
            continue
        words = set(re.findall(r"[^\W\d_]+", line.lower()))
        if words & TIME_WORDS or re.search(r"\d", line):
            continue
        kept.append(line)
    return tuple(kept)


def _event(rng: random.Random) -> str:
    return f"{rng.choice(EVENTS)} {rng.choice(PREDICATES)}"


def _request(rng: random.Random) -> str:
    lead = rng.choice(LEADS)
    text = f"{lead} {rng.choice(REQUESTS)}".strip()
    if rng.random() < 0.5:
        text += " " + rng.choice(["lúc", "vào", "vào lúc", "lúc"])
    return text


def _statement(rng: random.Random) -> str:
    text = rng.choice(STATEMENTS)
    if rng.random() < 0.5:
        text += " " + rng.choice(["lúc", "vào", "từ", "lúc"])
    return text


def _question(rng: random.Random) -> str:
    text = rng.choice(QUESTIONS)
    if rng.random() < 0.4:
        text += " " + rng.choice(["lúc", "vào"])
    return text


def prefix(rng: random.Random, connector: bool = True) -> str:
    """Ordinary prose before a time expression; every token is background."""
    pool = borrowed()
    while True:
        draw = rng.random()
        if pool and draw < 0.15:
            text = rng.choice(pool).rstrip(".!?") + ","
        elif draw < 0.45:
            text = _event(rng)
        elif draw < 0.7:
            text = _request(rng)
        elif draw < 0.85:
            text = _statement(rng)
        else:
            text = _question(rng)
        if normal(text) not in RESERVED:
            return text


def suffix(rng: random.Random) -> str:
    while True:
        draw = rng.random()
        if draw < 0.4:
            text = rng.choice(TAILS)
        elif draw < 0.7:
            text = rng.choice(PLACES)
        elif draw < 0.85:
            text = f"{rng.choice(PLACES)} {rng.choice(TAILS)}"
        else:
            text = f"với {rng.choice(NAMES)}"
        if normal(text) not in RESERVED:
            return text


def sentence(rng: random.Random) -> str:
    """A whole sentence with no time expression at all."""
    pool = borrowed()
    if pool and rng.random() < 0.5:
        return rng.choice(pool)
    return rng.choice(NEUTRAL)


# Hard negatives: the same syllables that carry time elsewhere, used for
# something else. Each template is one sentence; {n} is a plain number.
HARD = [
    "năm người đi ăn cùng nhau",
    "cả năm anh em đều khoẻ",
    "chiều cao của anh ấy là {n}m{n}",
    "chiều lòng khách là ưu tiên",
    "chiều dài bàn là {n} mét",
    "tối đa {n} người một phòng",
    "phương án tối ưu nhất",
    "sáng tạo là chìa khoá",
    "cô ấy rất sáng suốt",
    "hoa mai nở rộ",
    "bà mai mối nhiệt tình",
    "số {n} đường 3/2 quận 10",
    "ngã tư 30/4 kẹt xe",
    "giá {n}k một ly",
    "gọi số 09{n}2 345 678",
    "phiên bản v{n}.3 đã phát hành",
    "thứ này rất tốt",
    "sắp xếp theo thứ tự",
    "tôi {n} tuổi",
    "đầu tư vào giáo dục",
    "tư vấn miễn phí",
    "chuyện riêng tư",
    "ba mẹ tôi ở quê",
    "hai đứa nhỏ đang chơi",
    "ngày càng phát triển",
    "ngày xưa có một ông vua",
    "giờ giấc sinh hoạt hợp lý",
    "tháng lương đầu tiên",
    "bên kia đường",
    "đi qua cầu",
    "lần này khác lần trước",
    "trước mặt mọi người",
    "sau lưng ai đó",
    "{n} triệu đồng",
    "tỉ số {n}-1 cho đội khách",
    "tăng {n}% so với kế hoạch",
    "phòng {n}05 tầng 3",
    "mã sản phẩm {n}",
    "khoảng cách {n} km",
    "đọc {n} trang sách",
    "hết hàng rồi",
    "mười ngón tay",
    "một nửa số tiền",
    "sáu mươi phần trăm",
    "cuối cùng cũng xong",
    "trang {n} của cuốn sách",
    "tầng {n} toà nhà",
    "xe số {n}",
    "cân nặng {n} kg",
    "điểm {n} trên 10",
    "size {n}",
    "giảm {n}% cho đơn đầu",
    "hai chiều xe bus",
    "một chiều thôi",
    "mặt trước và mặt sau",
    "đi tới đi lui",
    "tối kỵ chuyện đó",
    "sáng mắt ra chưa",
    "anh ấy sáu mươi ký",
    "tuổi tư",
    "ngày công lao động",
]
_last_hard = False


def negative(rng: random.Random) -> str:
    """A sentence with no time expression; 40% hard negatives."""
    global _last_hard
    _last_hard = rng.random() < 0.4
    if not _last_hard:
        return sentence(rng)
    text = rng.choice(HARD).replace("{n}", rng.choice(NUMBERS))
    if rng.random() < 0.3:
        text = f"{rng.choice(NEUTRAL)}, {text}"
    return text


def was_hard() -> bool:
    return _last_hard


def terminator(rng: random.Random) -> str:
    return rng.choice([".", ".", "?", "!", " nhé", " nha", " ạ", " nhé.", ""])
