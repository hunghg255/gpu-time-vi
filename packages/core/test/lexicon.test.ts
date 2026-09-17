import { expect, it } from "vitest";
import {
  holiday,
  key,
  mentionsTime,
  month,
  number,
  spelledNumber,
  unit,
  weekday,
} from "../src/lexicon.js";

it("normalizes a lookup key", () => {
  expect(key("  Thứ   Hai ")).toBe("thứ hai");
  expect(key("ngày".normalize("NFD"))).toBe("ngày");
});

it("reads single number words and digits", () => {
  expect(number("5")).toBe(5);
  expect(number("năm")).toBe(5);
  expect(number("tư")).toBe(4);
  expect(number("mười")).toBe(10);
  expect(number("nửa")).toBe(0.5);
  expect(number("vài")).toBe(3);
  expect(number("giờ")).toBeNaN();
});

it("combines spoken numbers", () => {
  const read = (text: string) => spelledNumber(text.split(" "));
  expect(read("mười lăm")).toBe(15);
  expect(read("mười một")).toBe(11);
  expect(read("hai mươi")).toBe(20);
  expect(read("hai mươi mốt")).toBe(21);
  expect(read("hai mươi lăm")).toBe(25);
  expect(read("hai mươi tư")).toBe(24);
  expect(read("ba mươi")).toBe(30);
  expect(read("một trăm")).toBe(100);
  expect(read("một trăm hai mươi")).toBe(120);
  expect(read("hai nghìn không trăm hai mươi sáu")).toBe(2026);
  expect(read("hai rưỡi")).toBe(2.5);
  expect(read("hai ngàn")).toBe(2000);
  // Not numbers.
  expect(read("mốt hai")).toBeNaN();
  expect(read("hai ba")).toBeNaN();
  expect(read("mươi hai")).toBeNaN();
  expect(read("năm giờ")).toBeNaN();
});

it("reads weekdays in every spelling", () => {
  expect(weekday("thứ hai")).toBe("MO");
  expect(weekday("Thứ Hai")).toBe("MO");
  expect(weekday("thứ 2")).toBe("MO");
  expect(weekday("t2")).toBe("MO");
  expect(weekday("T7")).toBe("SA");
  expect(weekday("thứ tư")).toBe("WE");
  expect(weekday("thứ bốn")).toBe("WE");
  expect(weekday("thứ năm")).toBe("TH");
  expect(weekday("thứ bảy")).toBe("SA");
  expect(weekday("chủ nhật")).toBe("SU");
  expect(weekday("CN")).toBe("SU");
  expect(weekday("chúa nhật")).toBe("SU");
  expect(weekday("thứ 8")).toBeUndefined();
  expect(weekday("thứ 1")).toBeUndefined();
  expect(weekday("thứ")).toBeUndefined();
  expect(weekday("hai")).toBeUndefined();
});

it("reads months by number and by name", () => {
  expect(month("3")).toBe(3);
  expect(month("tháng 3")).toBe(3);
  expect(month("12")).toBe(12);
  expect(month("13")).toBeUndefined();
  expect(month("giêng")).toBe(1);
  expect(month("tháng giêng")).toBe(1);
  expect(month("chạp")).toBe(12);
  expect(month("tư")).toBe(4);
  expect(month("mười hai")).toBe(12);
  expect(month("ngày")).toBeUndefined();
});

it("reads units including chat spellings", () => {
  expect(unit("giờ")).toBe("hour");
  expect(unit("tiếng")).toBe("hour");
  expect(unit("phút")).toBe("minute");
  expect(unit("ngày")).toBe("day");
  expect(unit("hôm")).toBe("day");
  expect(unit("tuần")).toBe("week");
  expect(unit("tháng")).toBe("month");
  expect(unit("năm")).toBe("year");
  expect(unit("h")).toBe("hour");
  expect(unit("p")).toBe("minute");
  expect(unit("quý")).toBeUndefined();
});

it("looks holidays up by phrase", () => {
  expect(holiday("Tết")).toBe("tet");
  expect(holiday("tết nguyên đán")).toBe("tet");
  expect(holiday("ngày Giỗ tổ Hùng Vương")).toBe("hung-kings");
  expect(holiday("lễ Giáng sinh")).toBe("christmas");
  expect(holiday("Noel")).toBe("christmas");
  expect(holiday("Trung thu")).toBe("mid-autumn");
  expect(holiday("Quốc khánh")).toBe("national-day");
  expect(holiday("giao thừa")).toBe("tet-eve");
  expect(holiday("30/4")).toBeUndefined();
});

it("flags text that mentions time", () => {
  expect(mentionsTime("họp lúc 3 giờ chiều")).toBe(true);
  expect(mentionsTime("thứ hai")).toBe(true);
  expect(mentionsTime("sáng mai")).toBe(true);
  expect(mentionsTime("Tết này")).toBe(true);
  expect(mentionsTime("xin chào bạn")).toBe(false);
  expect(mentionsTime("hoa đẹp quá")).toBe(false);
});
