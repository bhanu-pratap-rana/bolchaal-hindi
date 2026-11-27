"""Generate and stitch lesson audio once, at build time.

  PIPER_VOICES_DIR=./voices python3 tools/build_audio.py --profile demo-piper
  python3 tools/build_audio.py --lesson d07          # one lesson only

1. The displayed Hindi is turned into spoken text (tools/tts/text.py +
   content/pronunciation.json). Displayed text is never changed.
2. One clip per (voice, settings, spoken text) is cached in .cache/clips/<key>.mp3,
   so re-runs synthesise only lines whose text or voice changed.
3. One stitched MP3 per scene per learner variant (m, f) goes to media/scenes/,
   with each line's start/end computed from decoded sample counts. One clip per
   vocabulary item goes to media/vocab/.
4. media/manifest.json records audio, cues and every spoken-text substitution.
   media/ is committed, so the site can be built without any TTS engine.
Requires ffmpeg on PATH.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts import cache_key, get_provider  # noqa: E402
from tts.text import leftover_latin, scene_fingerprint, to_speech  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CLIPS = ROOT / ".cache/clips"
MEDIA = ROOT / "media"
SR, GAP = 22050, 0.6
VOCAB_SLOT = "female_1"
TRIM = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,"
        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse")


def ff(args: list[str], data: bytes | None = None) -> bytes:
    return subprocess.run(["ffmpeg", "-v", "error", "-y", *args], input=data, capture_output=True, check=True).stdout


def post_filter(spec: dict) -> str:
    """Optional pitch shift so one demo voice can stand in as a second, different-sounding voice."""
    p = spec.get("pitch")
    if not p:
        return TRIM
    return f"{TRIM},asetrate={int(SR * p)},aresample={SR},atempo={1 / p:.4f}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="demo-piper")
    ap.add_argument("--lesson", help="only this lesson id (e.g. d07)")
    args = ap.parse_args()

    profile = json.loads((ROOT / "content/voices.json").read_text())["profiles"][args.profile]
    lexicon = json.loads((ROOT / "content/pronunciation.json").read_text())["replace"]
    lessons = [json.loads(p.read_text()) for p in sorted((ROOT / "content/lessons").glob("*.json"))]
    if args.lesson:
        lessons = [L for L in lessons if L["id"] == args.lesson]
    for d in (CLIPS, MEDIA / "scenes", MEDIA / "vocab"):
        d.mkdir(parents=True, exist_ok=True)
    man_path = MEDIA / "manifest.json"
    manifest = json.loads(man_path.read_text()) if man_path.exists() else {"lessons": {}}
    if not args.lesson:
        manifest["lessons"] = {}
    if manifest.get("profile") not in (None, args.profile) and args.lesson:
        print(f"note: manifest was built with {manifest['profile']}; mixing profiles for one lesson")
    providers: dict[str, object] = {}
    stats = {"synthesised": 0, "cached": 0, "substitutions": 0}
    warnings: list[str] = []

    def clip(slot: str, spoken: str) -> Path:
        spec = profile[slot]
        prov = providers.setdefault(spec["provider"], get_provider(spec["provider"]))
        key = cache_key(spec, prov.settings, spoken)
        mp3 = CLIPS / f"{key}.mp3"
        if mp3.exists():
            stats["cached"] += 1
        else:
            wav = prov.synthesize(spoken, spec)
            mp3.write_bytes(ff(["-f", "wav", "-i", "-", "-af", post_filter(spec), "-ac", "1", "-ar", str(SR),
                                "-b:a", "48k", "-f", "mp3", "-"], wav))
            stats["synthesised"] += 1
        return mp3

    def speak(where: str, text: str, override: str | None) -> tuple[str, list]:
        spoken, subs = (override, [("(line tts field)", override)]) if override else to_speech(text, lexicon)
        for w in leftover_latin(spoken):
            warnings.append(f"{where}: Latin word '{w}' sent to the voice; add it to content/pronunciation.json")
        stats["substitutions"] += len(subs)
        return spoken, subs

    for L in lessons:
        out = {"scenes": {}, "vocab": {}}
        for s in L["scenes"]:
            variants, spoken_lines = {}, {}
            for var in ("m", "f"):
                buf, t, cues = bytearray(), 0.0, []
                for i, ln in enumerate(s["lines"]):
                    slot = L["roles"][ln["role"]]["voice"][var]
                    src = ln["f"] if var == "f" and "f" in ln else ln
                    spoken, subs = speak(f"{s['id']} line {i + 1} ({var})", src["hi"], src.get("tts"))
                    if subs:
                        spoken_lines[f"{i}:{var}"] = spoken
                    pcm = ff(["-i", str(clip(slot, spoken)), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"])
                    start = t
                    t += len(pcm) / 2 / SR
                    cues.append([round(start, 3), round(t, 3)])
                    buf += pcm
                    if i < len(s["lines"]) - 1:
                        buf += b"\x00\x00" * int(SR * GAP)
                        t += GAP
                h = hashlib.sha256(bytes(buf)).hexdigest()[:12]
                name = f"{s['id']}-{var}-{h}.mp3"
                if not (MEDIA / "scenes" / name).exists():
                    (MEDIA / "scenes" / name).write_bytes(ff(["-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
                                                              "-b:a", "48k", "-f", "mp3", "-"], bytes(buf)))
                variants[var] = {"audio": f"scenes/{name}", "duration": round(t, 3), "cues": cues}
            out["scenes"][s["id"]] = {"variants": variants, "spoken": spoken_lines,
                                      "fingerprint": scene_fingerprint(L, s, lexicon)}
        for v in L.get("vocab", []):
            spoken, _ = speak(f"{L['id']} vocab {v['hi']}", v["hi"], v.get("tts"))
            src = clip(VOCAB_SLOT, spoken)
            name = f"{src.stem}.mp3"
            if not (MEDIA / "vocab" / name).exists():
                (MEDIA / "vocab" / name).write_bytes(src.read_bytes())
            out["vocab"][v["hi"]] = f"vocab/{name}"
        manifest["lessons"][L["id"]] = out

    manifest["profile"] = args.profile
    manifest["scene_gap"] = GAP
    manifest["voices"] = {slot: {"label": v["label"], "gender": v["gender"], "licence": v["licence"],
                                 "commercial": v.get("commercial", False), "provider": v["provider"]}
                          for slot, v in profile.items()}
    man_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1))

    if not args.lesson:  # prune audio no longer referenced
        used = {p for L in manifest["lessons"].values() for sc in L["scenes"].values() for p in
                (v["audio"] for v in sc["variants"].values())} | {p for L in manifest["lessons"].values()
                                                                   for p in L["vocab"].values()}
        for f in list((MEDIA / "scenes").glob("*.mp3")) + list((MEDIA / "vocab").glob("*.mp3")):
            if f"{f.parent.name}/{f.name}" not in used:
                f.unlink()
    for w in warnings:
        print("WARN ", w)
    print(stats, f"{len(lessons)} lessons -> {man_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
