"""Generate Vietnamese supervision from semantic slots, never from the parser.

Every rendered slot supplies its own label and source span. The shared browser
tokenizer later maps spans onto tokens (src/featurize.ts). Three tiers share the
output: schedule-first renderings from semantic.py, phrase families with
carriers from natural.py, and negatives from background.py.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections import Counter
from pathlib import Path

import background
import natural
import semantic
from signature import fingerprint

ROOT = Path(__file__).resolve().parent.parent

# Roles that begin a clause with their own word, so a carrier's trailing
# connector in front of one would double up ("họp lúc từ 9h").
CLAUSE_OPENERS = frozenset(
    {
        "RANGE_START",
        "BOUND_START",
        "BOUND_END",
        "RECUR",
        "DIR_AFTER",
        "DIR_BEFORE",
        "DUR",
        "EXCEPT",
    }
)


class Sentence:
    def __init__(self, rng: random.Random, augment: float | bool = True):
        self.rng = rng
        # A probability scale, not a switch: check corpora want no noise at all.
        self.augment = float(augment)
        self.text = ""
        self.spans: list[dict] = []
        self.clauses = 0
        self.pending_clause = False
        self.in_expression = False

    def _trim_carrier_connector(self) -> None:
        """Drop a carrier's dangling connector before a clause that opens with one."""
        if not self.spans or self.spans[-1]["label"] != "O":
            return
        stripped = self.text.rstrip()
        parts = stripped.rsplit(" ", 1)
        if len(parts) != 2 or parts[1].lower() not in background.CONNECTORS:
            return
        span = self.spans[-1]
        self.text = parts[0]
        span["end"] = len(self.text.encode("utf-16-le")) // 2
        if span["end"] <= span["start"]:
            self.spans.pop()

    def add(self, text: str, label: str = "O", separator: str = " ") -> None:
        if not text:
            return
        if label in CLAUSE_OPENERS and self.in_expression:
            self._trim_carrier_connector()
        # Connectors inside an expression are glue, never carrier text.
        if label == "O" and self.in_expression and text.lower() in background.CONNECTORS:
            label = "GLUE"
        if (
            any(character.isalpha() for character in text)
            and self.rng.random() < 0.2 * self.augment
        ):
            text = self.rng.choice([text.lower(), text.upper(), text.capitalize()])
        if self.text:
            left, right = self.text[-1], text[0]
            would_merge = (left.isalpha() and right.isalpha()) or (
                left.isdigit() and right.isdigit()
            )
            if separator == " " and self.rng.random() < self.augment:
                separator = self.rng.choice(
                    [" ", " ", "  ", "\t"] if would_merge else ["", " ", " ", "  "]
                )
            # Two tokens fused here would leave a span the tokenizer cannot address.
            self.text += separator or (" " if would_merge else "")
        start = len(self.text.encode("utf-16-le")) // 2
        self.text += text
        end = len(self.text.encode("utf-16-le")) // 2
        boundary = self.pending_clause and label not in ("O", "GLUE", "JOIN")
        if boundary:
            self.pending_clause = False
        self.spans.append(
            {"start": start, "end": end, "label": label, "clauseStart": boundary}
        )

    def clause(self) -> None:
        self.in_expression = True
        self.pending_clause = self.clauses > 0
        self.clauses += 1

    def glue(self, text: str, separator: str = " ") -> None:
        self.add(text, "GLUE", separator)


def generate(
    path: Path, count: int, seed: int, split: str, exclude: list[Path] | None = None
) -> dict:
    rng = random.Random(seed)
    families: Counter = Counter()
    span_counts: Counter = Counter()
    templates = set()
    signatures = set()
    reserved = {key for one in exclude or [] for key in json.loads(one.read_text(encoding="utf-8"))}
    rejected = 0
    heldout = split == "heldout"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as output:
        index = 0
        while index < count:
            spec = None
            draw = rng.random()
            if draw < 0.2:
                # Negatives: prose with no time expression, hard negatives included.
                sentence = Sentence(rng)
                sentence.add(background.negative(rng))
                template = "negative/" + ("hard" if background.was_hard() else "prose")
                family = "negative"
            elif draw < 0.45:
                sentence = Sentence(rng, augment=0.35)
                spec = natural.render(sentence, reserved=heldout)
                template = f"natural-{spec.family}/" + ("reserved" if heldout else "train")
                family = spec.family
            else:
                sentence = Sentence(rng)
                spec = semantic.sample(rng)
                style = 9 if heldout else rng.randrange(9)
                semantic.render(spec, sentence, style)
                template = f"semantic-{spec.family}/surface-{style}"
                family = spec.family
            if spec and sentence.clauses and rng.random() < 0.4:
                sentence.in_expression = False
                tail = background.suffix(rng)
                sentence.add(tail)
            # A second unrelated sentence pushes some sequences past 40 tokens.
            if spec and rng.random() < 0.12:
                sentence.in_expression = False
                sentence.add(background.sentence(rng))
            ends_expression = bool(sentence.spans) and sentence.spans[-1]["label"] != "O"
            if sentence.text and sentence.text[-1:] not in ".!?)\"" and rng.random() < (
                0.6 if ends_expression else 0.4
            ):
                sentence.in_expression = False
                sentence.add(background.terminator(rng), separator="")
            row = {
                "id": f"{split}-{seed}-{index}",
                "template": template,
                "text": sentence.text,
                "spans": sentence.spans,
            }
            if spec:
                row["schedule"] = spec.schedule
            key = fingerprint(row)
            if key in reserved:
                rejected += 1
                continue
            row["fingerprint"] = key
            signatures.add(key)
            index += 1
            output.write(
                json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
            )
            families[family] += 1
            span_counts.update(span["label"] for span in sentence.spans)
            templates.add(template)
    path.with_suffix(".fingerprints.json").write_text(json.dumps(sorted(signatures)))
    prose = background.borrowed()
    return {
        "structuralFingerprints": len(signatures),
        "rejectedReservedFrames": rejected,
        "generatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "borrowedProse": len(prose),
        "borrowedProseSha256": (
            hashlib.sha256(background.PROSE.read_bytes()).hexdigest() if prose else None
        ),
        "sequences": count,
        "seed": seed,
        "split": split,
        "templates": sorted(templates),
        "families": dict(families),
        "spanCounts": dict(span_counts),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=300000)
    parser.add_argument("--seed", type=int, default=20260917)
    parser.add_argument(
        "--split", choices=["train", "validation", "heldout"], default="train"
    )
    parser.add_argument("--exclude", type=Path, action="append")
    parser.add_argument("--out", type=Path, default=ROOT / "data/synth/train.jsonl")
    args = parser.parse_args()
    report = generate(args.out, args.count, args.seed, args.split, args.exclude)
    args.out.with_suffix(".manifest.json").write_text(
        json.dumps(report, indent=2) + "\n"
    , encoding="utf-8")
    print(json.dumps(report))
