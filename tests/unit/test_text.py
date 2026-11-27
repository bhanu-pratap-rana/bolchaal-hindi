import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from tts.text import leftover_latin, number_words, to_speech  # noqa: E402


class NumberWords(unittest.TestCase):
    def test_small(self):
        self.assertEqual(number_words(0), "शून्य")
        self.assertEqual(number_words(5), "पाँच")
        self.assertEqual(number_words(49), "उनचास")
        self.assertEqual(number_words(99), "निन्यानबे")

    def test_large(self):
        self.assertEqual(number_words(100), "एक सौ")
        self.assertEqual(number_words(250), "दो सौ पचास")
        self.assertEqual(number_words(1500), "एक हज़ार पाँच सौ")
        self.assertEqual(number_words(250000), "दो लाख पचास हज़ार")


class Speech(unittest.TestCase):
    def test_rupees(self):
        spoken, subs = to_speech("कुल ₹500 हुए।")
        self.assertEqual(spoken, "कुल पाँच सौ रुपये हुए।")
        self.assertEqual(subs, [("₹500", "पाँच सौ रुपये")])

    def test_plain_number_and_devanagari_digits(self):
        self.assertEqual(to_speech("टर्मिनल 2 पर जाइए")[0], "टर्मिनल दो पर जाइए")
        self.assertEqual(to_speech("कमरा नंबर १०५")[0], "कमरा नंबर एक सौ पाँच")

    def test_time(self):
        self.assertEqual(to_speech("ट्रेन 10:30 पर है")[0], "ट्रेन साढ़े दस बजे पर है")
        self.assertEqual(to_speech("गाड़ी 7:00 पर")[0], "गाड़ी सात बजे पर")
        self.assertEqual(to_speech("6:30 बजे निकलेगी")[0], "साढ़े छह बजे निकलेगी")
        self.assertEqual(to_speech("2:30 बजे")[0], "ढाई बजे")
        self.assertEqual(to_speech("4:15 बजे")[0], "सवा चार बजे")
        self.assertEqual(to_speech("8:45 बजे")[0], "पौने नौ बजे")
        self.assertEqual(to_speech("10:05 बजे")[0], "दस बजकर पाँच मिनट")

    def test_amounts_people_say(self):
        self.assertEqual(to_speech("₹1,500 दीजिए")[0], "पंद्रह सौ रुपये दीजिए")
        self.assertEqual(to_speech("₹500 रुपये")[0], "पाँच सौ रुपये")
        self.assertEqual(to_speech("₹2,000")[0], "दो हज़ार रुपये")
        self.assertEqual(to_speech("₹10.50")[0], "दस रुपये पचास पैसे")
        self.assertEqual(to_speech("कुल 500, और")[0], "कुल पाँच सौ, और")

    def test_long_digit_runs(self):
        self.assertEqual(to_speech("यूपी-32 एबी 4567")[0], "यूपी-बत्तीस एबी चार पाँच छह सात")
        self.assertEqual(to_speech("9876543210")[0], "नौ आठ सात छह पाँच चार तीन दो एक शून्य")

    def test_acronym(self):
        spoken, _ = to_speech("क्या UPI से पेमेंट हो सकता है?")
        self.assertEqual(spoken, "क्या यू पी आई से पेमेंट हो सकता है?")

    def test_lexicon_first(self):
        spoken, subs = to_speech("टर्मिनल–2", {"–": " "})
        self.assertEqual(spoken, "टर्मिनल दो")
        self.assertIn(("–", " "), subs)

    def test_unchanged(self):
        self.assertEqual(to_speech("नमस्ते, आप कैसे हैं?"), ("नमस्ते, आप कैसे हैं?", []))

    def test_leftover(self):
        self.assertEqual(leftover_latin("यह card है"), ["card"])


if __name__ == "__main__":
    unittest.main()
