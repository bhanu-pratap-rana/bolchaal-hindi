"""Spreadsheet round trip for reviewers who don't use git.

  python3 tools/review_csv.py export d05            -> review/d05.csv (open in Google Sheets or Excel)
  python3 tools/review_csv.py import review/d05.csv -> prints a diff; add --write to apply it

Columns: scene, line, role, hi, roman, en, f_hi, f_roman, status, note.
The CSV exported from the app's reviewer mode (one row per line per learner variant) is accepted too.
`status` is OK or FIX per line; `note` is free text. Notes are copied to
docs/review-notes/<day>-sheet.md on import. Hindi wording changes are listed
first in the diff, because CLAUDE.md requires them to be flagged.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COLS = ["scene", "line", "role", "hi", "roman", "en", "f_hi", "f_roman", "status", "note"]


def lesson_path(lid: str) -> Path:
    return ROOT / "content/lessons" / f"{lid}.json"


def export(lid: str, out: Path | None) -> Path:
    L = json.loads(lesson_path(lid).read_text())
    out = out or ROOT / "review" / f"{lid}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8-sig") as fh:  # BOM so Excel opens Devanagari correctly
        w = csv.writer(fh)
        w.writerow(COLS)
        for s in L["scenes"]:
            for i, ln in enumerate(s["lines"], 1):
                f = ln.get("f", {})
                w.writerow([s["id"], i, ln["role"], ln["hi"], ln["roman"], ln["en"],
                            f.get("hi", ""), f.get("roman", ""), "", ""])
    return out


def _rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def import_(path: Path, write: bool) -> int:
    """Accept both the spreadsheet export (f_hi/f_roman columns) and the in-app reviewer CSV (one row per variant)."""
    rows = _rows(path)
    if not rows:
        print("empty sheet")
        return 1
    web = "variant" in rows[0]
    lid = rows[0]["scene"].split("s")[0]
    L = json.loads(lesson_path(lid).read_text())
    scenes = {s["id"]: s for s in L["scenes"]}
    hindi, other, notes, problems = [], [], [], []

    def change(where, col, old, new, is_hindi):
        (hindi if is_hindi else other).append((where, col, old, new))

    for r in rows:
        s = scenes.get(r["scene"])
        try:
            ln = s["lines"][int(r["line"]) - 1]
        except (TypeError, IndexError, ValueError):
            problems.append(f"row {r.get('scene')} {r.get('line')}: no such line")
            continue
        var = r.get("variant", "m") if web else "m"
        where = f"{r['scene']} line {r['line']}" + (f" ({'woman' if var == 'f' else 'man'} learner)" if web else "")
        if var == "m":
            for key in ("hi", "roman", "en"):
                new = (r.get(key) or "").strip()
                if new and new != ln[key]:
                    change(where, key, ln[key], new, key == "hi")
                    ln[key] = new
        if web and var == "f":
            cur = ln.get("f", {"hi": ln["hi"], "roman": ln["roman"]})
            fh, fr = (r.get("hi") or "").strip(), (r.get("roman") or "").strip()
            if (fh and fh != cur["hi"]) or (fr and fr != cur["roman"]):
                newf = {"hi": fh or cur["hi"], "roman": fr or cur["roman"]}
                change(where, "f", json.dumps(ln.get("f"), ensure_ascii=False), json.dumps(newf, ensure_ascii=False), fh != cur["hi"])
                ln["f"] = newf
        if not web:
            fh, fr = (r.get("f_hi") or "").strip(), (r.get("f_roman") or "").strip()
            old = ln.get("f", {})
            if (fh or fr) and (fh != old.get("hi", "") or fr != old.get("roman", "")):
                newf = {"hi": fh or old.get("hi") or ln["hi"], "roman": fr or old.get("roman") or ln["roman"]}
                change(where, "f", json.dumps(old, ensure_ascii=False), json.dumps(newf, ensure_ascii=False), fh != old.get("hi", ""))
                ln["f"] = newf
        status, note = (r.get("status") or "").strip(), (r.get("note") or "").strip()
        if status or note:
            who = (r.get("reviewer") or "").strip()
            notes.append(f"- {where} [{status or '-'}] {note}" + (f" ({who})" if who else ""))
    print(f"== {lid}: {len(hindi)} Hindi wording changes (flag these), {len(other)} other changes, {len(notes)} notes")
    for where, col, a, b in hindi:
        print(f"HINDI  {where} {col}:\n   - {a}\n   + {b}")
    for where, col, a, b in other:
        print(f"CHANGE {where} {col}:\n   - {a}\n   + {b}")
    for p in problems:
        print("PROBLEM", p)
    if write:
        lesson_path(lid).write_text(json.dumps(L, ensure_ascii=False, indent=2) + "\n")
        if notes:
            nd = ROOT / "docs/review-notes"
            nd.mkdir(parents=True, exist_ok=True)
            with (nd / f"{lid}-sheet.md").open("a", encoding="utf-8") as fh:
                fh.write(f"\n## From {path.name}\n\n" + "\n".join(notes) + "\n")
        print("written. Run python3 tools/validate_content.py next.")
    elif hindi or other:
        print("dry run: nothing written. Re-run with --write to apply.")
    return 1 if problems else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export")
    e.add_argument("lesson")
    e.add_argument("--out", type=Path)
    i = sub.add_parser("import")
    i.add_argument("csv", type=Path)
    i.add_argument("--write", action="store_true")
    a = ap.parse_args()
    if a.cmd == "export":
        print(export(a.lesson, a.out))
        return 0
    return import_(a.csv, a.write)


if __name__ == "__main__":
    sys.exit(main())
