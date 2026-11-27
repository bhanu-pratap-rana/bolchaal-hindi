"""Check lesson content before any audio is generated.

Errors stop the build; warnings are for the reviewer.
  python tools/validate_content.py            # all lessons, demo-piper profile
  python tools/validate_content.py --profile launch-parler
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from tts.text import scene_text_hash  # noqa: E402
DEV = r"[\u0900-\u0963\u0966-\u097F]"  # Devanagari letters and signs, excluding the danda । ॥
# First-person masculine verb forms that need a feminine variant for women learners.
MASC_1P = re.compile(rf"(?<!{DEV})(आया|गया|सकता|देता|करता|चाहता|खाता|जाता|लेता|रहता|रहा|बताता|लाता)(?!{DEV})")
# Second-person masculine agreement in lines addressed to someone (आप ... आए हैं / लेंगे).
MASC_2P = re.compile(rf"(?<!{DEV})(आए|लेंगे|रहेंगे|चाहते|करेंगे|जाएँगे|चलेंगे|देंगे|आएँगे)(?!{DEV})")


ME = re.compile(rf"(?<!{DEV})मैं(?!{DEV})")  # the word मैं, not मैंने


def load(profile: str):
    voices = json.loads((ROOT / "content/voices.json").read_text())["profiles"][profile]
    lessons = [json.loads(p.read_text()) for p in sorted((ROOT / "content/lessons").glob("*.json"))]
    return voices, lessons


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="demo-piper")
    args = ap.parse_args()
    voices, lessons = load(args.profile)
    errors, warns = [], []
    if args.profile.startswith("launch"):
        for slot, spec in voices.items():
            if not spec.get("commercial"):
                errors.append(f"profile {args.profile}: {slot} ({spec['label']}) is not licensed for commercial use")
    signoff_dir = ROOT / "content/signoff"
    seen_scene_ids = set()

    for L in lessons:
        roles = L["roles"]
        if L.get("status") not in ("draft", "review", "published"):
            errors.append(f"{L['id']}: status must be draft, review or published")
        if L.get("status") == "published":
            so = signoff_dir / f"{L['id']}.json"
            signed = json.loads(so.read_text()) if so.exists() else []
            for s in L["scenes"]:
                for var in ("m", "f"):
                    ok = [x for x in signed if x.get("scene") == s["id"] and x.get("variant") == var and x.get("role") == "teacher"]
                    if not ok:
                        errors.append(f"{L['id']} is published but {s['id']} ({var}) has no teacher sign-off in {so.name}")
                    elif all(x.get("hash") and x["hash"] != scene_text_hash(s) for x in ok):
                        errors.append(f"{s['id']} ({var}) was edited after the teacher signed it off; review it again")
        learner_roles = [r for r, v in roles.items() if v.get("learner")]
        if len(learner_roles) != 1:
            errors.append(f"{L['id']}: exactly one learner role required, found {learner_roles}")
        for rid, r in roles.items():
            for var in ("m", "f"):
                slot = r["voice"][var]
                if slot not in voices:
                    errors.append(f"{L['id']}.{rid}: voice slot {slot!r} missing from profile {args.profile}")
                    continue
                need = var if r["grammar"] == "learner" else r["grammar"]
                if need in ("m", "f") and voices[slot]["gender"] != need:
                    errors.append(f"{L['id']}.{rid} ({var}): grammar {need} but voice {voices[slot]['label']} is {voices[slot]['gender']}")

        all_text = " ".join(ln["hi"] for s in L["scenes"] for ln in s["lines"])
        for v in L.get("vocab", []):
            if v["hi"] not in all_text:
                warns.append(f"{L['id']}: vocab {v['hi']} does not appear in any line (no tap-to-gloss)")

        for s in L["scenes"]:
            if s["id"] in seen_scene_ids:
                errors.append(f"duplicate scene id {s['id']}")
            seen_scene_ids.add(s["id"])
            speakers = {ln["role"] for ln in s["lines"]}
            for var in ("m", "f"):
                used = {}
                for rid in speakers:
                    if rid not in roles:
                        continue
                    label = voices.get(roles[rid]["voice"][var], {}).get("label")
                    used.setdefault(label, []).append(rid)
                for label, rids in used.items():
                    if len(rids) > 1:
                        warns.append(f"{s['id']} ({var}): roles {rids} share voice {label}; learners cannot tell them apart")
            for i, ln in enumerate(s["lines"], 1):
                where = f"{s['id']} line {i}"
                if ln["role"] not in roles:
                    errors.append(f"{where}: unknown role {ln['role']}")
                    continue
                for k in ("hi", "roman", "en"):
                    if not ln.get(k, "").strip():
                        errors.append(f"{where}: empty {k}")
                is_learner = roles[ln["role"]].get("learner")
                if is_learner and ME.search(ln["hi"]) and MASC_1P.search(ln["hi"]) and "f" not in ln and not ln.get("gender_ok"):
                    errors.append(f"{where}: learner says a masculine form ({MASC_1P.search(ln['hi']).group(0)}) with no feminine variant")
                if not is_learner and MASC_2P.search(ln["hi"]) and "f" not in ln and not ln.get("gender_ok"):
                    warns.append(f"{where}: {ln['role']} uses {MASC_2P.search(ln['hi']).group(0)}; add an 'f' variant if it addresses the learner")
                if "f" in ln and ln["f"]["hi"] == ln["hi"]:
                    errors.append(f"{where}: feminine variant is identical to the base line")

    for w in warns:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{len(lessons)} lessons, {sum(len(L['scenes']) for L in lessons)} scenes, "
          f"{sum(len(s['lines']) for L in lessons for s in L['scenes'])} lines: {len(errors)} errors, {len(warns)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
