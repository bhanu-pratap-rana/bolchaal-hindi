"""Listening test: one short sample per voice slot of a profile, to confirm each voice before a full build.

  python3 tools/voice_samples.py --profile launch-parler            # samples/launch-parler-<slot>-<name>.wav
  python3 tools/voice_samples.py --profile launch-parler --styles   # 4 delivery styles per voice, to pick the liveliest
  python3 tools/voice_samples.py --styles --slots female_1 male_1   # only some voices

--styles only works for providers whose voice is set by a text description (Parler).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from tts import get_provider  # noqa: E402

TEXT = "नमस्ते! क्या आप मेरी मदद कर सकते हैं? मुझे रेलवे स्टेशन जाना है, और टिकट कितने का है?"
# Conversational text with a greeting, a reaction, a question and a thank-you, so intonation differences are audible.
STYLE_TEXT = "अरे, नमस्ते! आप कैसे हैं? अच्छा, आप स्टेशन जा रहे हैं? बहुत बढ़िया, चलिए, मैं रास्ता बता देता हूँ। धन्यवाद!"
STYLE_TEXT_F = "अरे, नमस्ते! आप कैसे हैं? अच्छा, आप स्टेशन जा रहे हैं? बहुत बढ़िया, चलिए, मैं रास्ता बता देती हूँ। धन्यवाद!"

TAIL = "Very clear audio, close up, with no background noise."
STYLES = {
    "a-current": None,  # the description now in voices.json
    "b-slightly-expressive": "{name} delivers a slightly expressive and animated speech at a moderate speed with {pitch} pitch. " + TAIL,
    "c-expressive-friendly": "{name} speaks in an expressive, animated and friendly way, with lively rises and falls in pitch, at a moderate speed with {pitch} pitch. " + TAIL,
    "d-chatting": "{name} speaks in a lively, expressive conversational style, like chatting warmly with a friend, smiling, with varied intonation, at a slightly fast pace with {pitch} pitch. " + TAIL,
}


def pitch_of(desc: str) -> str:
    m = re.search(r"(slightly low|slightly high|moderate|low|high)\s+pitch", desc)
    return m.group(1) if m else "moderate"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="launch-parler")
    ap.add_argument("--text", default=None)
    ap.add_argument("--styles", action="store_true", help="render each voice in several delivery styles")
    ap.add_argument("--slots", nargs="*", help="only these slots, e.g. female_1 male_1")
    a = ap.parse_args()
    profile = json.loads((ROOT / "content/voices.json").read_text())["profiles"][a.profile]
    out = ROOT / "samples"
    out.mkdir(exist_ok=True)
    providers: dict[str, object] = {}
    t0 = time.time()
    for slot, spec in profile.items():
        if a.slots and slot not in a.slots:
            continue
        prov = providers.setdefault(spec["provider"], get_provider(spec["provider"]))
        expected = "male" if spec["gender"] == "m" else "female"
        if not a.styles:
            path = out / f"{a.profile}-{slot}-{spec['label']}.wav"
            path.write_bytes(prov.synthesize(a.text or TEXT, spec))
            print(f"{slot:9} expected {expected}: {path.relative_to(ROOT)}", flush=True)
            continue
        if "description" not in spec:
            print(f"{slot}: provider '{spec['provider']}' has no description to vary; skipped")
            continue
        text = a.text or (STYLE_TEXT_F if spec["gender"] == "f" else STYLE_TEXT)
        for style, tpl in STYLES.items():
            desc = spec["description"] if tpl is None else tpl.format(name=spec["speaker"], pitch=pitch_of(spec["description"]))
            path = out / f"{a.profile}-{slot}-{spec['label']}-{style}.wav"
            path.write_bytes(prov.synthesize(text, {**spec, "description": desc}))
            print(f"{slot:9} {style:22} {path.relative_to(ROOT)}", flush=True)
    print(f"done in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
