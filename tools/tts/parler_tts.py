"""AI4Bharat Indic Parler-TTS adapter (open source, runs offline; GPU strongly recommended).

NOT YET RUN. Install per the model card (huggingface.co/ai4bharat/indic-parler-tts):
  pip install git+https://github.com/huggingface/parler-tts.git soundfile torch
The model is gated on Hugging Face: accept its terms, then `huggingface-cli login`.
A free Google Colab GPU is enough to generate the whole course once.

Parler samples randomly, so a fixed seed per line keeps re-runs identical.
"""
from __future__ import annotations

import io
import os

from .base import TTSProvider, cache_key


class ParlerProvider(TTSProvider):
    name = "parler"
    settings = {"model": "ai4bharat/indic-parler-tts", "seed": "per-line"}

    def __init__(self) -> None:
        import torch
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer

        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        name = os.environ.get("PARLER_MODEL", self.settings["model"])
        self.model = ParlerTTSForConditionalGeneration.from_pretrained(name).to(self.device)
        self.tok = AutoTokenizer.from_pretrained(name)
        self.desc_tok = AutoTokenizer.from_pretrained(self.model.config.text_encoder._name_or_path)

    def synthesize(self, text: str, spec: dict) -> bytes:
        import soundfile as sf

        seed = int(cache_key(spec, self.settings, text)[:8], 16)
        self.torch.manual_seed(seed)
        d = self.desc_tok(spec["description"], return_tensors="pt").to(self.device)
        p = self.tok(text, return_tensors="pt").to(self.device)
        audio = self.model.generate(
            input_ids=d.input_ids, attention_mask=d.attention_mask,
            prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask,
        ).cpu().numpy().squeeze()
        buf = io.BytesIO()
        sf.write(buf, audio, self.model.config.sampling_rate, format="WAV")
        return buf.getvalue()
