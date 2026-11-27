"""Record a teacher's sign-off for scenes of a lesson (after listening in both learner modes).

  python3 tools/signoff.py d05 --reviewer "Dr. A. Sharma"                  # every scene, both variants
  python3 tools/signoff.py d05 --reviewer "Dr. A. Sharma" --scenes d05s1,d05s2 --variant f

Each entry stores a hash of the scene's text, so editing a scene after sign-off is caught by the validator.
Then set "status": "published" in content/lessons/<id>.json and run the validator.
"""
from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from tts.text import scene_text_hash  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("lesson")
    ap.add_argument("--reviewer", required=True)
    ap.add_argument("--role", default="teacher", choices=["teacher", "student"])
    ap.add_argument("--scenes", help="comma-separated scene ids (default: all)")
    ap.add_argument("--variant", default="both", choices=["m", "f", "both"])
    a = ap.parse_args()
    L = json.loads((ROOT / "content/lessons" / f"{a.lesson}.json").read_text())
    wanted = set(a.scenes.split(",")) if a.scenes else {s["id"] for s in L["scenes"]}
    path = ROOT / "content/signoff" / f"{a.lesson}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    entries = json.loads(path.read_text()) if path.exists() else []
    today = datetime.date.today().isoformat()
    n = 0
    for s in L["scenes"]:
        if s["id"] not in wanted:
            continue
        for var in (["m", "f"] if a.variant == "both" else [a.variant]):
            entries.append({"scene": s["id"], "variant": var, "role": a.role, "reviewer": a.reviewer,
                            "date": today, "hash": scene_text_hash(s)})
            n += 1
    path.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n")
    print(f"{n} sign-off entries added to {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
