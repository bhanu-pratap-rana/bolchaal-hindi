"""Provider-neutral text-to-speech interface.

Every adapter turns (text, voice spec) into WAV bytes. Nothing else in the
pipeline knows which provider made the audio, so a provider can be swapped by
changing content/voices.json and rebuilding.
"""
from __future__ import annotations

import hashlib
import json
import unicodedata
from abc import ABC, abstractmethod


def normalise(text: str) -> str:
    """NFC + single spaces, so visually identical text gets the same cache key."""
    return unicodedata.normalize("NFC", " ".join(text.split()))


def cache_key(spec: dict, settings: dict, text: str) -> str:
    """Stable key for one synthesised line. Any change to voice, settings or text changes it."""
    voice_id = {k: v for k, v in spec.items() if k not in ("label", "licence", "commercial")}
    raw = json.dumps({"voice": voice_id, "settings": settings, "text": normalise(text)},
                     ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


class TTSProvider(ABC):
    name: str = "base"
    settings: dict = {}

    @abstractmethod
    def synthesize(self, text: str, spec: dict) -> bytes:
        """Return a complete WAV file (bytes) for one line of Hindi text."""


def spoken_chars(text: str) -> int:
    """Letters and digits only: spaces and punctuation take no speaking time of their own."""
    return sum(1 for c in text if c.isalnum() or "\u0900" <= c <= "\u097f" and c not in "\u0964\u0965")


def duration_ok(text: str, seconds: float) -> bool:
    """Is this a believable length for saying `text`? Hindi speech runs at about 0.09 s per character.

    Far shorter means words were skipped or the model stopped; far longer means repeats or babbling.
    The +1.2 s lets very short lines ("जी।") breathe.
    """
    n = max(spoken_chars(text), 1)
    return 0.045 * n <= seconds <= 0.2 * n + 1.2


def get_provider_class(name: str) -> type[TTSProvider]:
    """The provider class, without loading its model (its `settings` are enough for cache keys)."""
    if name == "piper":
        from .piper_tts import PiperProvider
        return PiperProvider
    if name == "azure":
        from .azure_tts import AzureProvider
        return AzureProvider
    if name == "kokoro":
        from .kokoro_tts import KokoroProvider
        return KokoroProvider
    if name == "parler":
        from .parler_tts import ParlerProvider
        return ParlerProvider
    raise ValueError(f"Unknown TTS provider: {name}")


def get_provider(name: str) -> TTSProvider:
    return get_provider_class(name)()
