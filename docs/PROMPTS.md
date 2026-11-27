# Claude Code prompts, phase by phase

How to use: open the repo in Cursor, open Cursor's terminal, run `claude`. For each phase, start Plan mode (Shift+Tab until "plan mode" shows), paste the prompt, read the plan, then approve. Run `/clear` between phases. Commit after each phase passes its check.

---

## Phase 1: import all 20 days from the DOCX
**Goal:** draft `content/lessons/d02.json` … `d20.json` from the course DOCX.

> Put the course file at `source/bolchaal.docx` (git-ignored). Write `tools/import_docx.py` that reads it with python-docx and drafts one lesson JSON per day in the format of `content/lessons/d07.json`. Rules: each numbered situation becomes a scene; each "role : text" line becomes a line; pair Hindi and English by order within a scene, NOT by table row (in the DOCX the English column often drifts one row down); skip the empty Roman/Video cells; collect the day's glossary into `vocab`. Set `"status": "draft"` and leave `roman` as "" for now. Print a report of scenes where the Hindi and English line counts differ, so a human can fix them. Do not overwrite d01, d07 or d08. Then run the validator and show me the report.

**Check:** report lists mismatched scenes; fix them by hand in the JSON.

## Phase 2: Roman text and feminine variants (drafts for review)
> For every lesson with `"status": "draft"`, fill `roman` using the simplified scheme in `docs/CONTENT_GUIDE.md`. Then add `f` variants wherever the learner role speaks a masculine first-person form, or another role addresses the learner with masculine agreement (see the guide). Set role `voice` slots so the learner is `male_1`/`female_1` and no two roles in a scene share a slot in either variant. Change `"status"` to `"review"`. Do not change any Hindi or English wording; list anything that looks wrong in `docs/review-notes.md` instead. Run the validator until it reports 0 errors.

**Check:** validator shows 0 errors; students review `docs/review-notes.md` and the JSON.

## Phase 3: choose and generate the voices
**Free, commercial-friendly route:** AI4Bharat Indic Parler-TTS (Apache-2.0). Needs a Hugging Face login (the model is gated) and preferably a GPU; a free Google Colab GPU is enough for the whole course.

> Create `tools/colab_parler.ipynb` that clones this repo, installs `tools/requirements.txt` plus parler-tts, logs in to Hugging Face, and runs `python tools/build_audio.py --profile launch-parler --lesson d07`. Add a cell that renders one sample line in each of the four speakers (Rohit, Aman, Divya, Rani) so we can confirm their gender and quality by ear before generating everything. At the end, zip `.cache/clips`, `web/public/audio` and `web/public/lessons.json` for download.

**Check:** listen to the four samples. If a speaker's gender is not what `content/voices.json` assumes, swap the slots. Then generate all lessons, download the zip into the repo, and run `python3 tools/build_web.py`.

If you would rather use Azure's free tier (needs a card at sign-up): set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in `.env`, then run `python3 tools/build_audio.py --profile launch-azure`.

