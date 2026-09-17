import { writeFileSync } from "node:fs";
import type { Clause } from "../../core/src/types.ts";
import {
  WEEKDAYS,
  calendar,
  clock,
  duration,
  holiday,
  lunar,
  named,
  part,
  range,
  recurrence,
  relative,
  shift,
  unit,
  weekday,
  weekdayMod,
  window,
} from "./gold-helpers.ts";

// Hand-authored prose and adversarial cases. Prose embeds an expression in a
// full sentence the way people write; adversarial cases pair the ambiguous
// words from docs/vietnamese-time-expressions.md §9 with a temporal reading,
// or sit right next to a number that is not a time.

const gold = new URL("../data/gold/", import.meta.url);

interface Case {
  id: string;
  family: string;
  text: string;
  schedule: { clauses: Clause[] } | null;
}
const prose: Case[] = [];
const adversarial: Case[] = [];
function add(
  list: Case[],
  prefix: string,
  family: string,
  text: string,
  ...clauses: Clause[]
) {
  list.push({
    id: `${prefix}-${String(list.length + 1).padStart(3, "0")}`,
    family,
    text,
    schedule: clauses.length ? { clauses } : null,
  });
}
const p = (family: string, text: string, ...clauses: Clause[]) =>
  add(prose, "prose", family, text, ...clauses);
const a = (family: string, text: string, ...clauses: Clause[]) =>
  add(adversarial, "adversarial", family, text, ...clauses);

