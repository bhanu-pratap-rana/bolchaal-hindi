# बोलचाल की हिंदी · Bolchaal Hindi

Spoken Hindi for travellers and international students. Twenty days of everyday conversations in India — airport, railway, metro, hotel, restaurant, shopping, health, emergencies, festivals — each voiced by distinct **AI-generated** voices, with Hindi, Roman and English line by line.

**Preview site:** https://bhanu-pratap-rana.github.io/bolchaal-hindi/
The lessons were drafted with AI help from the Kendriya Hindi Sansthan course text and are **still under review by students and a Hindi teacher**. Voices are AI-generated demo voices (non-commercial licence).

## What a learner can do
- **Listen:** each line lights up as it is spoken; the Devanagari headline bar fills along the line. Replay any line, step line by line, change speed (0.6×–1.2×), keyboard shortcuts (Space, J, L, R), lock-screen controls where supported.
- **Speak:** the player stops before each of your lines. Say it, hear the model, optionally record yourself and compare. Recordings stay on your device.
- **Check:** short listening questions per scene: what a line means, which word fills a gap, which word you heard.
- **Learn as a man or a woman:** Hindi verbs change with the speaker. The switch changes your lines, what people say to you, and your voice.
- **Script:** Hindi + Roman, Roman only, or Hindi only. English on or off. "Listen first" hides each line until heard.
- **Words:** every glossary word with audio; mark words known.
- **Offline:** save a day on your phone and play it without data.
- **Report a problem** on any line: opens a prefilled GitHub issue.

## For reviewers (students and the teacher)
- Open the site with `?review=1` (e.g. `…/bolchaal-hindi/?review=1#/day/d05`). Each line gets OK / Fix and a note, for the man and the woman version. Export the CSV from the day page and send it back.
- Or work in a spreadsheet: `python3 tools/review_csv.py export d05`, edit `review/d05.csv`, then `python3 tools/review_csv.py import review/d05.csv` shows a diff (Hindi wording changes listed first); add `--write` to apply.
- Notes on what to check per day are in `docs/review-notes/`.
- A lesson goes live in a production build only when its `status` is `published` and every scene has teacher sign-off in `content/signoff/dNN.json`.

## Develop
Prerequisites: Python 3.11+, Node 20+, ffmpeg.
```bash
pip install -r tools/requirements.txt
npm ci && npx playwright install chromium
python3 tools/validate_content.py
python3 tools/build_web.py --only all      # uses committed audio in media/
npm run serve                               # http://localhost:8788
python3 -m unittest discover -s tests/unit && npx playwright test
```
Regenerating audio (only after content changes): download the Piper hi_IN voices (pratham, priyamvada, rohan; medium) into `./voices/`, then `PIPER_VOICES_DIR=./voices python3 tools/build_audio.py --profile demo-piper`. Only changed lines are synthesised. Commit `media/`.

## Layout
```
content/lessons/dNN.json   lesson text (source of truth)        content/voices.json   voice slots per profile
content/pronunciation.json words the voice should say differently
media/                     generated audio + cues (committed)   tools/                validate, audio, site, review CSV, DOCX extract
web/src/                   the app (HTML, CSS, ES modules, service worker, fonts)
tests/unit, tests/e2e      Python unit tests, Playwright tests (laptop + phone)
docs/                      plan link, content guide, review notes, licences, Claude Code prompts
```

## Status
Built and tested: all 20 days drafted (950 lines, Roman + feminine variants), demo audio, the app with every feature above, CI that validates, tests and deploys to GitHub Pages.
Not done yet: teacher and student review of text and audio; launch voices (Indic Parler-TTS listening test); written permission from KHS to publish the course text; tests on real iPhone and Android devices.
