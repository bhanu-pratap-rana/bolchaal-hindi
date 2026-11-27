"""Flag generated lines whose length doesn't fit their text (a sign of garbled, cut-off or babbling audio).

  python3 tools/audio_qc.py                  # checks media/manifest.json
  MEDIA_DIR=media-kokoro python3 tools/audio_qc.py

Neural voices such as Parler occasionally skip words, repeat, or trail off into noise. Nobody can listen to
2,400 clips before every build, so this compares each line's duration with its spoken text and lists outliers
for a person to listen to first. It does not judge pronunciation; the teacher's listening pass does.
"""
from __future__ import annotations

import json
import os
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from tts.text import to_speech  # noqa: E402


def main() -> int:
    media = Path(os.environ["MEDIA_DIR"]).resolve() if os.environ.get("MEDIA_DIR") else ROOT / "media"
    manifest = json.loads((media / "manifest.json").read_text())
    lexicon = json.loads((ROOT / "content/pronunciation.json").read_text())["replace"]
    rows = []
    for p in sorted((ROOT / "content/lessons").glob("*.json")):
        L = json.loads(p.read_text())
        audio = manifest["lessons"].get(L["id"])
        if not audio:
            continue
        for s in L["scenes"]:
            a = audio["scenes"].get(s["id"])
            if not a:
                continue
            for var, info in a["variants"].items():
                for i, (start, end) in enumerate(info["cues"]):
                    ln = s["lines"][i]
                    src = ln["f"] if var == "f" and "f" in ln else ln
                    spoken = src.get("tts") or to_speech(src["hi"], lexicon)[0]
                    chars = len([c for c in spoken if not c.isspace()])
                    rows.append((round((end - start) / max(chars, 1), 4), end - start, s["id"], i + 1, var, src["hi"]))
    rates = [r[0] for r in rows]
    med = statistics.median(rates)
    lo, hi = med * 0.5, med * 1.9
    bad = [r for r in rows if r[0] < lo or r[0] > hi]
    print(f"{len(rows)} line versions checked. Median {med:.3f} s per character; flagging below {lo:.3f} or above {hi:.3f}.")
    for rate, dur, sid, n, var, text in sorted(bad, key=lambda r: abs(r[0] - med), reverse=True):
        kind = "too short (words may be skipped)" if rate < lo else "too long (repeats or noise?)"
        print(f"LISTEN {sid} line {n} ({'woman' if var == 'f' else 'man'} learner): {dur:.1f}s, {kind}: {text[:70]}")
    print(f"{len(bad)} to listen to first ({100 * len(bad) / max(len(rows), 1):.1f}%).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
