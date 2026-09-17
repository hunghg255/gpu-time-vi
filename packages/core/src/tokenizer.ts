import type { RawToken } from "./types.js";

const tokenPattern = /[\p{L}_]+(?:['’][\p{L}]+)*|\d+|\s+|[^\s]/gu;
const punctuationPattern = /^[^\p{L}\d\s]$/u;
const punctuationCharacters = ":-/.,(');&+@!?_=<>[]{}\\\"%#*~`";
const punctuationClasses = [
  ":",
  "-",
  "/",
  ".",
  ",",
  "(",
  "'",
  ";",
  "&",
  "+",
  "@",
];
const lengthBuckets = [1, 2, 3, 4, 6, 8, 12, Infinity];
const numberBuckets = [
  0,
  1,
  2,
  9,
  12,
  23,
  24,
  31,
  59,
  99,
  999,
  1899,
  2099,
  Infinity,
];
// The seven Vietnamese letters outside a-z once the tone mark is removed. Each
// owns a character class of its own; a tone mark only survives in the hashes.
const extendedLetters = "ăâđêôơư";
// Tone marks: grave, acute, tilde, hook above, dot below (U+0300, U+0301,
// U+0303, U+0309, U+0323), built from code points so the source stays readable.
const toneMarks = new RegExp(
  `[${String.fromCharCode(0x300, 0x301, 0x303, 0x309, 0x323)}]`,
  "gu",
);
const combining = /\p{M}/u;
const vowels = /[aeiouyăâêôơư]/gu;

function hash(text: string): number {
  let value = 2166136261;

  for (let index = 0; index < text.length; index++) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  }

  return value >>> 0;
}

/** Lowercase, tone removed, composed: "Ế" → "ê", "á" → "a", "đ" → "đ". */
function baseLetter(character: string): string {
  return character
    .toLowerCase()
    .normalize("NFD")
    .replace(toneMarks, "")
    .normalize("NFC");
}

const classes = new Map<string, number>();

// 0-25 a-z, 26-32 ăâđêôơư, 33-42 digits, 43-63 punctuation. Six bits in all.
function characterClass(character: string): number {
  const cached = classes.get(character);
  if (cached !== undefined) return cached;
  const base = baseLetter(character);
  const code = base.charCodeAt(0);
  let result: number;
  if (base.length === 1 && code >= 97 && code <= 122) result = code - 97;
  else if (base.length === 1 && extendedLetters.includes(base))
    result = 26 + extendedLetters.indexOf(base);
  else if (code >= 48 && code <= 57) result = code - 48 + 33;
  else {
    const punctuation = Math.max(0, punctuationCharacters.indexOf(character));
    result = 43 + (punctuation % 21);
  }
  if (classes.size >= 512) classes.clear();
  classes.set(character, result);
  return result;
}

function punctuationClass(text: string | undefined): number {
  if (!text || !punctuationPattern.test(text)) return 0;

  const normalized = text.replace(/[–—]/, "-");
  const index = punctuationClasses.indexOf(normalized);
  return index < 0 ? 12 : index + 1;
}

function tokenKind(text: string): RawToken["kind"] {
  if (/^\s/.test(text)) return 3;
  if (/^\d/.test(text)) return 1;
  if (/^[\p{L}_]/u.test(text)) return 0;
  return 2;
}

function numberBucket(text: string, kind: RawToken["kind"]): number {
  if (kind !== 1) return 15;
  if (text.length > 1 && text.startsWith("0")) return 14;

  const value = Number(text);
  return numberBuckets.findIndex((upperBound) => value <= upperBound);
}

interface TokenShape {
  kind: RawToken["kind"];
  identity: number;
  hash: number;
  flags: number;
  punctuation: number;
  suffix: boolean;
}

const shapes = new Map<string, TokenShape>();

function shape(word: string): TokenShape {
  const cached = shapes.get(word);
  if (cached) return cached;
  const folded = word.toLowerCase();
  const kind = tokenKind(word);
  const lengthBucket = lengthBuckets.findIndex(
    (upperBound) => word.length <= upperBound,
  );
  const hasUppercase = /\p{Lu}/u.test(word);
  // The skeleton drops every vowel and every mark, so "sáu", "sau" and "sâu"
  // share it; the word hash above keeps them apart.
  const skeleton = folded
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(vowels, "");
  const result: TokenShape = {
    kind,
    identity:
      (kind |
        (lengthBucket << 2) |
        (characterClass(word[0]) << 5) |
        (characterClass(word.at(-1)!) << 11) |
        ((hash(folded) & 255) << 17) |
        (numberBucket(word, kind) << 25)) >>>
      0,
    hash: hash(skeleton) & 127,
    flags:
      Number(hasUppercase) |
      (Number(hasUppercase && word === word.toUpperCase()) << 1) |
      (Number(/\d/.test(word)) << 2),
    punctuation: punctuationClass(word),
    // A clock letter glued to a number: "15h30", "15g30", "7h". The English
    // ordinal suffixes stay so the interim English weights keep their flag.
    suffix: /^(h|g|p|st|nd|rd|th)$/.test(folded),
  };
  // Bound both the entry count and retained word length. Context and predictions
  // are never cached: the same word can mean something different elsewhere.
  if (word.length <= 64) {
    if (shapes.size >= 2048) shapes.delete(shapes.keys().next().value!);
    shapes.set(word, result);
  }
  return result;
}

/**
 * Compose the input so a tone mark never splits a word, and remember where
 * each composed code unit came from so offsets still index the caller's text.
 */
function compose(text: string): { text: string; offsets?: Uint32Array } {
  if (!combining.test(text)) return { text };
  const normalized = text.normalize("NFC");
  if (normalized === text) return { text };
  const offsets = new Uint32Array(normalized.length + 1);
  let position = 0;
  for (const chunk of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const composed = chunk[0].normalize("NFC");
    if (composed.length === chunk[0].length) {
      for (let unit = 0; unit < composed.length; unit++)
        offsets[position + unit] = chunk.index! + unit;
    } else {
      // A composed unit starts where the shortest prefix that yields it ends.
      let seen = 0;
      for (let length = 1; length <= chunk[0].length; length++) {
        const units = chunk[0].slice(0, length).normalize("NFC").length;
        while (seen < units)
          offsets[position + seen++] = chunk.index! + length - 1;
      }
    }
    position += composed.length;
  }
  offsets[position] = text.length;
  return { text: normalized, offsets };
}

export function tokenize(source: string): RawToken[] {
  const { text, offsets } = compose(source);
  const parts = [...text.matchAll(tokenPattern)];
  const facts = parts.map((part) => shape(part[0]));
  return parts.map((match, index) => {
    const current = facts[index];
    const previous = facts[index - 1];
    const next = facts[index + 1];
    let flags = current.flags;
    if (index === 0) flags |= 1 << 3;
    if (index === parts.length - 1) flags |= 1 << 4;
    if (previous?.kind === 3) flags |= 1 << 5;
    if (next?.kind === 3) flags |= 1 << 6;
    if (current.suffix && previous?.kind === 1) flags |= 1 << 7;
    const context =
      (current.hash |
        (flags << 7) |
        ((previous?.punctuation ?? 0) << 15) |
        ((next?.punctuation ?? 0) << 19)) >>>
      0;
    const start = match.index!;
    const end = start + match[0].length;
    return {
      start: offsets ? offsets[start] : start,
      end: offsets ? offsets[end] : end,
      text: match[0],
      kind: current.kind,
      features: [current.identity, context],
    };
  });
}

export function featureRows([identity, context]: [number, number]): number[] {
  // Each feature owns a disjoint region of the 580-row embedding table.
  const rows = [
    identity & 3, // Kind
    4 + ((identity >>> 2) & 7), // Length
    12 + ((identity >>> 5) & 63), // First character
    76 + ((identity >>> 11) & 63), // Last character
    140 + ((identity >>> 17) & 255), // Word hash
    396 + (context & 127), // Consonant hash
    532 + ((context >>> 15) & 15), // Previous punctuation
    548 + ((context >>> 19) & 15), // Next punctuation
    564 + ((identity >>> 25) & 15), // Number bucket
  ];

  const flags = (context >>> 7) & 255;
  for (let bit = 0; bit < 8; bit++) {
    if (flags & (1 << bit)) rows.push(524 + bit);
  }

  return rows;
}
