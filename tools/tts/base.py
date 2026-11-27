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


def get_provider(name: str) -> TTSProvider:
    if name == "piper":
        from .piper_tts import PiperProvider
        return PiperProvider()
    if name == "azure":
        from .azure_tts import AzureProvider
        return AzureProvider()
    if name == "parler":
        from .parler_tts import ParlerProvider
        return ParlerProvider()
    raise ValueError(f"Unknown TTS provider: {name}")
