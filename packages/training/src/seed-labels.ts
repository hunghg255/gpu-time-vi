import { readFileSync, writeFileSync } from "node:fs";
import { tokenize } from "../../core/src/tokenizer.ts";
import { LABELS, type Label } from "../../core/src/labels.ts";
import type { Schedule } from "../../core/src/types.ts";

// Per-token roles for every grammar case, following the contract in
// docs/vietnamese-time-expressions.md. One short code per non-whitespace token;
// a leading "|" marks the first token of a new clause. The expected schedule is
// the grammar case's own. Text with no entry here has no oracle case yet.

const codes: Record<string, Label> = {
  O: "O",
  NUM: "NUM",
  ORD: "ORD",
  UNIT: "UNIT",
  DB: "DIR_BEFORE",
  DA: "DIR_AFTER",
  NOW: "NOW",
  RD: "REL_DAY",
  DE: "DEICTIC",
  WD: "WEEKDAY",
  DG: "DAYGROUP",
  MON: "MONTH",
  DOM: "DOM",
  YR: "YEAR",
  H: "HOUR",
  MIN: "MINUTE",
  SEC: "SECOND",
  MER: "MERIDIEM",
  TN: "TIME_NAMED",
  DP: "DAYPART",
  RS: "RANGE_START",
  RE: "RANGE_END",
  REC: "RECUR",
  FREQ: "FREQ",
  TM: "TIMES",
  BS: "BOUND_START",
  BE: "BOUND_END",
  CNT: "COUNT",
  DUR: "DUR",
  EX: "EXCEPT",
  HOL: "HOLIDAY",
  J: "JOIN",
  G: "GLUE",
  EDGE: "EDGE",
  CO: "CLOCK_OFFSET",
  LUN: "LUNAR",
};