## Phase 4: Supabase (database + storage)
> Using the Supabase CLI, link this repo to my project (I'll paste the project ref), apply `supabase/migrations/20261103000000_init.sql`, and write `tools/seed_supabase.py` that upserts voices, lessons, scenes, roles, dialogue_lines, scene_audio and line_cues from `content/` and `web/public/lessons.json`. Use only `SUPABASE_SECRET_KEY` from `.env` (server-side). Then run `tools/upload_supabase.py` and the seed script. Show me row counts per table.

**Check:** row counts match the content; a second run uploads 0 files.

## Phase 5: player reads from Supabase (optional until login is needed)
> Add a small data layer to `web/src/player.html`: if `window.BCH_SUPABASE_URL` and `window.BCH_PUBLISHABLE_KEY` are set, fetch published lessons, cues and public audio URLs from Supabase (REST, RLS applies); otherwise fall back to the inlined manifest. Keep the manifest shape identical so the rest of the player is unchanged. Add a Playwright test for the fallback path.

## Phase 6: progress across devices (optional)
> Enable Supabase anonymous sign-in with Cloudflare Turnstile. On first visit create an anonymous session; save `learner_progress` (heard, best check score) and `profiles.learner_variant`. Keep localStorage as the offline fallback. Add a "Save my progress with email" button that links an email identity later (custom SMTP comes later; don't build email now).

## Phase 7: deploy
> Walk me through `npx wrangler login` and `npx wrangler deploy` for this repo, then add a GitHub Action that runs the validator, `build_web.py` and the Playwright tests on every pull request (audio is committed or downloaded as an artifact, not generated in CI).

**Check:** the deployed URL plays a scene on a real iPhone and a real Android phone, including with the screen locked.

---

# Upgrades from the existing-solutions research (plan section 17)

Run each in its own branch. Order: U1, then U2 and U3 before student review, U4 and U5 after the voices are chosen, U6 and U7 once there is a launch candidate. U8 only after launch. None of these is built yet.

## U1: licence guardrails
> Create `docs/LICENCES.md` listing every third-party asset we use or plan to use (Piper voices pratham, priyamvada, rohan; Indic Parler-TTS; Azure TTS; Playwright; wrangler; any fonts in `web/src/player.html`) with its licence, whether commercial use is allowed, and the source URL. Read each licence from its official page; where you cannot confirm it, write "unverified". Add a check to `tools/validate_content.py` that fails if the `launch-parler` or `launch-azure` profile in `content/voices.json` references a voice whose licence is marked non-commercial. Do not change any other behaviour.

**Check:** the validator fails when you temporarily point `launch-parler` at a Piper pratham voice, and passes again when you revert.

## U2: reviewer mode
> In `web/src/player.html` add a reviewer mode that turns on with `?review=1`. Beside every line show OK and Fix buttons, a note field and a reviewer-name field (remembered in localStorage). Keep marks per scene, per line and per learner variant (m, f). Add an "Export review CSV" button that downloads scene, line, variant, status, note, reviewer. Reviewer controls must be hidden when the parameter is absent. Add Playwright tests: marks persist after reload, CSV has one row per line per variant, controls absent without the parameter. Keep 44 px targets and visible focus.

**Check:** a reviewer marks one scene in both variants and the CSV has the right row count.

## U3: script setting
> In the "Aa Text" popover add a Script setting with three choices: Hindi + Roman (default), Roman only, Hindi only. Remember it in localStorage. In Roman-only mode no Devanagari may appear in lines, vocabulary chips or the glossary popover (show Roman and English instead). Add Playwright tests for each mode on the phone viewport.

**Check:** the tests pass; a student who cannot read Devanagari can follow a scene in Roman-only mode.

## U4: Check-mode tasks
> Extend Check mode with two task types besides the current listening quiz. Gap-fill: hide one content word in a line, offer three choices taken from that lesson's vocabulary, replay the line on answer. Spot-the-word: play a line and ask which of four words was said. Generate tasks with a seeded generator, never calling audio synthesis. Show the correct line and play it after a wrong answer. Keyboard and screen-reader accessible. Add tests. List in `docs/review-notes.md` any generated option that could be ungrammatical so reviewers can remove it.

**Check:** tests pass; reviewers read the generated tasks in reviewer mode (U2).

## U5: word status and vocabulary audio
> Add a status on tapped vocabulary words: still learning or known, saved in localStorage keyed by lesson and word. Extend `tools/build_audio.py` to make one cached clip per vocabulary item with the same voice slot rules and cache keys as lines, and write the clip paths into `lessons.json`. Do not add spaced-repetition scheduling. Add tests, and confirm a second build synthesises 0 clips.

**Check:** second build reports 0 new clips; status survives a reload.

## U6: record and compare
> In Speak mode, after the model line, offer Record yourself using MediaRecorder, then play your recording and the model line back to back. Recordings stay in memory on the device and are never uploaded; add a test that asserts no network request carries audio. Show a clear message when the microphone is blocked or unsupported. Do not add speech recognition or scoring.

**Check:** test on a real iPhone and a real Android phone; the recording format and permission prompt behave.

## U7: offline day packs
> Add a service worker and a "Save this day" button that stores that day's scene audio, lessons.json entries and the player page in the Cache API. Show how much is stored and a Remove button. Add a Playwright test that saves a day, goes offline and plays a scene. Document in the README that browsers may clear stored data for sites not opened for a while.

**Check:** with the network off, a saved day plays and highlights.

## U8: alignment spike (after launch)
> Do not change the player. In a throwaway branch, try a forced aligner on 20 reviewed lines of stitched scene audio and compare word start times with a reviewer's manual marks. Use only a model whose licence allows commercial use (record it in `docs/LICENCES.md`). Report the share of words within 150 ms. If it is below 90 percent, stop and write the finding down.

**Check:** a one-page report with the number and the model's licence.

---

# P0 and R1: pipeline fixes and a review loop for non-developers (plan section 18)

Do P0 before Phase 1. None of this is built yet.

## P0-a: status gate
> Make `tools/build_web.py`, `tools/build_audio.py` and `tools/upload_supabase.py` accept `--only published|review|all` (default `published`). Production builds use `published`; the staging build uses `all`. Add a validator warning when a `published` lesson has a scene without sign-off in `content/signoff/<day>.json`. Add tests that a `review` lesson never appears in a `published` build.

## P0-b: text layer for speech
> Add an optional `tts` field per line and a `content/pronunciation.json` lexicon (digits, rupee amounts, times, abbreviations such as UPI and ATM, common English loanwords) applied to the text sent to the TTS engine before the cache key is computed. Displayed text must never change. Add unit tests for amounts and times, and list every substitution in the build log so reviewers can see what the voice was actually given.

## P0-c: self-hosted fonts
> Replace the Google Fonts links in `web/src/player.html` with self-hosted subsets of Mukta (400, 500, 600, 700) and Tiro Devanagari Hindi under `web/public/fonts/`, using `font-display: swap`. Confirm each font's licence (both are SIL OFL on Google Fonts; verify from the font files' own licence text) and add them to `docs/LICENCES.md`. Add a Playwright test that the page makes no request to a third-party host.

## P0-d: caching, 404s and per-lesson manifests
> Add `web/public/_headers`: `Cache-Control: public, max-age=31536000, immutable` for `/audio/*` and `/fonts/*`; `no-cache` for `/index.html`, `/course.json` and `/lessons/*.json`. Check Cloudflare's Workers static-assets documentation that `_headers` is supported and say what you found. Change `wrangler.jsonc` so missing files return 404 rather than the page. Split `lessons.json` into `course.json` (day and scene titles, no lines) and `lessons/<day>.json` loaded on demand, keeping the same shape per lesson. Add tests: missing audio shows the error state; only the opened lesson's JSON is fetched.

## R1: review sheets for teachers and students
> Write `tools/export_review_csv.py` (one CSV per day: scene id, line number, role, hi, roman, en, f_hi, f_roman, status, reviewer note) and `tools/import_review_csv.py` that reads an edited CSV and prints a diff of every changed hi, roman, en or f cell, then writes to the JSON only after I confirm. Hindi wording changes must be listed separately at the top of the diff. Also add `content/signoff/<day>.json` (reviewer, role, date, scene, variant). Add tests for a round trip with no changes (empty diff) and with one edited Roman cell (one-line diff).
