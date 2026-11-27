"""Azure AI Speech REST adapter (free F0 tier: 0.5M neural characters/month).

NOT YET RUN against a live key. Verify the hi-IN voice names first:
  GET https://<region>.tts.speech.microsoft.com/cognitiveservices/voices/list
Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in the environment (never in the web app).
"""
from __future__ import annotations

import os
import time
from xml.sax.saxutils import escape

import httpx

from .base import TTSProvider


class AzureProvider(TTSProvider):
    name = "azure"
    settings = {"format": "riff-24khz-16bit-mono-pcm", "rate": "-8%"}

    def __init__(self) -> None:
        self.key = os.environ["AZURE_SPEECH_KEY"]
        self.region = os.environ["AZURE_SPEECH_REGION"]
        self.url = f"https://{self.region}.tts.speech.microsoft.com/cognitiveservices/v1"

    def synthesize(self, text: str, spec: dict) -> bytes:
        ssml = (
            "<speak version='1.0' xml:lang='hi-IN'>"
            f"<voice name='{spec['voice']}'><prosody rate='{self.settings['rate']}'>{escape(text)}</prosody></voice>"
            "</speak>"
        )
        headers = {
            "Ocp-Apim-Subscription-Key": self.key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": self.settings["format"],
            "User-Agent": "bolchaal-hindi-build",
        }
        for attempt in range(4):  # F0 allows 20 requests per 60 s
            r = httpx.post(self.url, content=ssml.encode("utf-8"), headers=headers, timeout=60)
            if r.status_code == 429:
                time.sleep(4 * (attempt + 1))
                continue
            r.raise_for_status()
            time.sleep(3.1)  # stay under 20 requests per minute
            return r.content
        raise RuntimeError("Azure TTS kept returning 429")
