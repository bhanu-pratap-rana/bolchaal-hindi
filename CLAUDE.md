# बोलचाल की हिंदी (Bolchaal Hindi)

Listening-first web app that teaches spoken Hindi to tourists and international students. Learners hear short dialogues in distinct AI-generated voices, follow Hindi / Roman / English line by line, replay lines, practise their side (Speak, with optional on-device recording) and take a listening check (Check). 20 day-modules from the KHS course DOCX.

Plan and decisions: `docs/PLAN.md` (links to the full plan doc). Licences: `docs/LICENCES.md`.

## Architecture (do not change without asking)
- **Content is the source of truth:** `content/lessons/dNN.json` (one file per DOCX day). Scenes hold lines; each line has `role, hi, roman, en`, optional `f` (feminine-learner variant), optional `tts` (spoken text when the displayed text can't be read aloud as is) and optional `gender_ok` (reviewed: same words for a woman learner).
- **Voices are slots** (`male_1/male_2/female_1/female_2`); `content/voices.json` maps them to real voices per profile (`demo-piper`, `launch-parler`, `launch-azure`).
- **Spoken text layer:** `tools/tts/text.py` + `content/pronunciation.json` turn digits, ₹ amounts, times and acronyms into words for the voice only. Displayed text never changes.
- **Audio is generated once, locally, and committed:** `tools/build_audio.py` caches one clip per (voice, settings, spoken text) in `.cache/clips/`, stitches one MP3 per scene per learner variant into `media/scenes/`, one clip per vocabulary word into `media/vocab/`, and writes cues to `media/manifest.json`. CI never runs a TTS engine.
- **Site:** static, no framework, native ES modules in `web/src/` (`js/app.js` router, `scene.js` player page, `player.js` audio engine, `check.js`, `record.js`, `review.js`, `offline.js`, `sw.js`). `tools/build_web.py` writes `dist/` with `data/course.json` + `data/lessons/dNN.json` (loaded on demand) and only the audio those lessons use.
- **Status gate:** lessons are `draft`, `review` or `published`. `build_web.py` (default) ships only published lessons; `--only all` builds the preview with a banner. A lesson can be `published` only with teacher sign-off per scene and variant in `content/signoff/dNN.json` (the validator enforces this).
- **Hosting:** GitHub Pages (preview, via `.github/workflows/site.yml`, after tests pass). Cloudflare (`wrangler.jsonc`) is the optional long-term host. No backend: progress, settings, review marks and offline packs live in the browser. Supabase (`supabase/`) is deferred until a pilot shows people need cross-device progress.

## Commands
- `python3 tools/validate_content.py` — must report 0 errors
- `PIPER_VOICES_DIR=./voices python3 tools/build_audio.py --profile demo-piper` — incremental
- `python3 tools/build_web.py --only all` — preview build into `dist/`
- `npm run serve` → http://localhost:8788
- `python3 -m unittest discover -s tests/unit` and `npx playwright test` — keep both green
- `python3 tools/review_csv.py export d05` / `import review/d05.csv [--write]` — spreadsheet review round trip

## Rules
- Never put any secret in `web/`. There is no backend.
- Never synthesise audio at request time for scripted lessons.
- Grammar follows the speaker AND the listener: if the learner says, or is addressed with, a gendered form, the line needs an `f` variant (or `gender_ok` after review).
- A role's voice gender must match its grammar; two roles in one scene must not share a voice.
- Roman uses the simplified learner scheme in `docs/CONTENT_GUIDE.md`. Do not switch to IAST.
- Label every voice as AI-generated in the UI. Never imply a human recording.
- Recordings made in Speak mode stay on the device. Never upload them.
- Accessibility floor: 44 px touch targets, visible focus, announcements in the `role="status"` region, 4.5:1 contrast in light and dark themes, reduced motion respected.
- Content is reviewed by students and a teacher. Don't change Hindi wording yourself; record suspected problems in `docs/review-notes/`.
- Licences: never copy code from AGPL or GPL projects; never use a non-commercial model or dataset in the launch profiles; list every third-party asset in `docs/LICENCES.md`. Borrow ideas, not code.
- Prefer small, reviewable commits. Run validate + tests before saying a task is done.
