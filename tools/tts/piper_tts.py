"""Piper (offline, CPU). Tested in the prototype with piper-tts 1.8.0.

Voice models are not in git. Download the hi_IN voices (pratham, priyamvada,
rohan; medium) and set PIPER_VOICES_DIR to the folder that holds the .onnx and
.onnx.json files (any sub-folder layout is fine).
"""
from __future__ import annotations

import io
import os
import wave
from pathlib import Path

from .base import TTSProvider


class PiperProvider(TTSProvider):
    name = "piper"
    settings = {"length_scale": 1.12, "noise_scale": 0.6, "noise_w_scale": 0.8}

    def __init__(self) -> None:
        from piper import PiperVoice, SynthesisConfig  # imported lazily
        self._PiperVoice = PiperVoice
        self._cfg = SynthesisConfig(**self.settings)
        self._root = Path(os.environ.get("PIPER_VOICES_DIR", "voices"))
        self._loaded: dict[str, object] = {}

    def _voice(self, model: str):
        if model not in self._loaded:
            hits = [Path(d) / f for d, _, fs in os.walk(self._root, followlinks=True)
                    for f in fs if f == f"{model}.onnx"]
            if not hits:
                raise FileNotFoundError(f"{model}.onnx not found under {self._root} (set PIPER_VOICES_DIR)")
            self._loaded[model] = self._PiperVoice.load(str(hits[0]))
        return self._loaded[model]

    def synthesize(self, text: str, spec: dict) -> bytes:
        voice = self._voice(spec["model"])  # load first so a missing model fails clearly
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            voice.synthesize_wav(text, w, syn_config=self._cfg)
        return buf.getvalue()