const roles: Record<string, string> = {
  // now
  "bây giờ": "NOW NOW",
  "hiện tại": "NOW NOW",
  "ngay bây giờ": "NOW NOW NOW",
  // relative-day
  "hôm nay": "RD RD",
  nay: "RD",
  "ngày mai": "RD RD",
  mai: "RD",
  "ngày kia": "RD RD",
  "ngày mốt": "RD RD",
  "hôm qua": "RD RD",
  "hôm kia": "RD RD",
  "bữa nay": "RD RD",
  // relative-day-part
  "sáng mai": "DP RD",
  "tối nay": "DP RD",
  "chiều hôm qua": "DP RD RD",
  "trưa mai": "DP RD",
  "đêm nay": "DP RD",
  "tối thứ sáu": "DP WD WD",
  // weekday
  "thứ hai": "WD WD",
  "thứ 2": "WD WD",
  t2: "WD WD",
  T7: "WD WD",
  "thứ tư": "WD WD",
  "chủ nhật": "WD WD",
  CN: "WD",
  "thứ hai và thứ tư": "WD WD J WD WD",
  // weekday-deictic
  "thứ hai tuần sau": "WD WD UNIT DE",
  "thứ sáu tuần này": "WD WD UNIT DE",
  "thứ ba tuần trước": "WD WD UNIT DE",
  "thứ hai tới": "WD WD DE",
  "chủ nhật này": "WD WD DE",
  "cn tuần sau": "WD UNIT DE",
  // relative-unit
  "tuần sau": "UNIT DE",
  "tuần tới": "UNIT DE",
  "tuần này": "UNIT DE",
  "tuần trước": "UNIT DE",
  "tuần rồi": "UNIT DE",
  "tháng sau": "UNIT DE",
  "tháng này": "UNIT DE",
  "tháng trước": "UNIT DE",
  "năm sau": "UNIT DE",
  "năm nay": "UNIT DE",
  "năm ngoái": "UNIT DE",
  // relative-unit-edge
  "đầu tuần sau": "EDGE UNIT DE",
  "cuối tháng": "EDGE UNIT",
  "cuối tháng sau": "EDGE UNIT DE",
  "đầu năm sau": "EDGE UNIT DE",
  "cuối năm nay": "EDGE UNIT DE",
  // day-group
  "cuối tuần": "DG DG",
  "cuối tuần này": "DG DG DE",
  "cuối tuần sau": "DG DG DE",
  "ngày thường": "DG DG",
  "các ngày làm việc": "REC DG DG DG",
  "từ thứ hai đến thứ sáu": "RS WD WD RE WD WD",
  // clock
  "3 giờ": "H G",
  "15 giờ": "H G",
  "15h": "H G",
  "15h30": "H G MIN",
  "15g30": "H G MIN",
  "15:30": "H G MIN",
  "15 giờ 30": "H G MIN",
  "15 giờ 30 phút": "H G MIN G",
  "3 rưỡi": "H CO",
  "3 giờ rưỡi": "H G CO",
  "3 giờ kém 15": "H G CO MIN",
  "3h kém 15": "H G CO MIN",
  "3 giờ hơn 10": "H G CO MIN",
  "3pm": "H MER",
  "3 pm": "H MER",
  "10:05:20": "H G MIN G SEC",
  // clock-meridiem
  "3 giờ chiều": "H G MER",
  "3h chiều": "H G MER",
  "7 giờ sáng": "H G MER",
  "7 giờ tối": "H G MER",
  "12 giờ trưa": "H G MER",
  "1 giờ trưa": "H G MER",
  "12 giờ đêm": "H G MER",
  "11 giờ đêm": "H G MER",
  "2 giờ đêm": "H G MER",
  "3 rưỡi chiều": "H CO MER",
  "7 giờ kém 15 tối": "H G CO MIN MER",
  "chiều 3 giờ": "MER H G",
  "sáng 7h": "MER H G",
  "15h chiều": "H G MER",
  // clock-spelled
  "ba giờ chiều": "H G MER",
  "mười lăm giờ": "H H G",
  "bảy giờ rưỡi sáng": "H G CO MER",
  "hai mươi mốt giờ": "H H H G",
  // time-named
  "nửa đêm": "TN TN",
  "giữa trưa": "TN TN",
  "đúng trưa": "TN TN",
  // day-part
  "buổi sáng": "G DP",
  sáng: "DP",
  "buổi trưa": "G DP",
  chiều: "DP",
  "buổi tối": "G DP",
  đêm: "DP",
  khuya: "DP",
  // time-window
  "từ 9h đến 17h": "RS H G RE H G",
  "9h-17h": "H G RE H G",
  "9h tới 17h": "H G RE H G",
  "từ 9 đến 5 giờ chiều": "RS H RE H G MER",
  "từ 8 giờ tối đến 12 giờ đêm": "RS H G MER RE H G MER",
  "từ 9 giờ sáng đến 11 giờ trưa": "RS H G MER RE H G MER",
  "từ 14h30 đến 16h": "RS H G MIN RE H G",
  "giữa 9h và 10h": "RS H G RE H G",
  // open-clock
  "sau 6 giờ tối": "DA H G MER",
  "trước 9h sáng": "DB H G MER",
  "từ 6 giờ tối": "RS H G MER",
  // calendar-date
  "ngày 15": "G DOM",
  "ngày 15 tháng 3": "G DOM G MON",
  "15 tháng 3": "DOM G MON",
  "15/3": "DOM G MON",
  "15-3": "DOM G MON",
  "ngày 15 tháng 3 năm 2026": "G DOM G MON G YR",
  "15/3/2026": "DOM G MON G YR",
  "15-3-2026": "DOM G MON G YR",
  "15.3.2026": "DOM G MON G YR",
  "2026-03-15": "YR G MON G DOM",
  "ngày 1 tháng tư": "G DOM G MON",
  "30/4": "DOM G MON",
  "2/9": "DOM G MON",
  // calendar-month
  "tháng 3": "G MON",
  "tháng tư": "G MON",
  "tháng 3 năm 2026": "G MON G YR",
  "3/2026": "MON G YR",
  "tháng 3 năm sau": "G MON UNIT DE",
  "tháng 12 năm ngoái": "G MON UNIT DE",
  // calendar-year
  "năm 2026": "G YR",
  "năm 2030": "G YR",
  // calendar-period
  "đầu tháng 3": "EDGE G MON",
  "cuối tháng 12": "EDGE G MON",
  "giữa tháng 3": "EDGE G MON",
  "tuần thứ 2 của tháng 3": "UNIT ORD ORD G G MON",
  "tuần đầu tháng 3": "UNIT EDGE G MON",
  // date-range
  "từ ngày 10 đến ngày 15 tháng 3": "RS G DOM RE G DOM G MON",
  "10-15/3": "DOM RE DOM G MON",
  "từ 15/3 đến 20/4": "RS DOM G MON RE DOM G MON",
  "từ tháng 3 đến tháng 5": "RS G MON RE G MON",
  "từ 25/12/2026 đến 2/1/2027": "RS DOM G MON G YR RE DOM G MON G YR",
  // holiday-solar
  "Giáng sinh": "HOL HOL",
  Noel: "HOL",
  "đêm Giáng sinh": "HOL HOL HOL",
  "Tết dương lịch": "HOL HOL HOL",
  "Quốc khánh": "HOL HOL",
  "ngày Nhà giáo Việt Nam": "G HOL HOL HOL HOL",
  "Quốc tế phụ nữ": "HOL HOL HOL HOL",
  "lễ 30/4": "O DOM G MON",
  Valentine: "HOL",
  "Quốc tế thiếu nhi": "HOL HOL HOL HOL",
  // holiday-lunar
  Tết: "HOL",
  "Tết Nguyên Đán": "HOL HOL HOL",
  "Tết âm lịch": "HOL HOL HOL",
  "giao thừa": "HOL HOL",
  "Trung thu": "HOL HOL",
  "Tết Trung thu": "HOL HOL HOL",
  "Giỗ tổ Hùng Vương": "HOL HOL HOL HOL",
  "Giỗ tổ": "HOL HOL",
  "Tết Đoan Ngọ": "HOL HOL HOL",
  "lễ Vu Lan": "G HOL HOL",
  "Tết ông Táo": "HOL HOL HOL",
  "Tết Nguyên tiêu": "HOL HOL HOL",
  // lunar-date
  "mùng 1": "LUN DOM",
  "mùng 1 Tết": "LUN DOM HOL",
  "mùng 2 Tết": "LUN DOM HOL",
  "30 Tết": "DOM HOL",
  rằm: "LUN",
  "rằm tháng giêng": "LUN G MON",
  "rằm tháng 7": "LUN G MON",
  "rằm tháng 8": "LUN G MON",
  "15/8 âm lịch": "DOM G MON LUN LUN",
  "15/8 ÂL": "DOM G MON LUN",
  "ngày 15 tháng 8 âm lịch": "G DOM G MON LUN LUN",
  "mùng 10 tháng 3 âm lịch": "LUN DOM G MON LUN LUN",
  "10/3 âm lịch": "DOM G MON LUN LUN",
  "tháng 7 âm lịch": "G MON LUN LUN",
  "tháng giêng": "G MON",
  "tháng chạp": "G MON",
  "23 tháng chạp": "DOM G MON",
  "mùng 5 tháng 5": "LUN DOM G MON",
  "ngày 1 tháng 1 âm lịch năm 2027": "G DOM G MON LUN LUN G YR",
  // shift
  "sau 2 tiếng": "DA NUM UNIT",
  "2 tiếng nữa": "NUM UNIT DA",
  "2 tiếng sau": "NUM UNIT DA",
  "30 phút nữa": "NUM UNIT DA",
  "3 ngày trước": "NUM UNIT DB",
  "cách đây 3 ngày": "DB DB NUM UNIT",
  "2 tuần nữa": "NUM UNIT DA",
  "3 tháng sau": "NUM UNIT DA",
  "1 năm nữa": "NUM UNIT DA",
  "1 tiếng 30 phút nữa": "NUM UNIT NUM UNIT DA",
  "khoảng 2 tiếng nữa": "O NUM UNIT DA",
  "vài ngày nữa": "NUM UNIT DA",
  "hai tuần trước": "NUM UNIT DB",
  "2 ngày tới": "NUM UNIT DA",
  "3 tuần kể từ bây giờ": "NUM UNIT DA DA NOW NOW",
  // anchored-shift
  "2 ngày sau Tết": "NUM UNIT DA HOL",
  "3 ngày trước 15/3": "NUM UNIT DB DOM G MON",
  "1 tuần sau thứ hai": "NUM UNIT DA WD WD",
  "2 tiếng trước trưa mai": "NUM UNIT DB TN RD",
  // duration
  "trong 2 tiếng": "DUR NUM UNIT",
  "trong vòng 3 ngày": "DUR DUR NUM UNIT",
  "kéo dài 2 tuần": "DUR DUR NUM UNIT",
  "suốt 1 tiếng": "DUR NUM UNIT",
  "trong 90 phút": "DUR NUM UNIT",
  "trong 2 tiếng rưỡi": "DUR NUM UNIT NUM",
  // recurrence
  "mỗi thứ hai": "REC WD WD",
  "các thứ hai": "REC WD WD",
  "thứ hai hàng tuần": "WD WD REC UNIT",
  "mỗi ngày": "REC UNIT",
  "hàng ngày": "REC UNIT",
  "hằng ngày": "REC UNIT",
  "hàng tuần": "REC UNIT",
  "mỗi tuần": "REC UNIT",
  "hàng tháng": "REC UNIT",
  "hàng năm": "REC UNIT",
  "mỗi giờ": "REC UNIT",
  "mỗi 2 tuần": "REC NUM UNIT",
  "2 tuần một lần": "NUM UNIT REC REC",
  "2 tuần 1 lần": "NUM UNIT REC REC",
  "cách tuần": "REC UNIT",
  "cách ngày": "REC UNIT",
  "3 lần một tuần": "NUM TM REC UNIT",
  "3 lần/tuần": "NUM TM REC UNIT",
  "2 lần một ngày": "NUM TM REC UNIT",
  "mỗi thứ hai và thứ tư": "REC WD WD J WD WD",
  "thứ hai, tư, sáu hàng tuần": "WD WD J WD J WD REC UNIT",
  "mỗi thứ hai lúc 8 giờ tối": "REC WD WD O H G MER",
  "hàng ngày lúc 7h sáng": "REC UNIT O H G MER",
  "mỗi cuối tuần": "REC DG DG",
  "mỗi ngày thường": "REC DG DG",
  // recurrence-monthly-yearly
  "ngày 15 hàng tháng": "G DOM REC UNIT",
  "mỗi tháng ngày 15": "REC UNIT G DOM",
  "ngày 1 và 15 hàng tháng": "G DOM J DOM REC UNIT",
  "thứ hai đầu tiên hàng tháng": "WD WD ORD ORD REC UNIT",
  "thứ sáu cuối cùng mỗi tháng": "WD WD ORD ORD REC UNIT",
  "26/3 hàng năm": "DOM G MON REC UNIT",
  "hàng năm vào ngày 26 tháng 3": "REC UNIT O G DOM G MON",
  "cuối tháng hàng tháng": "EDGE UNIT REC UNIT",
  // recurrence-bound
  "mỗi thứ hai bắt đầu từ 1/10": "REC WD WD BS BS BS DOM G MON",
  "hàng tuần kể từ tuần sau": "REC UNIT BS BS UNIT DE",
  "mỗi thứ hai đến hết tháng 12": "REC WD WD BE BE G MON",
  "mỗi thứ hai đến tháng 12": "REC WD WD BE G MON",
  "mỗi thứ hai cho đến 31/12": "REC WD WD BE BE DOM G MON",
  "mỗi ngày tới thứ sáu": "REC UNIT BE WD WD",
  "mỗi thứ hai trong 10 tuần": "REC WD WD DUR NUM UNIT",
  "mỗi thứ hai, 6 lần": "REC WD WD J NUM TM",
  "hàng ngày từ nay đến cuối tháng": "REC UNIT BS NOW BE EDGE UNIT",
  // recurrence-except
  "mỗi ngày trừ chủ nhật": "REC UNIT EX WD WD",
  "các ngày thường trừ thứ sáu": "REC DG DG EX WD WD",
  "mỗi ngày ngoại trừ cuối tuần": "REC UNIT EX EX DG DG",
  "mỗi thứ bảy trừ tuần cuối tháng": "REC WD WD EX UNIT ORD UNIT",
  // combined
  "3 giờ chiều mai": "H G MER RD",
  "mai 3 giờ chiều": "RD H G MER",
  "9h sáng thứ hai": "H G MER WD WD",
  "thứ sáu tuần sau lúc 9h": "WD WD UNIT DE O H G",
  "15/3 lúc 14h": "DOM G MON O H G",
  "tối mai 8 giờ": "DP RD H G",
  "chiều thứ tư lúc 2 giờ": "DP WD WD O H G",
  "ngày 20 tháng 11 lúc 7 giờ sáng": "G DOM G MON O H G MER",
  "sáng mai từ 8h đến 10h": "DP RD RS H G RE H G",
  "mùng 1 Tết lúc 12 giờ đêm": "LUN DOM HOL O H G MER",
  "Giáng sinh lúc 7 giờ tối": "HOL HOL O H G MER",
  "cuối tuần sau lúc 10h sáng": "DG DG DE O H G MER",
  "ngày mai 3 giờ chiều": "RD RD H G MER",
  "2 ngày nữa": "NUM UNIT DA",
  "24 tiếng nữa": "NUM UNIT DA",
  "sang tuần": "DE UNIT",
  "sang năm": "DE UNIT",
  "Tết này": "HOL HOL",
  "Trung thu năm nay": "HOL HOL UNIT DE",
  "từ 27 tháng chạp đến mùng 6": "RS DOM G MON RE LUN DOM",
  "thứ 2 4 6": "WD WD WD WD",
  "thứ 2 4 6 lúc 6h chiều": "WD WD WD WD G H G MER",
  "sau 30p": "DA NUM UNIT",
  "mai họp lúc 9h nhé": "RD O G H G O",
  "20h thứ bảy có trận Việt Nam": "H G WD WD O O O O",
  // multi-clause
  "thứ hai 9h và thứ tư 10h": "WD WD H G J |WD WD H G",
  "thứ hai 9h, thứ tư 10h, thứ sáu 11h": "WD WD H G J |WD WD H G J |WD WD H G",
  "thứ bảy chủ nhật từ 1 giờ đến 8 giờ tối và thứ hai từ 10 giờ tối đến 12 giờ đêm":
    "WD WD WD WD RS H G RE H G MER J |WD WD RS H G MER RE H G MER",
  // prose
  "nhắc tôi họp lúc 3 giờ chiều mai": "O O O O H G MER RD",
  "hẹn bác sĩ vào thứ hai tuần sau lúc 9h sáng":
    "O O O O WD WD UNIT DE O H G MER",
  "deadline nộp báo cáo là 17h thứ sáu": "O O O O O H G WD WD",
  "họp nhóm mỗi thứ tư lúc 2 giờ chiều": "O O REC WD WD O H G MER",
  "cả nhà về quê ăn Tết": "O O O O O HOL",
  "sinh nhật em ấy là ngày 20 tháng 11": "O O O O O G DOM G MON",
  "tàu khởi hành lúc 6 giờ 15 sáng mai": "O O O O H G MIN MER RD",
  "đặt bàn 4 người tối thứ bảy lúc 7 giờ": "O O O O DP WD WD O H G",
  "gọi lại cho anh sau 30 phút nữa": "O O O O DA NUM UNIT DA",
  "lớp yoga diễn ra 3 lần một tuần": "O O O O NUM TM REC UNIT",
  // chat-short
  "t2 9h": "WD WD H G",
  "cn 3h chiều": "WD H G MER",
  "mai 8h": "RD H G",
  "tối nay 8h": "DP RD H G",
  "t6 tuần sau": "WD WD UNIT DE",
  "15/3 14h": "DOM G MON H G",
  "2h nữa": "NUM UNIT DA",
  "sáng mai 7h30": "DP RD H G MIN",
};

