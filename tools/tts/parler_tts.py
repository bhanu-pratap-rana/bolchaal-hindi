"""AI4Bharat Indic Parler-TTS adapter (open source, runs offline; GPU strongly recommended).

Tested on Apple Silicon (MPS). Install per the model card (huggingface.co/ai4bharat/indic-parler-tts):
  pip install git+https://github.com/huggingface/parler-tts.git soundfile torch
  pip install -U "protobuf>=5.26" sentencepiece
The model is gated on Hugging Face: accept its terms, then `huggingface-cli login`.
A free Google Colab GPU is enough to generate the whole course once.

Parler samples randomly, so a fixed seed per line keeps re-runs identical.
"""
from __future__ import annotations

import io
import os

from .base import TTSProvider, cache_key, duration_ok


class ParlerProvider(TTSProvider):
    name = "parler"
    settings = {"model": "ai4bharat/indic-parler-tts", "seed": "per-line"}

    def __init__(self) -> None:
        os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
        import torch
        from transformers.utils import logging as hf_logging
        hf_logging.set_verbosity_error()  # hides the long model-config dumps
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer

        self.torch = torch
        # NVIDIA GPU (Colab), Apple Silicon GPU (MPS, e.g. MacBook M-series), else CPU (slow).
        # On a Mac, run with PYTORCH_ENABLE_MPS_FALLBACK=1 so any op MPS lacks falls back to the CPU.
        if torch.cuda.is_available():
            self.device = "cuda"
        elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            self.device = "mps"
        else:
            self.device = "cpu"
        print(f"Parler-TTS running on {self.device}", flush=True)
        name = os.environ.get("PARLER_MODEL", self.settings["model"])
        self.model = ParlerTTSForConditionalGeneration.from_pretrained(name).to(self.device)
        self.tok = AutoTokenizer.from_pretrained(name)
        self.desc_tok = AutoTokenizer.from_pretrained(self.model.config.text_encoder._name_or_path)

    def synthesize(self, text: str, spec: dict) -> bytes:
        import soundfile as sf

        import numpy as np

        seed = int(cache_key(spec, self.settings, text)[:8], 16)
        d = self.desc_tok(spec["description"], return_tensors="pt").to(self.device)
        p = self.tok(text, return_tensors="pt").to(self.device)
        sr = self.model.config.sampling_rate
        # Parler samples randomly: now and then a take stops early, skips words or babbles on.
        # A take whose length doesn't fit the text is retried with the next seed (seeds are fixed,
        # so re-runs stay identical). After 4 tries the take closest to a normal length is kept.
        best, best_gap = None, float("inf")
        for attempt in range(4):
            self.torch.manual_seed(seed + attempt)
            audio = np.atleast_1d(self.model.generate(
                input_ids=d.input_ids, attention_mask=d.attention_mask,
                prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask,
            ).cpu().numpy().squeeze())
            secs = audio.size / sr
            if duration_ok(text, secs):
                best = audio
                break
            gap = abs(secs - 0.09 * max(len(text.replace(" ", "")), 1))
            if gap < best_gap:
                best, best_gap = audio, gap
            print(f"  take {attempt + 1} is {secs:.1f}s, unusual for this text; retrying: {text}", flush=True)
        else:
            print(f"  WARNING kept the closest of 4 takes ({best.size / sr:.1f}s); listen to: {text}", flush=True)
        audio = best
        if audio.size < 0.1 * sr:
            raise RuntimeError(f"Parler produced no usable audio for: {text}")
        buf = io.BytesIO()
        sf.write(buf, audio, sr, format="WAV")
        return buf.getvalue()
