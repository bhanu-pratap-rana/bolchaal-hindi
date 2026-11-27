"""Upload audio to Supabase Storage and record it in audio_assets (phase 3).

NOT YET RUN against a live project. Uses the server-only secret key.
  export SUPABASE_URL=https://<project>.supabase.co
  export SUPABASE_SECRET_KEY=sb_secret_...      # never ship this to the browser
  python tools/upload_supabase.py --bucket lesson-audio

Skips files already recorded (by cache_key), so re-runs upload only new audio.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path

from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]


def duration_ms(p: Path) -> int:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True, check=True)
    return round(float(r.stdout) * 1000)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bucket", default="lesson-audio")
    args = ap.parse_args()
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
    known = {r["cache_key"] for r in sb.table("audio_assets").select("cache_key").execute().data}

    jobs = []  # (cache_key, local file, storage path, kind)
    for key, meta in json.loads((ROOT / ".cache/clips/index.json").read_text()).items():
        jobs.append((key, ROOT / ".cache/clips" / f"{key}.mp3", f"tts/{meta['slot']}/{key}.mp3", "line"))
    for p in sorted((ROOT / "web/public/audio").glob("scene-*.mp3")):
        jobs.append((p.stem, p, f"scenes/{p.name}", "scene"))

    new = 0
    for key, path, dest, kind in jobs:
        if key in known:
            continue
        sb.storage.from_(args.bucket).upload(dest, path.read_bytes(),
                                             {"content-type": "audio/mpeg", "cache-control": "31536000", "upsert": "false"})
        sb.table("audio_assets").insert({"cache_key": key, "kind": kind, "storage_path": dest,
                                         "bytes": path.stat().st_size, "duration_ms": duration_ms(path)}).execute()
        new += 1
    print(f"{new} new files uploaded, {len(jobs) - new} already stored")


if __name__ == "__main__":
    main()
