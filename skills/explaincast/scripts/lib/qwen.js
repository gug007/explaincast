// The local voice ("tts": "qwen"): one qwen_voice.py worker per run, asked a
// line at a time. The worker's Python is EXPLAINCAST_PYTHON, else the venv in
// ~/.explaincast/venv (see SETUP).
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

const MODEL = "qwen3-tts-1.7b-customvoice-4bit";
const LANGUAGES = { en: "English", zh: "Chinese" };
const WORKER = path.join(__dirname, "qwen_voice.py");
const python = () => process.env.EXPLAINCAST_PYTHON || path.join(os.homedir(), ".explaincast/venv/bin/python");
const SETUP = [
  "uv venv ~/.explaincast/venv --python 3.11",
  "uv pip install --python ~/.explaincast/venv/bin/python mlx-audio==0.6.3 mlx-whisper==0.4.3",
  "hf download mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-4bit",
  "hf download mlx-community/whisper-large-v3-mlx",
  "Or point EXPLAINCAST_PYTHON at a Python that has mlx-audio and mlx-whisper.",
].map((l) => `      ${l}`).join("\n");

function qwenProvider({ lang = "en" } = {}) {
  let child, replies;
  const pending = [];
  function worker() {
    if (child) return;
    child = spawn(python(), [WORKER], { stdio: ["pipe", "pipe", "inherit"] });
    child.on("error", (e) => pending.splice(0).forEach((p) => p.reject(new Error(`the local voice could not start (${e.message}):\n${SETUP}`))));
    child.on("exit", (code) => {
      child = null;
      pending.splice(0).forEach((p) => p.reject(new Error(`the local voice stopped (exit ${code})`)));
    });
    replies = readline.createInterface({ input: child.stdout });
    replies.on("line", (l) => {
      const p = pending.shift();
      const r = JSON.parse(l);
      if (r.ok) p.resolve(r);
      else p.reject(new Error(r.error));
    });
  }
  // The worker is unref'd while idle so a finished run can exit.
  function ask(req) {
    worker();
    child.ref();
    child.stdout.ref();
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      child.stdin.write(`${JSON.stringify(req)}\n`);
    }).finally(() => {
      if (child && !pending.length) {
        child.unref();
        child.stdout.unref();
        child.stdin.unref();
      }
    });
  }
  return {
    model: MODEL,
    defaultVoice: "serena",
    async speak({ text, voice, style, label }) {
      const tmp = path.join(os.tmpdir(), `explaincast-${process.pid}-${label.replace(/\W/g, "_")}.wav`);
      try {
        await ask({ op: "speak", text, speaker: voice, style, language: LANGUAGES[lang], wav: tmp });
        return fs.readFileSync(tmp);
      } catch (e) {
        throw new Error(`${label}: ${e.message}`);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    },
    async words(wav, label) {
      try {
        return (await ask({ op: "words", wav, language: lang })).words;
      } catch (e) {
        throw new Error(`${label}: ${e.message}`);
      }
    },
  };
}

module.exports = { qwenProvider, python, SETUP };
