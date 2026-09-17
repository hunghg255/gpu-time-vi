import json
import random
import tempfile
import unittest
from pathlib import Path

import background
import natural
import semantic
from generate import Sentence, generate
from signature import fingerprint


def spans_cover(sentence: Sentence) -> None:
    """Spans are ordered, disjoint and never split a word."""
    previous = 0
    for span in sentence.spans:
        assert span["start"] >= previous, (sentence.text, sentence.spans)
        assert span["end"] > span["start"], (sentence.text, span)
        previous = span["end"]
    assert previous == len(sentence.text.encode("utf-16-le")) // 2


class SentenceTests(unittest.TestCase):
    def test_spans_track_utf16_offsets(self):
        s = Sentence(random.Random(1), augment=False)
        s.add("họp nhóm lúc")
        s.clause()
        s.add("3", "HOUR")
        s.add("giờ", "GLUE")
        s.add("chiều", "MERIDIEM")
        self.assertEqual(s.text, "họp nhóm lúc 3 giờ chiều")
        self.assertEqual([span["label"] for span in s.spans], ["O", "HOUR", "GLUE", "MERIDIEM"])
        self.assertEqual(s.text[s.spans[3]["start"] : s.spans[3]["end"]], "chiều")
        spans_cover(s)

    def test_carrier_connector_is_trimmed_before_an_opener(self):
        s = Sentence(random.Random(1), augment=False)
        s.add("họp lúc")
        s.clause()
        s.add("từ", "RANGE_START")
        self.assertEqual(s.text, "họp từ")

    def test_connectors_inside_an_expression_are_glue(self):
        s = Sentence(random.Random(1), augment=False)
        s.clause()
        s.add("mai", "REL_DAY")
        s.add("lúc")
        s.add("9", "HOUR")
        self.assertEqual(s.spans[1]["label"], "GLUE")

    def test_second_clause_marks_its_first_role(self):
        s = Sentence(random.Random(1), augment=False)
        s.clause()
        s.add("t2", "WEEKDAY")
        s.add("và", "JOIN")
        s.clause()
        s.add("t4", "WEEKDAY")
        self.assertEqual([span["clauseStart"] for span in s.spans], [False, False, True])


class RendererTests(unittest.TestCase):
    def test_every_semantic_family_renders_with_covering_spans(self):
        rng = random.Random(3)
        seen = set()
        for _ in range(3000):
            spec = semantic.sample(rng)
            s = Sentence(rng)
            semantic.render(spec, s, rng.randrange(9))
            spans_cover(s)
            self.assertTrue(any(span["label"] not in ("O", "GLUE", "JOIN") for span in s.spans), s.text)
            seen.add(spec.family)
            self.assertNotIn("_", json.dumps(spec.schedule), spec.schedule)
        self.assertEqual(seen, set(semantic.FAMILIES))

    def test_every_natural_family_renders(self):
        rng = random.Random(4)
        for family in natural.FAMILIES:
            for _ in range(50):
                s = Sentence(rng)
                spec = natural.render(s, family=family)
                spans_cover(s)
                self.assertEqual(spec.family, family)
                self.assertIn("clauses", spec.schedule)

    def test_reserved_frames_never_appear_in_training_frames(self):
        reserved = {background.normal(frame.replace("{}", "")) for frame in natural.RESERVED}
        for _, frames in natural.FAMILIES.values():
            for frame in frames:
                self.assertNotIn(background.normal(frame.replace("{}", "")), reserved)

    def test_negatives_have_no_labelled_span(self):
        rng = random.Random(5)
        hard = 0
        for _ in range(500):
            s = Sentence(rng)
            s.add(background.negative(rng))
            hard += background.was_hard()
            self.assertTrue(all(span["label"] == "O" for span in s.spans))
        self.assertGreater(hard, 120)
        self.assertLess(hard, 280)

    def test_hard_negatives_carry_a_time_syllable(self):
        # A hard negative is only hard if it shares a syllable with time words.
        for template in background.HARD:
            filled = template.replace("{n}", "5")
            words = set(filled.lower().replace("/", " ").replace("-", " ").split())
            self.assertTrue(
                words & (background.TIME_WORDS | background.NUMBER_WORDS)
                or any(character.isdigit() for character in filled),
                template,
            )

    def test_spelled_numbers(self):
        import vi

        self.assertEqual(vi.spell(15), "mười lăm")
        self.assertEqual(vi.spell(21), "hai mươi mốt")
        self.assertEqual(vi.spell(24), "hai mươi tư")
        self.assertEqual(vi.spell(25), "hai mươi lăm")
        self.assertEqual(vi.spell(30), "ba mươi")
        self.assertEqual(vi.spell(11), "mười một")


class GenerateTests(unittest.TestCase):
    def test_splits_are_disjoint_and_reserved_frames_stay_out_of_training(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heldout = generate(root / "heldout.jsonl", 300, 11, "heldout")
            train = generate(
                root / "train.jsonl", 600, 12, "train", exclude=[root / "heldout.fingerprints.json"]
            )
            held_keys = set(json.loads((root / "heldout.fingerprints.json").read_text()))
            train_keys = set(json.loads((root / "train.fingerprints.json").read_text()))
            self.assertFalse(held_keys & train_keys)
            self.assertEqual(train["sequences"], 600)
            self.assertIn("negative", train["families"])
            reserved = [background.normal(f.replace("{}", "")) for f in natural.RESERVED]
            for line in (root / "train.jsonl").read_text(encoding="utf-8").splitlines():
                row = json.loads(line)
                text = background.normal(row["text"])
                for frame in reserved:
                    self.assertNotIn(frame, text)
                self.assertEqual(fingerprint(row), row["fingerprint"])
                if row["template"].startswith("negative"):
                    self.assertNotIn("schedule", row)
                else:
                    self.assertIn("schedule", row)
            self.assertTrue(
                any("reserved" in template for template in heldout["templates"]), heldout["templates"]
            )


if __name__ == "__main__":
    unittest.main()
