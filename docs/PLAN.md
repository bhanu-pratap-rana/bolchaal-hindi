# Plan

The full plan (product, architecture, data model, free-service checks, risks, acceptance criteria, build guide) lives in the shared doc:
https://claude.ai/artifact/FtSqhTkQfk2vDSwQ6ciPbE

Working prototype: https://claude.ai/artifact/8sacpH7XnpYWivNU1HfXGE

Decisions (3 Nov 2026):
- Learner gender switch with feminine variants: yes.
- Roman scheme: simplified learner spelling.
- Review: students and a teacher review content and audio.
- Voices: Piper for the demo; Indic Parler-TTS (Apache-2.0, free) as the planned launch voices, pending a listening test; Azure free tier as the fallback.

Update (23 Nov 2026): section 17 of the plan lists eight upgrades learned from existing solutions (reviewer mode, script setting, licence guardrails, Check-mode tasks, word status, record and compare, offline day packs, alignment spike). Prompts are in `docs/PROMPTS.md` (U1 to U8). None is built yet.
