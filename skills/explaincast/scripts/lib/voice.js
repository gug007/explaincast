// Narration clips: one speech clip per line (OpenAI, or a local voice in
// local.js with "tts": "ming" or "qwen"), cached by model, voice, style and text, with Whisper word onsets so a beat can land an action on a
// spoken word (and a caption can light the word up).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { HAN, norm, alignWords } = require("./words");
const { localProvider } = require("./local");

const MODEL = "gpt-4o-mini-tts";
const SILENT_MS = 3000;
// Under this many characters a second (or about 2 s per 12 characters) a
// Chinese clip drags, with long pauses mid-sentence; it is spoken again.
const MIN_ZH_RATE = 3;
const KEYCHAIN_SERVICE = "explaincast";
const KEY_STEPS = [
  "1. Create a key at https://platform.openai.com/api-keys (the account needs billing set up)",
  "2. In Terminal, run this and paste the key when it asks (twice; nothing shows as you paste):",
  `     security add-generic-password -s ${KEYCHAIN_SERVICE} -a openai -U -w`,
  "   Or set OPENAI_API_KEY instead. Never paste the key into your coding agent's chat.",
  "   Step by step: https://github.com/gug007/explaincast#set-up-your-openai-key",
].map((l) => `      ${l}`).join("\n");

function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    return execFileSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", "openai", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // no key under this name
  }
  throw new Error(`no OpenAI API key found:\n${KEY_STEPS}`);
}

function durationMs(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Math.round(parseFloat(out) * 1000);
}

// A dropped connection or a 5xx is retried; anything else is a real error.
async function post(url, init, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status < 500 || attempt === 3) return res;
      console.log(`${label}: ${res.status}, trying again (${attempt}/3)`);
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`${label}: ${e.cause?.code || e.message}, trying again (${attempt}/3)`);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

// A provider speaks a line to a WAV buffer and times the words of a clip as
// [{ word, start, end }] in seconds.
function openaiProvider({ model = MODEL } = {}) {
  return {
    model,
    defaultVoice: "marin",
    async speak({ text, voice, style, label }) {
      const res = await post("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          voice,
          input: text,
          instructions: style,
          response_format: "wav",
        }),
      }, label);
      if (!res.ok) throw new Error(`${label}: ${res.status} ${await res.text()}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async words(wav, label) {
      const form = new FormData();
      form.append("model", "whisper-1");
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      form.append("file", new Blob([fs.readFileSync(wav)], { type: "audio/wav" }), path.basename(wav));
      const res = await post("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey()}` },
        body: form,
      }, label);
      if (!res.ok) throw new Error(`${label}: ${res.status} ${await res.text()}`);
      return ((await res.json()).words || []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
    },
  };
}

const PROVIDERS = {
  openai: openaiProvider,
  ming: (o) => localProvider({ ...o, engine: "ming" }),
  qwen: (o) => localProvider({ ...o, engine: "qwen" }),
};

// video.json "pronounce" swaps a word for how the voice should say it (the
// captions keep the written one); `*word*` marks a highlight, never read aloud.
// A word is matched whole where it starts or ends in a letter or digit, so a
// Chinese one is found inside its sentence.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const edge = (c) => (/\w/.test(c) ? "\\b" : "");
function speaker(pronounce = {}) {
  const rules = Object.entries(pronounce).map(([word, say]) => [new RegExp(`${edge(word[0])}${escapeRe(word)}${edge(word.at(-1))}`, "g"), say]);
  return (text) => rules.reduce((t, [re, say]) => t.replace(re, say), text.replace(/\*/g, ""));
}

