"""Listening test: one short sample per voice slot of a profile, to confirm each voice before a full build.

  python3 tools/voice_samples.py --profile launch-parler     # writes samples/launch-parler-<slot>-<name>.wav
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from tts import get_provider  # noqa: E402

TEXT = "नमस्ते! क्या आप मेरी मदद कर सकते हैं? मुझे रेलवे स्टेशन जाना है, और टिकट कितने का है?"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="launch-parler")
    ap.add_argument("--text", default=TEXT)
    a = ap.parse_args()
    profile = json.loads((ROOT / "content/voices.json").read_text())["profiles"][a.profile]
    out = ROOT / "samples"
    out.mkdir(exist_ok=True)
    providers: dict[str, object] = {}
    for slot, spec in profile.items():
        prov = providers.setdefault(spec["provider"], get_provider(spec["provider"]))
        path = out / f"{a.profile}-{slot}-{spec['label']}.wav"
        path.write_bytes(prov.synthesize(a.text, spec))
        print(f"{slot:9} expected {'male' if spec['gender'] == 'm' else 'female'}: {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
