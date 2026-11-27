# Content guide (for authors and reviewers)

## Where content lives
One file per DOCX day-module: `content/lessons/d01.json` … `d20.json`. Edit these, then run the validator.

```json
{
  "id": "d07", "day": 7, "status": "review",
  "title_hi": "रेस्तराँ में खाना मँगाना", "title_en": "Ordering at a restaurant",
  "roles": {
    "customer": {"hi": "ग्राहक", "en": "Customer", "learner": true,  "grammar": "learner", "voice": {"m": "male_1", "f": "female_1"}},
    "waiter":   {"hi": "वेटर",  "en": "Waiter",   "learner": false, "grammar": "m",       "voice": {"m": "male_2", "f": "male_2"}}
  },
  "vocab": [{"hi": "तीखा", "roman": "teekhaa", "en": "spicy (hot)"}],
  "scenes": [{
    "id": "d07s5", "title_hi": "बिल माँगना", "title_en": "Asking for the bill",
    "situation": "You ask for the bill and pay by card.",
    "lines": [
      {"role": "customer", "hi": "क्या मैं कार्ड से पेमेंट कर सकता हूँ?", "roman": "Kyaa main card se payment kar saktaa hoon?", "en": "Can I pay by card?",
       "f": {"hi": "क्या मैं कार्ड से पेमेंट कर सकती हूँ?", "roman": "Kyaa main card se payment kar saktee hoon?"}}
    ]
  }]
}
```

- `learner: true` marks the role the learner plays (tourist, customer, passenger). Exactly one per lesson.
- `grammar`: `m`, `f`, `neutral`, or `learner` (follows the learner's chosen gender).
- `voice.m` / `voice.f`: the voice slot used when the learner is a man / a woman. Give the learner role a male slot for `m` and a female slot for `f`, and make sure no two roles in a scene share a slot.

## Feminine variants (`f`)
Add `f` to a line when the words change for a woman learner:
1. **The learner speaks about herself:** आया → आई, सकता → सकती, देता → देती, करता → करती, चाहता → चाहती, खाता → खाती.
2. **Someone speaks to the learner:** आए हैं → आई हैं, रहेंगे → रहेंगी, लेंगे → लेंगी, चाहते हैं → चाहती हैं.
Lines addressed to another character (for example the passenger asking the driver "चलेंगे?") stay as they are. The validator raises an error for case 1 and a warning for case 2.

## Roman scheme (simplified, for tourists)
| Sound | Write | Example |
| --- | --- | --- |
| long vowels आ ई ऊ | aa, ee, oo | aapkaa, theek, ghoomne |
| short vowels अ इ उ | a, i, u | kab, kitnaa, kuchh |
| ए ऐ ओ औ | e, ai, o, au | mere, hai, kyaa, aur |
| nasal ं ँ | n | haan, naheen |
| common words | main (मैं), mein (में), hain (हैं), yeh (यह) | |
| aspirated | kh, gh, chh, jh, th, dh, ph, bh | khaanaa, bhee |
| श ष | sh | shaakaahaaree |
| ज़ फ़ | z, f | zyaadaa, form |
Keep English loanwords in their English spelling (passport, card, menu). Drop the silent final "a" (Dhanyavaad, not Dhanyavaada).

## Review workflow (students and teacher)
1. A student checks the Hindi, Roman and English for each line, and the feminine variant where present.
2. After `build_audio.py`, reviewers play every scene in both learner modes (man / woman) and note lines that sound wrong in a listening log (scene id, line number, problem).
3. Fix the text (for example spell out numbers, add a comma for a pause), rebuild, and re-check only the changed lines.
4. The teacher sets `"status": "published"` when the module is signed off.

## Optional line fields
- `tts`: the text the voice should speak when the displayed Hindi can't be read aloud as written (e.g. a slash form "सकता/सकती"). Displayed text stays as it is.
- `gender_ok: true`: a reviewer has checked that a flagged form is the same for a woman learner (e.g. "हम … करेंगे", or "पासपोर्ट खो गया" where the verb agrees with the passport). It silences the validator for that line.
- Numbers, ₹ amounts, times and Latin acronyms are converted to words for the voice automatically (`tools/tts/text.py`). Add other words the voice gets wrong to `content/pronunciation.json`.

## Sign-off file
Run `python3 tools/signoff.py d05 --reviewer "Name"` after the teacher has listened to every scene in both learner modes. It writes `content/signoff/d05.json` entries (scene, variant, role, reviewer, date, and a hash of the scene text). A lesson can be `published` only when every scene has a teacher entry for both `m` and `f`, and the validator rejects scenes edited after sign-off.
