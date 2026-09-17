import { expect, it } from "vitest";
import { tokenize, featureRows } from "../src/tokenizer.js";

const texts = (input: string) => tokenize(input).map((token) => token.text);
const identity = (word: string) => tokenize(word)[0].features[0];
const firstClass = (word: string) => (identity(word) >>> 5) & 63;
const flags = (word: string) => (tokenize(word)[0].features[1] >>> 7) & 255;

it("preserves every character and splits attached clock components", () => {
  const text = "T7 CN 1pm-8pm 15h30 10g45 T2 22h-24h";
  const tokens = tokenize(text);
  expect(tokens.map((t) => t.text)).toEqual([
    "T",
    "7",
    " ",
    "CN",
    " ",
    "1",
    "pm",
    "-",
    "8",
    "pm",
    " ",
    "15",
    "h",
    "30",
    " ",
    "10",
    "g",
    "45",
    " ",
    "T",
    "2",
    " ",
    "22",
    "h",
    "-",
    "24",
    "h",
  ]);
  expect(tokens.map((t) => t.text).join("")).toBe(text);
  for (const token of tokens) {
    expect(text.slice(token.start, token.end)).toBe(token.text);
    expect(featureRows(token.features).every((n) => n >= 0 && n < 580)).toBe(
      true,
    );
  }
});

it("keeps a toned syllable as one token and a compound as separate syllables", () => {
  expect(texts("chủ nhật")).toEqual(["chủ", " ", "nhật"]);
  expect(texts("ngày 15/3")).toEqual(["ngày", " ", "15", "/", "3"]);
  expect(texts("3 giờ chiều mai")).toEqual([
    "3",
    " ",
    "giờ",
    " ",
    "chiều",
    " ",
    "mai",
  ]);
  expect(texts("mùng 1 Tết")).toEqual(["mùng", " ", "1", " ", "Tết"]);
  expect(texts("15/8 ÂL")).toEqual(["15", "/", "8", " ", "ÂL"]);
});

it("tells tone and vowel apart through the word hash, not the class", () => {
  const sáu = tokenize("sáu")[0];
  const sau = tokenize("sau")[0];
  const sâu = tokenize("sâu")[0];
  expect(sáu.features[0]).not.toBe(sau.features[0]);
  expect(sáu.features[0]).not.toBe(sâu.features[0]);
  expect(sau.features[0]).not.toBe(sâu.features[0]);
  // Same skeleton "s": the consonant hash cannot separate them.
  expect(sáu.features[1] & 127).toBe(sau.features[1] & 127);
  expect(sáu.features[1] & 127).toBe(sâu.features[1] & 127);
  // A capital only moves the flags.
  const upper = tokenize("Sáu")[0];
  expect((upper.features[0] >>> 17) & 255).toBe((sáu.features[0] >>> 17) & 255);
  expect(flags("Sáu") & 1).toBe(1);
  expect(flags("sáu") & 1).toBe(0);
  expect(flags("SÁU") & 3).toBe(3);
});

it("maps Vietnamese letters onto their own character classes", () => {
  expect(firstClass("a")).toBe(0);
  expect(firstClass("á")).toBe(0);
  expect(firstClass("ạ")).toBe(0);
  expect(firstClass("ă")).toBe(26);
  expect(firstClass("ắ")).toBe(26);
  expect(firstClass("â")).toBe(27);
  expect(firstClass("ấ")).toBe(27);
  expect(firstClass("đ")).toBe(28);
  expect(firstClass("Đ")).toBe(28);
  expect(firstClass("ê")).toBe(29);
  expect(firstClass("ế")).toBe(29);
  expect(firstClass("ô")).toBe(30);
  expect(firstClass("ơ")).toBe(31);
  expect(firstClass("ư")).toBe(32);
  expect(firstClass("ữ")).toBe(32);
  expect(firstClass("0")).toBe(33);
  expect(firstClass("9")).toBe(42);
  expect(firstClass(":")).toBe(43);
  expect(firstClass("-")).toBe(44);
  expect(firstClass("世")).toBeGreaterThanOrEqual(43);
});

it("flags a clock letter that follows a number", () => {
  const [, h] = tokenize("15h30");
  expect((h.features[1] >>> 7) & (1 << 7)).toBe(1 << 7);
  const [hAlone] = tokenize("h");
  expect((hAlone.features[1] >>> 7) & (1 << 7)).toBe(0);
});

it("composes decomposed input and keeps offsets on the caller's string", () => {
  const composed = "ngày mai 3 giờ";
  const decomposed = composed.normalize("NFD");
  expect(decomposed).not.toBe(composed);
  const a = tokenize(composed);
  const b = tokenize(decomposed);
  expect(b.map((token) => token.text)).toEqual(a.map((token) => token.text));
  expect(b.map((token) => token.features)).toEqual(
    a.map((token) => token.features),
  );
  for (const token of b)
    expect(decomposed.slice(token.start, token.end).normalize("NFC")).toBe(
      token.text,
    );
  expect(b[0].start).toBe(0);
  expect(b.at(-1)!.end).toBe(decomposed.length);
});

it(
  "round-trips 10,000 varied Unicode strings with contiguous source offsets",
  { timeout: 30_000 },
  () => {
    const alphabet = [
      "thứ",
      "Tết",
      "1",
      "23",
      " ",
      "\n",
      "\t",
      "é",
      "ế",
      "世",
      "🙂",
      "–",
      "—",
      "'",
      "’",
      ":",
      "_",
      "́",
      "̂́",
      "\r\n",
      "ÂL",
      "h",
    ];
    let seed = 20260909;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    }

    for (let sample = 0; sample < 10_000; sample++) {
      const length = Math.floor(random() * 40);
      const text = Array.from(
        { length },
        () => alphabet[Math.floor(random() * alphabet.length)],
      ).join("");
      const tokens = tokenize(text);
      const composed = text.normalize("NFC");
      expect(tokens.map((token) => token.text).join("")).toBe(composed);
      let offset = 0;
      for (const token of tokens) {
        expect(token.start).toBe(offset);
        expect(token.end).toBeGreaterThanOrEqual(token.start);
        expect(text.slice(token.start, token.end).normalize("NFC")).toBe(
          token.text,
        );
        expect(
          featureRows(token.features).every((row) => row >= 0 && row < 580),
        ).toBe(true);
        offset = token.end;
      }
      expect(offset).toBe(text.length);
    }
  },
);