// --- prose: chat, email and notes ------------------------------------------
p("chat", "ok mai 9h mình họp nhé", { date: relative(1), time: clock(9) });
p("chat", "t2 tuần sau em bay ra Hà Nội", { date: weekdayMod("next", "MO") });
p("chat", "chiều nay 3h qua văn phòng lấy hồ sơ nha", {
  date: relative(0),
  time: clock(15),
});
p("chat", "tối thứ sáu đi ăn không", {
  date: weekday("FR"),
  time: part("evening"),
});
p("chat", "cn này về quê", { date: weekdayMod("this", "SU") });
p("chat", "khoảng 30 phút nữa anh tới", {
  ...shift(30, "minute", "after", { approximate: true }),
});
p("chat", "deadline 17h thứ tư nhé cả nhà", {
  date: weekday("WE"),
  time: clock(17),
});
p("chat", "sáng mai 8h30 họp ban giám đốc", {
  date: relative(1),
  time: clock(8, 30),
});
p("chat", "hẹn 7 giờ tối mai ở quán cũ", {
  date: relative(1),
  time: clock(19),
});
p("chat", "15/3 nộp báo cáo quý", { date: calendar(3, 15) });
p(
  "email",
  "Cuộc họp sẽ diễn ra vào lúc 14h00 ngày 20/09/2026 tại phòng họp A.",
  { date: calendar(9, 20, 2026), time: clock(14) },
);
p("email", "Vui lòng phản hồi trước 17h ngày mai.", {
  date: relative(1),
  time: {
    start: { hour: 0, minute: 0 },
    end: { hour: 17, minute: 0 },
    open: "start",
  },
});
p("email", "Hạn chót nộp hồ sơ là ngày 30 tháng 9 năm 2026.", {
  date: calendar(9, 30, 2026),
});
p(
  "email",
  "Chúng tôi sẽ liên hệ lại với anh trong vòng 3 ngày làm việc.",
  duration(3, "day"),
);
p(
  "email",
  "Lớp học diễn ra vào thứ hai, thứ tư và thứ sáu hàng tuần từ 19h đến 21h.",
  {
    ...recurrence("weekly", { byDay: ["MO", "WE", "FR"] }),
    time: window(19, 21),
  },
);
p("email", "Văn phòng nghỉ Tết từ 26 tháng chạp đến hết mùng 5 tháng giêng.", {
  date: {
    kind: "calendarRange",
    from: { month: 12, day: 26 },
    to: { month: 1, day: 5 },
    lunar: true,
  },
});
p("email", "Buổi đào tạo kéo dài 2 tiếng rưỡi.", duration(2.5, "hour"));
p("email", "Hệ thống bảo trì từ 23h đến 5h sáng.", { time: window(23, 5) });
p("email", "Lịch phỏng vấn của bạn: 9h30 sáng thứ ba tuần sau.", {
  date: weekdayMod("next", "TU"),
  time: clock(9, 30),
});
p(
  "email",
  "Tiền nhà thanh toán vào ngày 5 hàng tháng.",
  recurrence("monthly", { byMonthDay: [5] }),
);
p(
  "note",
  "nhắc mẹ uống thuốc 8h sáng và 8h tối",
  { time: clock(8) },
  { time: clock(20) },
);
p("note", "sinh nhật bà ngoại rằm tháng 7 âm lịch", { date: lunar(7, 15) });
p("note", "giỗ ông nội mùng 10 tháng 3 âm", { date: lunar(3, 10) });
p("note", "đổi dầu xe 3 tháng một lần", recurrence("monthly", { interval: 3 }));
p(
  "note",
  "khám thai 2 tuần một lần cho đến hết tháng 12",
  recurrence("weekly", {
    interval: 2,
    until: { kind: "calendarPeriod", month: 12, edge: "end" },
  }),
);
p("note", "đi bơi mỗi sáng thứ bảy lúc 6h", {
  ...recurrence("weekly", { byDay: ["SA"] }),
  time: clock(6),
});
p("note", "trả sách thư viện cuối tháng", {
  date: unit("month", "this", "end"),
});
p("note", "học phí đóng đầu tháng 10", {
  date: { kind: "calendarPeriod", month: 10, edge: "start" },
});
p("note", "vé máy bay bay lúc 6 giờ 15 phút sáng ngày 2/9", {
  date: calendar(9, 2),
  time: clock(6, 15),
});
p("note", "họp phụ huynh cuối tuần này", {
  date: { kind: "dayGroup", group: "weekend", modifier: "this" },
});
p(
  "speech",
  "Tôi sẽ gọi lại cho anh sau hai tiếng nữa.",
  shift(2, "hour", "after"),
);
p("speech", "Chúng ta gặp nhau vào giữa trưa mai nhé.", {
  date: relative(1),
  time: named("noon"),
});
p(
  "speech",
  "Bố mẹ tôi cưới nhau cách đây ba mươi năm.",
  shift(30, "year", "before"),
);
p(
  "speech",
  "Cô ấy nghỉ phép từ thứ hai đến thứ tư.",
  recurrence("weekly", { byDay: ["MO", "TU", "WE"] }),
);
p("speech", "Con phải về nhà trước 10 giờ đêm.", {
  time: {
    start: { hour: 0, minute: 0 },
    end: { hour: 22, minute: 0 },
    open: "start",
  },
});
p(
  "speech",
  "Cửa hàng mở cửa từ 8 giờ sáng đến 10 giờ tối tất cả các ngày trong tuần.",
  { ...recurrence("weekly", { byDay: WEEKDAYS }), time: window(8, 22) },
);
p("speech", "Anh ấy sinh ngày 20 tháng 11 năm 1990.", {
  date: calendar(11, 20, 1990),
});
p("speech", "Kỳ nghỉ hè bắt đầu từ đầu tháng 6.", {
  date: { kind: "calendarPeriod", month: 6, edge: "start" },
});
p("speech", "Trung thu cả nhà đi Hội An.", { date: holiday("mid-autumn") });
p("speech", "Tết Dương lịch được nghỉ bù.", { date: holiday("new-year") });
p(
  "speech",
  "Mình tập gym ba lần một tuần.",
  recurrence("weekly", { timesPer: 3 }),
);
p("speech", "Buổi lễ bắt đầu lúc chín giờ sáng chủ nhật.", {
  date: weekday("SU"),
  time: clock(9),
});
p("speech", "Chuyến tàu khởi hành lúc 21 giờ 45 phút.", {
  time: clock(21, 45),
});
p("speech", "Hôm kia tôi gặp cô ấy ở chợ.", { date: relative(-2) });
p("speech", "Năm ngoái công ty tăng trưởng tốt.", {
  date: unit("year", "last"),
});

