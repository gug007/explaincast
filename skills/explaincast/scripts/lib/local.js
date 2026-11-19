// The local voice: Kokoro speaks a line and Whisper times its words, both on
// this Mac through ONNX Runtime, so there is no key and nothing is sent
// anywhere. The runtime (an npm package) and the models are fetched once into
// the user's cache, so the skill carries no node_modules of its own.
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { CACHE } = require("./helpers");

const HOME = path.join(CACHE, "voice");
const MODELS = path.join(HOME, "models");
const RUNTIME = { name: "kokoro-js", version: "1.2.1" };
const SPEECH = { repo: "onnx-community/Kokoro-82M-v1.0-ONNX", dtype: "fp32", files: ["onnx/model.onnx"] };
const WORDS = { repo: "onnx-community/whisper-small.en_timestamped", dtype: "q8", files: ["onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"] };
const DOWNLOAD = "about 600 MB";
const RATE = 24000;
const WORDS_RATE = 16000;

// Kokoro reads about 510 phonemes at a time and drops the rest without a
// word, and sounds best well under that. A phoneme is about a character.
const CHUNK_CHARS = 250;
const QUIET = 0.004;
const EDGE_S = 0.03;
const BETWEEN_S = 0.4;
const TAIL_S = 0.3;

function installed() {
  try {
    return JSON.parse(fs.readFileSync(path.join(HOME, "node_modules", RUNTIME.name, "package.json"), "utf8")).version === RUNTIME.version;
  } catch {
    return false;
  }
}

function install() {
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(path.join(HOME, "package.json"), JSON.stringify({ private: true, dependencies: { [RUNTIME.name]: RUNTIME.version } }));
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: HOME, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`could not install ${RUNTIME.name} ${RUNTIME.version} into ${HOME} (npm): ${(r.stderr || r.error?.message || "").trim().slice(-400)}`);
}

const hasModels = () => [SPEECH, WORDS].every((m) => m.files.every((f) => fs.existsSync(path.join(MODELS, m.repo, f))));

function runtime() {
  if (!installed()) throw new Error("the local voice is not installed; take.sh installs it");
  const from = (name) => require(require.resolve(name, { paths: [HOME] }));
  const transformers = from("@huggingface/transformers");
  transformers.env.cacheDir = MODELS;
  transformers.env.allowRemoteModels = !hasModels();
  return { transformers, ...from(RUNTIME.name) };
}

let speech = null;
let words = null;
const loadSpeech = () => (speech ??= runtime().KokoroTTS.from_pretrained(SPEECH.repo, { dtype: SPEECH.dtype, device: "cpu" }));
const loadWords = () => (words ??= runtime().transformers.pipeline("automatic-speech-recognition", WORDS.repo, { dtype: WORDS.dtype, device: "cpu" }));

// The models hold about a gigabyte of memory, which a take has better use for.
async function release() {
  const [s, w] = [speech, words];
  speech = words = null;
  await (await s?.catch(() => null))?.model?.dispose?.();
  await (await w?.catch(() => null))?.dispose?.();
}

// Installs the runtime and downloads the models where they are missing.
// Returns what it did.
async function setup(log = () => {}) {
  const did = [];
  if (!installed()) {
    log(`installing the local voice (${RUNTIME.name} ${RUNTIME.version})`);
    install();
    did.push("installed the local voice");
  }
  if (!hasModels()) {
    log(`downloading the local voice's models, once (${DOWNLOAD})`);
    try {
      await loadSpeech();
      await loadWords();
    } catch (e) {
      throw new Error(`could not download its models (${e.message}); check the connection and run again`);
    } finally {
      await release();
    }
    did.push("downloaded the local voice's models");
  }
  return did;
}

// The text in pieces Kokoro can read whole: its sentences, as many to a piece
// as fit.
function chunks(text, max = CHUNK_CHARS) {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  const out = [];
  for (const s of sentences) {
    if (out.length && out.at(-1).length + s.length <= max) out[out.length - 1] += s;
    else out.push(s);
  }
  return out.map((c) => c.trim()).filter(Boolean);
}

// Kokoro pads a clip with a third of a second of silence either side; the
// sound alone, with a breath of room.
function trim(samples, rate = RATE) {
  let a = 0;
  while (a < samples.length && Math.abs(samples[a]) < QUIET) a++;
  let b = samples.length;
  while (b > a && Math.abs(samples[b - 1]) < QUIET) b--;
  const edge = Math.round(EDGE_S * rate);
  return samples.subarray(Math.max(0, a - edge), Math.min(samples.length, b + edge));
}

function join(parts, rate = RATE) {
  const between = Math.round(BETWEEN_S * rate);
  const tail = Math.round(TAIL_S * rate);
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0) + between * (parts.length - 1) + tail);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length + between;
  }
  return out;
}

function wav(samples, rate = RATE) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + samples.length * 2, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return out;
}

async function speak(text, { voice }) {
  const tts = await loadSpeech();
  const parts = [];
  for (const chunk of chunks(text)) parts.push(trim((await tts.generate(chunk, { voice })).audio));
  return wav(join(parts));
}

async function transcribe(file) {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(WORDS_RATE), "-"], { maxBuffer: 1 << 28 });
  const samples = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
  const heard = await (await loadWords())(samples, { return_timestamps: "word", chunk_length_s: 30 });
  return (heard.chunks || []).map((c) => ({ word: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] }));
}

const NOT_LATIN = /[^\P{L}\p{Script=Latin}]/u;
const cannotSay = (text) => (NOT_LATIN.test(text) ? 'the local voice speaks English only; for another language set "voice": "openai" in video.json, which needs an OpenAI API key' : null);

module.exports = {
  name: "local",
  model: "kokoro-82m",
  voice: "af_heart",
  jobs: 1,
  styled: false,
  // The same text always comes out as the same clip, so saying it again
  // changes nothing.
  respeaks: false,
  // Kokoro names a voice by accent and sex: af_heart, am_michael, bf_emma.
  hasVoice: (name) => /^[a-z][fm]_[a-z]+$/.test(name),
  speak,
  transcribe,
  cannotSay,
  setup,
  release,
  chunks,
  trim,
  join,
  wav,
};