// `tempo` speeds a clip up after it is spoken (pitch kept), before its words
// are timed, so the onsets match what plays.
function makeVoice({ audioDir, voice, style, respeak = false, tempo = 1, pronounce, tts: engine = "openai", lang = "en", provider }) {
  provider ||= PROVIDERS[engine]({ lang });
  const { model } = provider;
  voice ||= provider.defaultVoice;
  const spoken = speaker(pronounce);
  // The TTS model sometimes swallows a short closing sentence; a clip has to
  // carry every word (in particular the last ones) or it is spoken again.
  function missingWords(line, words) {
    const { all, times } = alignWords(spoken(line.text), words);
    const missed = all.filter((_, i) => times[i] == null);
    const tailLost = times.slice(-2).some((t) => t == null);
    return missed.length > all.length * 0.15 || tailLost ? missed : [];
  }
  fs.mkdirSync(audioDir, { recursive: true });
  const head = tempo === 1 ? `${model}/${voice}` : `${model}/${voice}@${tempo}`;

  // A clip already spoken for this text stays as it is even after the default
  // style changes: a re-spoken line has a different length and would desync
  // the recorded take. `respeak` re-speaks every line (and needs a new take).
  function keepsSpokenClip(stampText, key) {
    if (stampText === key || respeak) return stampText === key;
    const [had, , ...hadText] = stampText.split("\n");
    const [want, , ...wantText] = key.split("\n");
    return had === want && hadText.join("\n") === wantText.join("\n");
  }

  // `cachedOnly` (a re-cut) never calls the API: a line whose clip no longer
  // matches its text stops the run, since the new clip changes the timing.
  async function tts(line, { attempt = 1, cachedOnly = false } = {}) {
    const fresh = attempt > 1;
    const wav = path.join(audioDir, `${line.id}.wav`);
    const stamp = path.join(audioDir, `${line.id}.txt`);
    const key = `${head}\n${style}\n${spoken(line.text)}`;
    if (!fresh && fs.existsSync(wav) && fs.existsSync(stamp)) {
      const had = fs.readFileSync(stamp, "utf8");
      if (had === key) return { wav, cached: true };
      if (keepsSpokenClip(had, key)) {
        console.log(`audio ${line.id}: keeping the clip spoken with the previous style (--respeak to re-speak)`);
        return { wav, cached: true };
      }
    }
    if (cachedOnly) {
      throw new Error(`audio ${line.id}: the line has no clip for its current text; a re-cut never speaks (add --speak to speak it and check it still fits the take, or put the old text back)`);
    }
    fs.rmSync(path.join(audioDir, `${line.id}.words.json`), { force: true });
    const clip = await provider.speak({ text: spoken(line.text), voice, style, label: `tts ${line.id}`, attempt });
    if (tempo === 1) {
      fs.writeFileSync(wav, clip);
    } else {
      const rawWav = path.join(audioDir, `${line.id}.raw.wav`);
      fs.writeFileSync(rawWav, clip);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", rawWav, "-filter:a", `atempo=${tempo}`, wav]);
      fs.rmSync(rawWav, { force: true });
    }
    fs.writeFileSync(stamp, key);
    return { wav, cached: false };
  }

  async function words(line, wav) {
    const file = path.join(audioDir, `${line.id}.words.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    const out = await provider.words(wav, `words ${line.id}`);
    fs.writeFileSync(file, JSON.stringify(out));
    return out;
  }

  // Characters (and English words) a second, for a Chinese line; else null.
  function zhRate(line, wav) {
    const text = spoken(line.text);
    return lang === "zh" && HAN.test(text) ? norm(text, true).length / (durationMs(wav) / 1000) : null;
  }

  // A clip that already carries the take's timing is never replaced because
  // the word check disagrees with it; only a fresh clip is spoken again. A
  // slow one is kept after the last try.
  async function speak(line, cachedOnly) {
    const heard = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { wav, cached } = await tts(line, { attempt, cachedOnly });
      const w = await words(line, wav);
      const missed = missingWords(line, w);
      const rate = cached ? null : zhRate(line, wav);
      const drags = rate != null && rate < MIN_ZH_RATE && attempt < 3;
      if (!missed.length && !drags) return { wav, words: w, cached };
      if (!missed.length) {
        console.log(`audio ${line.id}: clip drags (${rate.toFixed(1)} characters/s), speaking again (${attempt}/3)`);
        continue;
      }
      if (cached) {
        console.log(`audio ${line.id}: the transcript misses "${missed.join(" ")}"; keeping the clip the take was recorded with`);
        return { wav, words: w, cached };
      }
      heard.push(w.map((x) => x.word).join(" "));
      console.log(`audio ${line.id}: clip missed "${missed.join(" ")}", speaking again (${attempt}/3)`);
    }
    throw new Error(`audio ${line.id}: the voice keeps dropping words; rephrase the line.\n  text:  ${spoken(line.text)}\n${heard.map((h, i) => `  try ${i + 1}: ${h}`).join("\n")}`);
  }

  // A dry run uses the real length of a line that has been spoken as it stands.
  function hasClip(line) {
    const stamp = path.join(audioDir, `${line.id}.txt`);
    return fs.existsSync(stamp) && fs.existsSync(path.join(audioDir, `${line.id}.words.json`)) && fs.readFileSync(stamp, "utf8") === `${head}\n${style}\n${spoken(line.text)}`;
  }

  // Every narration line as it will play: a spoken clip with its length and
  // word onsets, or a silent pause. `dry` never calls the API;
  // `cachedOnly` uses the clips on disk and fails where one is missing.
  async function prepare(narration, { dry = false, cachedOnly = false } = {}) {
    const lines = [];
    for (const line of narration) {
      if (!line.text) {
        lines.push({ ...line, ms: line.ms ?? SILENT_MS, silent: true });
        continue;
      }
      if (dry && !hasClip(line)) {
        // About 370 ms an English word, 230 ms a Chinese character.
        const zh = HAN.test(line.text);
        const count = zh ? norm(line.text, true).length : line.text.split(/\s+/).length;
        lines.push({ ...line, ms: Math.round((count * (zh ? 230 : 370)) / tempo) + 500 });
        continue;
      }
      const { wav, words: w, cached } = await speak(line, cachedOnly || dry);
      lines.push({ ...line, wav, ms: durationMs(wav), words: w });
      console.log(`audio ${line.id}: ${(lines.at(-1).ms / 1000).toFixed(2)}s${cached ? " (already spoken)" : ""}`);
    }
    return lines;
  }

  return { prepare, name: voice };
}

module.exports = { makeVoice, speaker, KEY_STEPS, PROVIDERS };
