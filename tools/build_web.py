"""Build the static site into dist/ (deploy this folder).

  python3 tools/build_web.py                    # production: published lessons only
  python3 tools/build_web.py --only all         # preview/staging: every lesson, with a preview banner
  python3 tools/build_web.py --only review      # published + review

Combines content/lessons/*.json with media/manifest.json (audio + cues from
build_audio.py), writes dist/data/course.json (small index) and
dist/data/lessons/<id>.json (loaded on demand), copies only the audio the
included lessons use, and stamps the service worker with a build version.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from tts.text import scene_fingerprint  # noqa: E402
SRC, MEDIA = ROOT / "web/src", ROOT / "media"
LEVELS = {"published": {"published"}, "review": {"published", "review"}, "all": {"published", "review", "draft"}}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=LEVELS, default="published")
    ap.add_argument("--out", type=Path, default=ROOT / "dist")
    ap.add_argument("--skip-missing", action="store_true", help="dev only: leave out lessons without audio")
    ap.add_argument("--report-url", default="https://github.com/bhanu-pratap-rana/bolchaal-hindi/issues/new",
                    help="where 'Report a problem' opens a prefilled issue")
    args = ap.parse_args()
    out: Path = args.out

    manifest = json.loads((MEDIA / "manifest.json").read_text())
    lexicon = json.loads((ROOT / "content/pronunciation.json").read_text())["replace"]
    lessons = [json.loads(p.read_text()) for p in sorted((ROOT / "content/lessons").glob("*.json"))]
    keep = [L for L in lessons if L.get("status") in LEVELS[args.only]]
    missing = [L["id"] for L in keep if L["id"] not in manifest["lessons"]]
    if missing and args.skip_missing:
        print(f"skipping lessons without audio: {missing}")
        keep = [L for L in keep if L["id"] in manifest["lessons"]]
    elif missing:
        print(f"ERROR no audio for {missing}; run tools/build_audio.py first", file=sys.stderr)
        return 1

    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(SRC, out)
    (out / "data/lessons").mkdir(parents=True)
    used: set[str] = set()
    days = []
    for L in keep:
        audio = manifest["lessons"][L["id"]]
        scenes_idx = []
        for s in L["scenes"]:
            a = audio["scenes"].get(s["id"])
            if not a or a.get("fingerprint") != scene_fingerprint(L, s, lexicon):
                print(f"ERROR {s['id']}: audio is out of date with the text; rebuild audio", file=sys.stderr)
                return 1
            s["variants"], s["spoken"] = a["variants"], a.get("spoken", {})
            used |= {v["audio"] for v in a["variants"].values()}
            scenes_idx.append({"id": s["id"], "title_hi": s["title_hi"], "title_en": s["title_en"],
                               "lines": len(s["lines"]), "duration": a["variants"]["m"]["duration"]})
        for v in L.get("vocab", []):
            v["audio"] = audio["vocab"].get(v["hi"])
            if v["audio"]:
                used.add(v["audio"])
        (out / "data/lessons" / f"{L['id']}.json").write_text(json.dumps(L, ensure_ascii=False, separators=(",", ":")))
        days.append({"id": L["id"], "day": L["day"], "status": L["status"], "title_hi": L["title_hi"],
                     "title_en": L["title_en"], "scenes": scenes_idx, "vocab": len(L.get("vocab", [])),
                     "minutes": round(sum(x["duration"] for x in scenes_idx) / 60, 1)})

    for rel in sorted(used):
        dst = out / "media" / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(MEDIA / rel, dst)

    voices = manifest["voices"]
    h = hashlib.sha256()
    for p in sorted(out.rglob("*")):
        if p.is_file() and "media" not in p.parts:
            h.update(p.read_bytes())
    version = h.hexdigest()[:10]
    course = {"version": version, "preview": args.only != "published", "profile": manifest["profile"],
              "voices": voices, "report_url": args.report_url, "days": days}
    (out / "data/course.json").write_text(json.dumps(course, ensure_ascii=False, separators=(",", ":")))

    shell = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file()
                   and p.suffix in (".html", ".css", ".js", ".woff2", ".svg", ".png", ".webmanifest", ".json")
                   and "media" not in p.parts and "lessons" not in p.parts and p.name != "sw.js")
    sw = (out / "sw.js").read_text().replace("__VERSION__", version).replace("__SHELL__", json.dumps(shell))
    (out / "sw.js").write_text(sw)
    (out / ".nojekyll").write_text("")
    shutil.copy2(out / "index.html", out / "404.html")
    (out / "_headers").write_text(
        "/media/*\n  Cache-Control: public, max-age=31536000, immutable\n"
        "/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n"
        "/data/*\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n")
    if not days:
        print(f"WARNING: no lessons have status in {sorted(LEVELS[args.only])}; the site will say none are published yet.",
              file=sys.stderr)
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"dist/: {len(days)} lessons ({args.only}), {len(used)} audio files, {size / 1e6:.1f} MB, version {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
