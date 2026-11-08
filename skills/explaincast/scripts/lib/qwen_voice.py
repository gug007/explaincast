# The local voice ("tts": "qwen" in video.json): Qwen3-TTS speaks a line and
# mlx-whisper times its words, both on Apple silicon. qwen.js starts one of
# these per run and talks to it in JSON lines on stdin/stdout, so the models
# load once. Anything the libraries print goes to stderr.
import json
import os
import sys
import wave

os.environ.setdefault("HF_HUB_OFFLINE", "1")
out = sys.stdout
sys.stdout = sys.stderr

TTS_MODEL = os.environ.get("EXPLAINCAST_QWEN_MODEL", "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-4bit")
ASR_MODEL = os.environ.get("EXPLAINCAST_WHISPER_MODEL", "mlx-community/whisper-large-v3-mlx")
# Without a prompt in simplified characters Whisper may write Chinese in
# traditional ones (設置 for 设置), which no longer matches the line.
PROMPTS = {"zh": "以下是普通话的句子。"}
_tts = None


def speak(text, speaker, style, language, wav):
    global _tts
    import numpy as np
    if _tts is None:
        from mlx_audio.tts.utils import load_model
        _tts = load_model(TTS_MODEL)
    parts = _tts.generate_custom_voice(text=text, speaker=speaker, language=language, instruct=style)
    audio = np.concatenate([np.asarray(p.audio).reshape(-1) for p in parts]).astype(np.float32)
    with wave.open(wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(_tts.sample_rate)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
    return {}


def words(wav, language):
    import mlx_whisper
    r = mlx_whisper.transcribe(wav, path_or_hf_repo=ASR_MODEL, language=language, word_timestamps=True, temperature=0, verbose=None, initial_prompt=PROMPTS.get(language))
    return {"words": [{"word": w["word"], "start": w["start"], "end": w["end"]} for s in r["segments"] for w in s.get("words", [])]}


for line in sys.stdin:
    req = json.loads(line)
    try:
        op = req.pop("op")
        res = {"ok": True, **(speak if op == "speak" else words)(**req)}
    except Exception as e:
        res = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    out.write(json.dumps(res, ensure_ascii=False) + "\n")
    out.flush()
