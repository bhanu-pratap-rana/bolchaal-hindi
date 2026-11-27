"""Kokoro-82M via kokoro-onnx (offline, CPU, about real time on 2 cores).

Model: Apache-2.0 (hexgrad/Kokoro-82M). Hindi voices: hf_alpha, hf_beta (female), hm_omega, hm_psi (male).
Download into KOKORO_DIR (default ./voices/kokoro):
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
pip install kokoro-onnx soundfile   (uses espeak-ng for Hindi phonemes at build time only)
"""
from __future__ import annotations

import io
import os
import wave
from pathlib import Path

from .base import TTSProvider


class KokoroProvider(TTSProvider):
    name = "kokoro"
    settings = {"speed": 0.92, "lang": "hi"}

    def __init__(self) -> None:
        from kokoro_onnx import Kokoro  # imported lazily
        root = Path(os.environ.get("KOKORO_DIR", "voices/kokoro"))
        model, voices = root / "kokoro-v1.0.onnx", root / "voices-v1.0.bin"
        if not model.exists() or not voices.exists():
            raise FileNotFoundError(f"kokoro-v1.0.onnx / voices-v1.0.bin not found in {root} (set KOKORO_DIR)")
        self._k = Kokoro(str(model), str(voices))

    def synthesize(self, text: str, spec: dict) -> bytes:
        import numpy as np
        samples, sr = self._k.create(text, voice=spec["model"], speed=spec.get("speed", self.settings["speed"]),
                                     lang=self.settings["lang"])
        pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes(pcm)
        return buf.getvalue()
