import csv
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import review_csv  # noqa: E402


class RoundTrip(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.orig = review_csv.ROOT
        (self.tmp / "content/lessons").mkdir(parents=True)
        shutil.copy(ROOT / "content/lessons/d07.json", self.tmp / "content/lessons/d07.json")
        review_csv.ROOT = self.tmp

    def tearDown(self):
        review_csv.ROOT = self.orig
        shutil.rmtree(self.tmp)

    def run_import(self, path, write=False):
        buf = io.StringIO()
        with redirect_stdout(buf):
            review_csv.import_(path, write)
        return buf.getvalue()

    def test_unchanged_sheet_gives_empty_diff(self):
        out = review_csv.export("d07", None)
        self.assertIn("0 Hindi wording changes", self.run_import(out))
        self.assertIn("0 other changes", self.run_import(out))

    def test_one_roman_edit_is_one_change_and_is_written(self):
        out = review_csv.export("d07", None)
        with out.open(encoding="utf-8-sig") as fh:
            rows = list(csv.reader(fh))
        rows[1][4] = "EDITED roman"
        rows[1][8], rows[1][9] = "FIX", "check vowel length"
        with out.open("w", newline="", encoding="utf-8-sig") as fh:
            csv.writer(fh).writerows(rows)
        report = self.run_import(out, write=True)
        self.assertIn("0 Hindi wording changes (flag these), 1 other changes, 1 notes", report)
        L = json.loads((self.tmp / "content/lessons/d07.json").read_text())
        self.assertEqual(L["scenes"][0]["lines"][0]["roman"], "EDITED roman")
        self.assertTrue((self.tmp / "docs/review-notes/d07-sheet.md").exists())

    def test_in_app_reviewer_csv_is_accepted(self):
        L = json.loads((self.tmp / "content/lessons/d07.json").read_text())
        s, ln = L["scenes"][0], L["scenes"][0]["lines"][0]
        out = self.tmp / "review-d07.csv"
        with out.open("w", newline="", encoding="utf-8-sig") as fh:
            w = csv.writer(fh)
            w.writerow(["scene", "line", "variant", "role", "hi", "roman", "en", "spoken_as", "status", "note", "reviewer", "date"])
            w.writerow([s["id"], 1, "m", ln["role"], ln["hi"], ln["roman"], ln["en"], "", "OK", "", "Asha", "2026-12-01"])
            w.writerow([s["id"], 1, "f", ln["role"], ln["hi"], ln["roman"], ln["en"], "", "FIX", "too fast", "Asha", "2026-12-01"])
        report = self.run_import(out, write=True)
        self.assertIn("0 Hindi wording changes (flag these), 0 other changes, 2 notes", report)
        notes = (self.tmp / "docs/review-notes/d07-sheet.md").read_text()
        self.assertIn("woman learner", notes)
        self.assertIn("too fast", notes)


if __name__ == "__main__":
    unittest.main()
