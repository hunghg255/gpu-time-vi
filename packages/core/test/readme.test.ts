import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineParser } from "../src/index.js";
import { promotedModel } from "./gold.ts";

// The examples the README shows, run through the public API exactly as a
// reader would. They wait for a promoted model like every accuracy suite.
const reference = "2026-09-17T09:00:00+07:00";
const examples: [
  string,
  { start: string; end?: string; allDay: boolean }[],
  string[]?,
][] = [
  [
    "họp nhóm 3 giờ chiều thứ hai tuần sau",
    [{ start: "2026-09-21T15:00:00+07:00", allDay: false }],
  ],
  [
    "thứ bảy chủ nhật từ 1 giờ đến 8 giờ tối",
    [
      {
        start: "2026-09-19T13:00:00+07:00",
        end: "2026-09-19T20:00:00+07:00",
        allDay: false,
      },
      {
        start: "2026-09-20T13:00:00+07:00",
        end: "2026-09-20T20:00:00+07:00",
        allDay: false,
      },
    ],
  ],
  ["mùng 1 Tết", [{ start: "2027-02-06T00:00:00+07:00", allDay: true }]],
  ["2 tiếng nữa", [{ start: "2026-09-17T11:00:00+07:00", allDay: false }]],
  [
    "mỗi thứ hai từ 9h đến 11h",
    [
      {
        start: "2026-09-21T09:00:00+07:00",
        end: "2026-09-21T11:00:00+07:00",
        allDay: false,
      },
      {
        start: "2026-09-28T09:00:00+07:00",
        end: "2026-09-28T11:00:00+07:00",
        allDay: false,
      },
    ],
    [
      "DTSTART;TZID=Asia/Ho_Chi_Minh:20260921T090000\nRRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
    ],
  ],
  ["rằm tháng 8", [{ start: "2026-09-25T00:00:00+07:00", allDay: true }]],
  ["cách đây 3 ngày", [{ start: "2026-09-14T09:00:00+07:00", allDay: false }]],
  ["sáng mai 7h30", [{ start: "2026-09-18T07:30:00+07:00", allDay: false }]],
];

describe.skipIf(!promotedModel)("README examples", () => {
  let parser: Awaited<ReturnType<typeof defineParser>>;
  beforeAll(async () => {
    parser = await defineParser({ backend: "cpu" });
  });
  afterAll(() => parser.dispose());
  it.each(examples)("%s", async (text, occurrences, rrules) => {
    const result = await parser.parse(text, { reference, limit: 2 });
    expect(result.occurrences).toEqual(occurrences);
    if (rrules) expect(result.rrules).toEqual(rrules);
    expect(
      result.diagnostics.filter((value) => value.severity === "error"),
    ).toEqual([]);
  });
});
