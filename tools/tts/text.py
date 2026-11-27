"""Turn displayed Hindi text into the text a TTS engine should speak.

The learner sees `hi` exactly as written. The voice is given a spoken form:
digits become Hindi number words, ₹ amounts become "... रुपये", clock times become
"... बजकर ... मिनट", Latin-script acronyms are spelled letter by letter, and any
entry in content/pronunciation.json is replaced first. Every substitution is
returned so the build can log it and reviewers can see what the voice was given.
"""
from __future__ import annotations

import hashlib
import json
import re

ONES = ("शून्य एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस "
        "बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस "
        "पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस "
        "सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ "
        "इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर "
        "पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी "
        "सत्तासी अट्ठासी नवासी नब्बे इक्यानबे बानबे तिरानबे चौरानबे पंचानबे छियानबे सत्तानबे "
        "अट्ठानबे निन्यानबे").split()
assert len(ONES) == 100

LETTERS = {"A": "ए", "B": "बी", "C": "सी", "D": "डी", "E": "ई", "F": "एफ़", "G": "जी", "H": "एच", "I": "आई",
           "J": "जे", "K": "के", "L": "एल", "M": "एम", "N": "एन", "O": "ओ", "P": "पी", "Q": "क्यू", "R": "आर",
           "S": "एस", "T": "टी", "U": "यू", "V": "वी", "W": "डब्ल्यू", "X": "एक्स", "Y": "वाई", "Z": "ज़ेड"}
DEV_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def number_words(n: int) -> str:
    """Hindi words for 0 <= n < 10,00,00,000 (Indian grouping: हज़ार, लाख, करोड़)."""
    if n < 100:
        return ONES[n]
    parts = []
    for size, word in ((10_000_000, "करोड़"), (100_000, "लाख"), (1000, "हज़ार"), (100, "सौ")):
        if n >= size:
            parts.append(f"{number_words(n // size)} {word}")
            n %= size
    if n:
        parts.append(ONES[n])
    return " ".join(parts)


NUM = r"\d+(?:,\d{2,3})*(?:\.\d+)?"   # 1500, 1,500, 2,00,000, 1.5 (a trailing ", " is left alone)


def spoken_number(n: int) -> str:
    """How people say an amount: 1500 -> पंद्रह सौ (not एक हज़ार पाँच सौ)."""
    if 1100 <= n <= 9900 and n % 100 == 0 and n % 1000:
        return f"{ONES[n // 100]} सौ"
    return number_words(n)


def _num(s: str) -> str:
    s = s.replace(",", "")
    if "." in s:
        whole, frac = s.split(".", 1)
        return f"{spoken_number(int(whole or 0))} दशमलव {' '.join(ONES[int(d)] for d in frac)}"
    return spoken_number(int(s))


def _digits(s: str) -> str:
    return " ".join(ONES[int(d)] for d in s)


def _time(h: int, m: int) -> str:
    nxt = 1 if h == 12 else h + 1
    if m == 0:
        return f"{number_words(h)} बजे"
    if m == 30:
        return {1: "डेढ़ बजे", 2: "ढाई बजे"}.get(h, f"साढ़े {number_words(h)} बजे")
    if m == 15:
        return f"सवा {number_words(h)} बजे"
    if m == 45:
        return f"पौने {number_words(nxt)} बजे"
    return f"{number_words(h)} बजकर {number_words(m)} मिनट"


def _rupees(amount: str) -> str:
    amount = amount.replace(",", "")
    if "." in amount:
        r, p = amount.split(".", 1)
        p = int((p + "0")[:2])
        return f"{spoken_number(int(r))} रुपये" + (f" {number_words(p)} पैसे" if p else "")
    return f"{spoken_number(int(amount))} रुपये"


def to_speech(text: str, lexicon: dict[str, str] | None = None) -> tuple[str, list[tuple[str, str]]]:
    """Return (spoken text, [(original, replacement), ...])."""
    subs: list[tuple[str, str]] = []
    out = text.translate(DEV_DIGITS)

    def sub(pattern: str, repl, flags=0):
        nonlocal out

        def f(m: re.Match) -> str:
            r = repl(m)
            subs.append((m.group(0), r))
            return r
        out = re.sub(pattern, f, out, flags=flags)

    for k in sorted(lexicon or {}, key=len, reverse=True):
        if k in out:
            subs.append((k, lexicon[k]))
            out = out.replace(k, lexicon[k])
    # ₹1,500 / Rs. 500 (a following रुपये/रुपए is not repeated)
    sub(rf"(?:₹|Rs\.?)\s?({NUM})(?:\s?(?:रुपये|रुपए|रु\.))?", lambda m: _rupees(m.group(1)))
    # 6:30 बजे -> साढ़े छह बजे ; 10:05 -> दस बजकर पाँच मिनट (a following बजे is not repeated)
    sub(r"\b(\d{1,2}):(\d{2})\b(?:\s?बजे)?", lambda m: _time(int(m.group(1)), int(m.group(2))))
    sub(rf"({NUM})\s?%", lambda m: f"{_num(m.group(1))} प्रतिशत")
    # Long digit runs (number plates, phone numbers, PNR) are read digit by digit
    sub(r"(?<![\d,.])\d{4,}(?![\d,.]\d)", lambda m: _digits(m.group(0)))
    sub(NUM, lambda m: _num(m.group(0)))
    # Latin acronyms (2+ capitals) spelled letter by letter: UPI -> यू पी आई
    sub(r"\b[A-Z]{2,}\b", lambda m: " ".join(LETTERS[c] for c in m.group(0)))
    return " ".join(out.split()), subs


def leftover_latin(spoken: str) -> list[str]:
    """Latin words still in the spoken text; the build warns about these."""
    return re.findall(r"[A-Za-z]{2,}", spoken)


def scene_fingerprint(lesson: dict, scene: dict, lexicon: dict) -> str:
    """Changes whenever anything that affects a scene's audio changes: text, tts overrides, voice slots, lexicon."""
    data = [[ln["role"], lesson["roles"][ln["role"]]["voice"], ln["hi"], ln.get("tts"), ln.get("f")] for ln in scene["lines"]]
    raw = json.dumps([data, lexicon], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def scene_text_hash(scene: dict) -> str:
    """Changes whenever a scene's displayed text changes; stored with each teacher sign-off."""
    data = [[ln["role"], ln["hi"], ln["roman"], ln["en"], ln.get("f")] for ln in scene["lines"]]
    return hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
