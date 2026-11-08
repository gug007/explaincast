# The local voices ("tts": "ming" or "qwen" in video.json): Ming-3.0 or
# Qwen3-TTS speaks a line and mlx-whisper times its words, all on Apple
# silicon. local.js starts one of these per run and talks to it in JSON lines
# on stdin/stdout, so the models load once. Anything the libraries print goes
# to stderr.
import json
import math
import os
import re
import sys
import wave

os.environ.setdefault("HF_HUB_OFFLINE", "1")

TTS_MODELS = {
    "qwen": os.environ.get("EXPLAINCAST_QWEN_MODEL", "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-4bit"),
    "ming": os.environ.get("EXPLAINCAST_MING_MODEL", "mlx-community/Ming-3.0-tts-0.5B-8bit"),
}
ASR_MODEL = os.environ.get("EXPLAINCAST_WHISPER_MODEL", "mlx-community/whisper-large-v3-mlx")
# Without a prompt in simplified characters Whisper may write Chinese in
# traditional ones (設置 for 设置), which no longer matches the line.
PROMPTS = {"zh": "以下是普通话的句子。"}
_tts = {}


def pitch(audio, sr):
    """Median pitch (Hz) of the voiced 40 ms frames, by autocorrelation."""
    import numpy as np
    hop, win = int(sr * 0.01), int(sr * 0.04)
    lo, hi = int(sr / 400), int(sr / 70)
    found = []
    for i in range(0, len(audio) - win, hop):
        frame = audio[i:i + win] * np.hanning(win)
        if np.sqrt(np.mean(frame ** 2)) < 0.01:
            continue
        ac = np.correlate(frame, frame, "full")[win - 1:]
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.45 * ac[0]:
            found.append(sr / k)
    return float(np.median(found)) if found else None


# Every take of a line differs in pitch, and a listener picked, line after
# line, the one nearest the voice's own register that did not drag. A take is
# scored by semitones from `target` (the takes' middle pitch without one) and
# 2 points a character a second under 3.5; the lowest score wins.
def pick(takes, target):
    pitched = sorted(t["hz"] for t in takes if t["hz"])
    target = target or (pitched[len(pitched) // 2] if pitched else None)
    def score(t):
        off = abs(12 * math.log2(t["hz"] / target)) if t["hz"] and target else 0
        return off + (2 * max(0, 3.5 - t["rate"]) if t.get("rate") is not None else 0)
    return min(range(len(takes)), key=lambda i: score(takes[i]))


def _generate(engine, model, text, speaker, style, language, attempt):
    if engine == "ming":
        # A built-in voice takes no style; it speaks the same each time at
        # temperature 0, so a retry samples instead.
        return model.generate(text=text, voice=speaker, lang_code="zh" if language == "Chinese" else "en", temperature=0 if attempt == 1 else 0.6)
    return model.generate_custom_voice(text=text, speaker=speaker, language=language, instruct=style)


def speak(text, speaker, language, wav, style=None, takes=1, target_hz=None, engine="qwen", attempt=1):
    import numpy as np
    if engine not in _tts:
        from mlx_audio.tts.utils import load_model
        _tts[engine] = load_model(TTS_MODELS[engine])
    model = _tts[engine]
    sr = model.sample_rate
    # Characters (and English words) a second, for a Chinese line.
    units = len(re.findall(r"[\u4e00-\u9fff]|[A-Za-z0-9.]+", text)) if language == "Chinese" else None
    tried = []
    for _ in range(takes):
        parts = _generate(engine, model, text, speaker, style, language, attempt)
        audio = np.concatenate([np.asarray(p.audio).reshape(-1) for p in parts]).astype(np.float32)
        tried.append({"audio": audio, "hz": pitch(audio, sr), "rate": units / (len(audio) / sr) if units else None})
    picked = pick(tried, target_hz)
    best = tried[picked]
    with wave.open(wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(best["audio"], -1, 1) * 32767).astype("<i2").tobytes())
    return {"picked": picked, "takes": [{k: t[k] for k in ("hz", "rate")} for t in tried]}


def words(wav, language):
    import mlx_whisper
    r = mlx_whisper.transcribe(wav, path_or_hf_repo=ASR_MODEL, language=language, word_timestamps=True, temperature=0, verbose=None, initial_prompt=PROMPTS.get(language))
    return {"words": [{"word": w["word"], "start": w["start"], "end": w["end"]} for s in r["segments"] for w in s.get("words", [])]}


if __name__ == "__main__":
    out = sys.stdout
    sys.stdout = sys.stderr
    for line in sys.stdin:
        req = json.loads(line)
        try:
            op = req.pop("op")
            res = {"ok": True, **(speak if op == "speak" else words)(**req)}
        except Exception as e:
            res = {"ok": False, "error": f"{type(e).__name__}: {e}"}
        out.write(json.dumps(res, ensure_ascii=False) + "\n")
        out.flush()