// --- adversarial: ambiguous words read as time, numbers nearby ---------------
a("năm", "họp lúc năm giờ chiều", { time: clock(17) });
a("năm", "tháng năm năm nay rất nóng", {
  date: { kind: "calendarPeriod", month: 5, modifier: "this" },
});
a("năm", "năm giờ sáng thứ năm tuần sau", {
  date: weekdayMod("next", "TH"),
  time: clock(5),
});
a("năm", "cả năm chỉ được nghỉ năm ngày dịp Tết", {
  date: holiday("tet"),
  duration: { amount: 5, unit: "day" },
});
a("chiều", "chiều thứ năm lúc hai giờ", {
  date: weekday("TH"),
  time: clock(14),
});
a("chiều", "chiều cao 1m70, hẹn chiều mai", {
  date: relative(1),
  time: part("afternoon"),
});
a("tối", "tối đa 5 người, tối nay 7h", { date: relative(0), time: clock(19) });
a("sáng", "sáng tạo hơn vào sáng thứ hai", {
  date: weekday("MO"),
  time: part("morning"),
});
a("mai", "hoa mai nở, mai mình đi chợ", { date: relative(1) });
a("thứ", "thứ này để thứ sáu tuần sau bàn", { date: weekdayMod("next", "FR") });
a("tư", "tư vấn lúc 4h chiều thứ tư", { date: weekday("WE"), time: clock(16) });
a("ngày", "ngày càng bận, ngày mai còn bận hơn", { date: relative(1) });
a("giờ", "giờ giấc thất thường, họp 3h chiều", { time: clock(15) });
a("số", "phòng 302 lúc 3h chiều", { time: clock(15) });
a("số", "gọi 0912 345 678 trước 5 giờ chiều", {
  time: {
    start: { hour: 0, minute: 0 },
    end: { hour: 17, minute: 0 },
    open: "start",
  },
});
a("số", "giá 150k, giao hàng ngày mai", { date: relative(1) });
a("số", "đơn 2026 giao 15/3", { date: calendar(3, 15) });
a("số", "số 15 đường 3/2, hẹn 15/3", { date: calendar(3, 15) });
a("số", "tỉ số 3-1 trận tối qua", {
  date: relative(-1),
  time: part("evening"),
});
a("qua", "đi qua cầu rồi rẽ trái, hôm qua tôi làm vậy", { date: relative(-1) });
a("kia", "bên kia đường, ngày kia gặp", { date: relative(2) });
a("lần", "lần này họp mỗi thứ hai", recurrence("weekly", { byDay: ["MO"] }));
a(
  "trước",
  "trước mặt mọi người, 3 ngày trước anh đã nói",
  shift(3, "day", "before"),
);
a("sau", "sau lưng ai đó, 2 ngày sau mới biết", shift(2, "day", "after"));
a("đầu", "đầu tư từ đầu tháng 3", {
  date: { kind: "calendarPeriod", month: 3, edge: "start" },
});
a("cuối", "cuối cùng cũng xong, cuối tuần đi chơi", {
  date: { kind: "dayGroup", group: "weekend" },
});
a("mixed", "3pm mai ok?", { date: relative(1), time: clock(15) });
a("mixed", "meeting 10am thứ hai", { date: weekday("MO"), time: clock(10) });
// Chat spellings next to their homographs: "h" alone is not an hour, "trc"
// is only a modifier after a unit, "giờ" inside an office phrase is not a unit.
a("chat", "sếp ơi e xin nghỉ hnay nha :))", { date: relative(0) });
a("chat", "deadline cuối giờ chiều t6 nhé", {
  date: weekday("FR"),
  time: clock(17),
});
a("chat", "hqua e gửi r, tuần trc cx gửi", { date: relative(-1) }, {
  date: unit("week", "last"),
});
a("giờ", "gọi trong giờ hành chính thôi nhé, ngoài giờ không ai nghe", {
  time: window(8, 17),
});

writeFileSync(
  new URL("prose.jsonl", gold),
  prose.map((v) => JSON.stringify(v)).join("\n") + "\n",
);
writeFileSync(
  new URL("adversarial.jsonl", gold),
  adversarial.map((v) => JSON.stringify(v)).join("\n") + "\n",
);
console.log(
  `Authored ${prose.length} prose and ${adversarial.length} adversarial cases.`,
);
