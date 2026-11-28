# Third-party assets and their licences

Rule (CLAUDE.md): never copy code from AGPL or GPL projects into the app, and never use a non-commercial model or dataset in a launch profile. `tools/validate_content.py --profile launch-…` fails if a launch voice is marked non-commercial in `content/voices.json`.

| Asset | Used for | Licence | Commercial use | Ships to learners? | Source |
| --- | --- | --- | --- | --- | --- |
| Mukta (Ek Type) | Interface font | SIL Open Font License 1.1 (`web/src/fonts/OFL-Mukta.txt`) | Yes | Yes (self-hosted woff2) | npm `@fontsource/mukta` 5.3.0 |
| Tiro Devanagari Hindi (Tiro Typeworks) | Dialogue font | SIL Open Font License 1.1 (`web/src/fonts/OFL-Tiro-Devanagari-Hindi.txt`) | Yes | Yes (self-hosted woff2) | npm `@fontsource/tiro-devanagari-hindi` 5.3.0 |
| Piper voice `hi_IN-pratham-medium` | Demo voice male_1 | CC BY-NC-SA 4.0 (trained on AI4Bharat data) | **No** | Yes, as generated audio in the preview | huggingface.co/rhasspy/piper-voices |
| Piper voice `hi_IN-priyamvada-medium` | Demo voices female_1, female_2 (pitch-shifted) | CC BY-NC-SA 4.0 | **No** | Yes, as generated audio in the preview | huggingface.co/rhasspy/piper-voices |
| Piper voice `hi_IN-rohan-medium` | Demo voice male_2 | IIT Madras IndicTTS licence (unverified wording; check before commercial use) | Unverified | Yes, as generated audio in the preview | huggingface.co/rhasspy/piper-voices |
| Kokoro-82M (hexgrad), via kokoro-onnx | Natural-voice profile `natural-kokoro` (hm_omega, hm_psi, hf_alpha, hf_beta) | Apache-2.0 (model card; Hindi voices' training data not documented, verify before launch) | Yes | Not yet (under listening test) | github.com/thewh1teagle/kokoro-onnx releases |
| espeak-ng (via kokoro-onnx) | Build-time Hindi phonemes for Kokoro | GPL-3.0 (build tool only) | Build tool only; not copied into the app | No | github.com/espeak-ng/espeak-ng |
| piper-tts (Python package) | Build-time speech synthesis | GPL-3.0 | Build tool only; not copied into the app | No | pypi.org/project/piper-tts |
| AI4Bharat Indic Parler-TTS (voices Aman, Rani, Rohit, Divya) | Course voices (`launch-parler`), generated 2026-11-27 | Apache-2.0 (model card) | Yes | Yes, as generated audio | huggingface.co/ai4bharat/indic-parler-tts |
| Azure AI Speech | Fallback launch voices (`launch-azure`) | Microsoft service terms | Yes, per terms | Not yet used | learn.microsoft.com |
| ffmpeg | Build-time audio encoding | LGPL/GPL (build tool) | Build tool only | No | ffmpeg.org |
| python-docx | Build-time DOCX extraction | MIT | Yes | No | pypi.org/project/python-docx |
| Playwright | Tests | Apache-2.0 | Yes | No | playwright.dev |
| Course text (बोलचाल की हिंदी: संवादात्मक पाठ) | Lesson content | Kendriya Hindi Sansthan course material | **Get written permission before a public launch** | Yes | Course DOCX (not committed) |

The live site now uses the Apache-2.0 Parler voices; the Piper rows apply only if the `demo-piper` profile is rebuilt. Before a public or commercial launch, confirm permission to publish the course text.