interface GrammarCase {
  id: string;
  family: string;
  text: string;
  schedule: Schedule | null;
}
const gold = new URL("../data/gold/", import.meta.url);
const grammar: GrammarCase[] = readFileSync(
  new URL("grammar.jsonl", gold),
  "utf8",
)
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

const output = [];
const missing: string[] = [];
for (const example of grammar) {
  if (example.schedule === null) continue;
  const annotation = roles[example.text];
  if (!annotation) {
    missing.push(example.text);
    continue;
  }
  const codesFor = annotation.split(/\s+/);
  const tokens = tokenize(example.text);
  const words = tokens.filter((token) => token.kind !== 3);
  if (words.length !== codesFor.length)
    throw new Error(
      `${example.id} ${JSON.stringify(example.text)}: ${words.length} tokens, ${codesFor.length} roles`,
    );
  let position = 0;
  const labelled = tokens.map((token) => {
    if (token.kind === 3)
      return {
        start: token.start,
        end: token.end,
        label: "O" as Label,
        clauseStart: false,
      };
    const code = codesFor[position++];
    const clauseStart = code.startsWith("|");
    const label = codes[code.replace(/^\|/, "")];
    if (!label || !LABELS.includes(label))
      throw new Error(`${example.id}: unknown code ${code}`);
    return { start: token.start, end: token.end, label, clauseStart };
  });
  output.push({
    id: example.id.replace("grammar", "oracle"),
    family: example.family,
    text: example.text,
    tokens: labelled,
    schedule: example.schedule,
  });
}
writeFileSync(
  new URL("labels.jsonl", gold),
  output.map((value) => JSON.stringify(value)).join("\n") + "\n",
);
console.log(
  `Labelled ${output.length} oracle cases; ${missing.length} grammar cases without labels.`,
);
for (const text of missing) console.log("  missing:", text);
