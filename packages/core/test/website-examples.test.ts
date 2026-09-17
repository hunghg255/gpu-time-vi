import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineParser } from "../src/index.js";
import { examples } from "../../../apps/website/src/lib/demo.ts";
import { promotedModel } from "./gold.ts";

// Every phrase the website offers under "Chạm một câu, xem ngày giờ", with
// the dates a reader should see at a fixed reference (Thursday 2026-09-17,
// 09:00 in Asia/Ho_Chi_Minh). Each row was checked by hand against the civil
// and lunar calendars; a model or compiler change that moves one turns red
// here before it reaches the demo.
const reference = "2026-09-17T09:00:00+07:00";
const expected: [string, [string, string | null][], string[]?][] = [
  ["9h sáng mai", [["2026-09-18T09:00:00+07:00", null]]],
  [
    "đặt bàn tối ngày 2 tháng 10 lúc 8 giờ",
    [["2026-10-02T20:00:00+07:00", null]],
  ],
  ["7 giờ kém 15 tối", [["2026-09-17T18:45:00+07:00", null]]],
  ["cà phê sáng chủ nhật lúc 8h30", [["2026-09-20T08:30:00+07:00", null]]],
  ["bay lúc 6h15 sáng ngày 20 tháng 12", [["2026-12-20T06:15:00+07:00", null]]],
  [
    "20 phút nữa trong nửa tiếng",
    [["2026-09-17T09:20:00+07:00", "2026-09-17T09:50:00+07:00"]],
  ],
  ["khoảng 2 tiếng nữa", [["2026-09-17T11:00:00+07:00", null]]],
  ["khám lại sau 2 tuần", [["2026-10-01T09:00:00+07:00", null]]],
  ["tối hôm qua lúc 9h", [["2026-09-16T21:00:00+07:00", null]]],
  ["thứ ba tuần trước", [["2026-09-08T00:00:00+07:00", null]]],
  [
    "nộp báo cáo trước 5h chiều thứ sáu",
    [["2026-09-18T00:00:00+07:00", "2026-09-18T17:00:00+07:00"]],
  ],
  ["gửi báo cáo đầu giờ chiều mai", [["2026-09-18T13:00:00+07:00", null]]],
  ["cuối tháng này", [["2026-09-30T00:00:00+07:00", null]]],
  [
    "từ 4/9 đến 8/9",
    [["2027-09-04T00:00:00+07:00", "2027-09-09T00:00:00+07:00"]],
  ],
  [
    "nghỉ từ 30/4 đến hết 1/5",
    [["2027-04-30T00:00:00+07:00", "2027-05-02T00:00:00+07:00"]],
  ],
  [
    "từ 17/8/2027 2 giờ chiều đến 19/8/2027 2 giờ chiều",
    [["2027-08-17T14:00:00+07:00", "2027-08-19T14:00:00+07:00"]],
  ],
  [
    "mỗi ngày thường lúc 9 giờ sáng",
    [
      ["2026-09-17T09:00:00+07:00", null],
      ["2026-09-18T09:00:00+07:00", null],
      ["2026-09-21T09:00:00+07:00", null],
    ],
    ["RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR"],
  ],
  [
    "thứ 2 4 6 lúc 6h chiều",
    [
      ["2026-09-18T18:00:00+07:00", null],
      ["2026-09-21T18:00:00+07:00", null],
      ["2026-09-23T18:00:00+07:00", null],
    ],
  ],
  [
    "lịch học thứ 3 và thứ 5 từ 7h đến 9h tối",
    [
      ["2026-09-17T19:00:00+07:00", "2026-09-17T21:00:00+07:00"],
      ["2026-09-22T19:00:00+07:00", "2026-09-22T21:00:00+07:00"],
    ],
  ],
  [
    "thứ sáu từ 10 giờ tối đến 2 giờ sáng",
    [["2026-09-18T22:00:00+07:00", "2026-09-19T02:00:00+07:00"]],
  ],
  [
    "uống thuốc 8h sáng và 8h tối hàng ngày",
    [
      ["2026-09-17T20:00:00+07:00", null],
      ["2026-09-18T08:00:00+07:00", null],
      ["2026-09-18T20:00:00+07:00", null],
    ],
    ["RRULE:FREQ=DAILY;INTERVAL=1", "RRULE:FREQ=DAILY;INTERVAL=1"],
  ],
  [
    "thứ sáu cuối cùng mỗi tháng",
    [
      ["2026-09-25T00:00:00+07:00", null],
      ["2026-10-30T00:00:00+07:00", null],
      ["2026-11-27T00:00:00+07:00", null],
    ],
    ["RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=FR;BYSETPOS=-1"],
  ],
  [
    "ngày 5 hàng tháng trong 12 tháng",
    [
      ["2026-10-05T00:00:00+07:00", null],
      ["2026-11-05T00:00:00+07:00", null],
      ["2026-12-05T00:00:00+07:00", null],
    ],
    ["RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=5;UNTIL=20270916"],
  ],
  [
    "2 tuần một lần vào trưa thứ sáu",
    [
      ["2026-09-18T11:00:00+07:00", "2026-09-18T13:00:00+07:00"],
      ["2026-10-02T11:00:00+07:00", "2026-10-02T13:00:00+07:00"],
      ["2026-10-16T11:00:00+07:00", "2026-10-16T13:00:00+07:00"],
    ],
    ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR"],
  ],
  [
    "mỗi 3 tháng một lần",
    [
      ["2026-09-17T00:00:00+07:00", null],
      ["2026-12-17T00:00:00+07:00", null],
      ["2027-03-17T00:00:00+07:00", null],
    ],
    ["RRULE:FREQ=MONTHLY;INTERVAL=3"],
  ],
  [
    "tập gym 3 lần một tuần",
    [
      ["2026-09-18T00:00:00+07:00", null],
      ["2026-09-21T00:00:00+07:00", null],
      ["2026-09-23T00:00:00+07:00", null],
    ],
    ["RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR"],
  ],
  [
    "mỗi ngày trừ chủ nhật",
    [
      ["2026-09-17T00:00:00+07:00", null],
      ["2026-09-18T00:00:00+07:00", null],
      ["2026-09-19T00:00:00+07:00", null],
    ],
    ["RRULE:FREQ=DAILY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR,SA"],
  ],
  [
    "mỗi thứ hai đến hết tháng 12",
    [
      ["2026-09-21T00:00:00+07:00", null],
      ["2026-09-28T00:00:00+07:00", null],
      ["2026-10-05T00:00:00+07:00", null],
    ],
    ["RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;UNTIL=20261231"],
  ],
  [
    "sinh nhật 20/10 hàng năm",
    [["2026-10-20T00:00:00+07:00", null]],
    ["RRULE:FREQ=YEARLY;INTERVAL=1;BYMONTH=10;BYMONTHDAY=20"],
  ],
  [
    "thứ hai 9h và thứ tư 10h",
    [
      ["2026-09-21T09:00:00+07:00", null],
      ["2026-09-23T10:00:00+07:00", null],
    ],
  ],
  ["mùng 1 Tết", [["2027-02-06T00:00:00+07:00", null]]],
  ["rằm tháng 8", [["2026-09-25T00:00:00+07:00", null]]],
  ["23 tháng chạp", [["2027-01-30T00:00:00+07:00", null]]],
  [
    "từ 27 tháng chạp đến mùng 6",
    [["2027-02-03T00:00:00+07:00", "2027-02-12T00:00:00+07:00"]],
  ],
  ["Giỗ tổ", [["2027-04-16T00:00:00+07:00", null]]],
  ["Giáng sinh năm nay 7h tối", [["2026-12-25T19:00:00+07:00", null]]],
  [
    "giờ Ngọ mùng 5 tháng 5 năm Bính Ngọ",
    [["2026-06-19T11:00:00+07:00", "2026-06-19T13:00:00+07:00"]],
  ],
  ["Tết Đinh Mùi", [["2027-02-06T00:00:00+07:00", null]]],
  ["mùng 6 tháng 6 nhuận năm 2025", [["2025-07-30T00:00:00+07:00", null]]],
  ["ok dc, t2 9h nha :))", [["2026-09-21T09:00:00+07:00", null]]],
  ["sếp ơi e xin nghỉ hnay nha :))", [["2026-09-17T00:00:00+07:00", null]]],
  ["2h chiều thứ tám tuần này", [["2026-09-20T14:00:00+07:00", null]]],
  ["thứ sáu tuần sau nữa", [["2026-10-02T00:00:00+07:00", null]]],
  ["nửa tháng nữa", [["2026-10-02T09:00:00+07:00", null]]],
];

describe.skipIf(!promotedModel)("website examples", () => {
  let parser: Awaited<ReturnType<typeof defineParser>>;
  beforeAll(async () => {
    parser = await defineParser({ backend: "cpu" });
  });
  afterAll(() => parser.dispose());

  it("covers every example on the page", () => {
    expect(expected.map(([text]) => text)).toEqual(
      examples.map((item) => item.text),
    );
  });

  it.each(expected)("%s", async (text, occurrences, rrules = []) => {
    const result = await parser.parse(text, {
      reference,
      timeZone: "Asia/Ho_Chi_Minh",
      limit: 3,
    });
    expect(
      result.diagnostics.filter((value) => value.severity === "error"),
    ).toEqual([]);
    expect(
      result.occurrences.map((value) => [value.start, value.end ?? null]),
    ).toEqual(occurrences);
    expect(
      result.rrules.map(
        (value) =>
          value.split("\n").find((line) => line.startsWith("RRULE:")) ?? "",
      ),
    ).toEqual(rrules);
  });
});
