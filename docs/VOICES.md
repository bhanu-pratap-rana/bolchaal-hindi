# Natural voices: generate the course audio once

The site plays pre-made audio from `media/`. To replace the robotic demo voices (Piper) with natural ones, generate the whole course once with **AI4Bharat Indic Parler-TTS** (Apache-2.0, trained on Indian speakers; Hindi voices Rohit and Divya recommended, Aman and Rani available). Choose one way to run it.

## Option A: your Mac (Apple Silicon, 16 GB RAM or more)

Uses the Mac's GPU through PyTorch's MPS backend. Not yet tested on a Mac: the first run will show whether every step works on MPS (the fallback setting below covers missing operations).

```bash
# one-time setup
brew install python@3.12 ffmpeg git
git clone https://github.com/bhanu-pratap-rana/bolchaal-hindi && cd bolchaal-hindi
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r tools/requirements.txt
pip install torch soundfile git+https://github.com/huggingface/parler-tts.git
pip install -U "protobuf>=5.26" sentencepiece   # the tokenizer needs a newer protobuf than parler-tts pulls in

# accept the model's terms at https://huggingface.co/ai4bharat/indic-parler-tts, then
huggingface-cli login            # paste a read token from huggingface.co/settings/tokens

export PYTORCH_ENABLE_MPS_FALLBACK=1

# 1) listening test: four short files, one per voice; check each voice's gender
python3 tools/voice_samples.py --profile launch-parler      # writes samples/launch-parler-*.wav, then: open samples

# 2) the whole course (resumable: rerun after any stop and finished clips are reused)
caffeinate -i python3 tools/build_audio.py --profile launch-parler

# 3) check, then send it to GitHub on a branch
python3 tools/audio_qc.py
python3 tools/validate_content.py --profile launch-parler
git checkout -b voices-parler && git add media content/voices.json
git commit -m "Natural voices: whole course generated with Indic Parler-TTS" && git push -u origin voices-parler
```
`caffeinate -i` keeps the Mac awake while it runs; keep it plugged in. The first line printed says `Parler-TTS running on mps` when the GPU is used.

If a voice in the listening test is the wrong gender, swap the `speaker`, `label` and the name in `description` between slots in `content/voices.json` (profile `launch-parler`) and run the test again.

## Option B: Google Colab (free GPU)

Open `tools/colab_parler.ipynb` in Colab (https://colab.research.google.com/github/bhanu-pratap-rana/bolchaal-hindi/blob/main/tools/colab_parler.ipynb), choose a T4 GPU and run the cells in order. It saves clips to Google Drive so a disconnect doesn't lose work, and pushes the result to the `voices-parler` branch.

## After either option
Tell Claude (or run it yourself): merge `voices-parler`, run `python3 tools/build_web.py --only all` and the tests, and the live site switches to the new voices. The teacher should then listen to every scene in both learner versions; `tools/audio_qc.py` lists the lines to listen to first.
