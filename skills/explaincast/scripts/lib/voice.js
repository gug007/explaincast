// Narration clips: one clip per line from the video's narrator (the local
// voice, or OpenAI's), cached by model, voice, style and text, with word
// onsets so a beat can land an action on a spoken word (and a caption can
// light the word up).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { alignWords } = require("./words");
const local = require("./local");
const openai = require("./openai");

const ENGINES = { local, openai, cloud: openai };
const SILENT_MS = 3000;

// video.json "voice": an engine ("local", "openai"), one of its voices
// ("af_heart", "marin"), or both ("openai/cedar").
function parseVoice(setting) {
  const [first, name, ...rest] = String(setting).trim().split("/");
  const engine = Object.hasOwn(ENGINES, first) ? ENGINES[first] : null;
  if (engine && !rest.length) return { engine, voice: name || engine.voice };
  if (name != null) throw new Error(`"voice" is "local", "openai", a voice's name, or both as in "openai/cedar" (got "${setting}")`);
  return { engine: local.hasVoice(first) ? local : openai, voice: first };
}

// Who spoke the clips already in `audioDir`, from their stamps.
function spokenBy(audioDir) {
  let stamps;
  try {
    stamps = fs.readdirSync(audioDir).filter((f) => f.endsWith(".txt"));
  } catch {
    return null;
  }
  for (const f of stamps) {
    const [model, voice] = fs.readFileSync(path.join(audioDir, f), "utf8").split("\n")[0].split("@")[0].split("/");
    const engine = [local, openai].find((e) => e.model === model);
    if (engine && voice) return { engine, voice };
  }
  return null;
}

// The video's narrator: the one video.json names; else the one its clips were
// spoken by, since a second narrator would re-speak every line and a re-cut
// can't; else EXPLAINCAST_VOICE; else the local voice. `respeak` voices every
// line again, so it lets go of the clips' narrator.
function narratorOf({ voice, audioDir, respeak = false, env = process.env } = {}) {
  if (voice) return parseVoice(voice);
  const usual = parseVoice(env.EXPLAINCAST_VOICE || "local");
  const clips = !respeak && audioDir ? spokenBy(audioDir) : null;
  const kept = clips && (clips.engine !== usual.engine || clips.voice !== usual.voice);
  return kept ? { ...clips, kept: true } : usual;
}

function durationMs(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Math.round(parseFloat(out) * 1000);
}

// `fn` over `items`, at most `limit` at a time, in their order. After a
// failure no new item starts and the running ones finish, so a clip already
// paid for still reaches the disk; then the first error is thrown.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  let failed = null;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        failed ??= { e };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (failed) throw failed.e;
  return out;
}

// video.json "pronounce" swaps a word for how the voice should say it (the
// captions keep the written one); `*word*` marks a highlight, never read aloud.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function speaker(pronounce = {}) {
  const rules = Object.entries(pronounce).map(([word, say]) => [new RegExp(`\\b${escapeRe(word)}\\b`, "g"), say]);
  return (text) => rules.reduce((t, [re, say]) => t.replace(re, say), text.replace(/\*/g, ""));
}

// `tempo` speeds a clip up after it is spoken (pitch kept), before its words
// are timed, so the onsets match what plays.
function makeVoice({ audioDir, voice: setting, style: styled, respeak = false, tempo = 1, pronounce, env }) {
  const narrator = narratorOf({ voice: setting, audioDir, respeak, env });
  const { engine, voice } = narrator;
  const style = engine.styled ? styled : "";
  const spoken = speaker(pronounce);
  // A voice can swallow a short closing sentence; a clip has to carry every
  // word (in particular the last ones).
  function missingWords(line, words) {
    const { all, times } = alignWords(spoken(line.text), words);
    const missed = all.filter((_, i) => times[i] == null);
    const tailLost = times.slice(-2).some((t) => t == null);
    return missed.length > all.length * 0.15 || tailLost ? missed : [];
  }
  fs.mkdirSync(audioDir, { recursive: true });
  const head = tempo === 1 ? `${engine.model}/${voice}` : `${engine.model}/${voice}@${tempo}`;

  // A clip already spoken for this text stays as it is even after the default
  // style changes: a re-spoken line has a different length and would desync
  // the recorded take. `respeak` re-speaks every line (and needs a new take).
  function keepsSpokenClip(stampText, key) {
    if (stampText === key || respeak) return stampText === key;
    const [had, , ...hadText] = stampText.split("\n");
    const [want, , ...wantText] = key.split("\n");
    return had === want && hadText.join("\n") === wantText.join("\n");
  }

  // `cachedOnly` (a re-cut) never speaks: a line whose clip no longer
  // matches its text stops the run, since the new clip changes the timing.
  async function tts(line, { fresh = false, cachedOnly = false } = {}) {
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
      throw new Error(`audio ${line.id}: the line has no clip for its current text; a re-cut never speaks. Run --speak-only to voice it, then --mux-only again, which checks the new clip still fits the take; or put the old text back`);
    }
    fs.rmSync(path.join(audioDir, `${line.id}.words.json`), { force: true });
    const clip = await engine.speak(spoken(line.text), { voice, style, label: `tts ${line.id}` });
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
    const out = await engine.transcribe(wav, { label: `words ${line.id}` });
    fs.writeFileSync(file, JSON.stringify(out));
    return out;
  }

  // A clip that already carries the take's timing is never replaced because
  // the word check disagrees with it; only a fresh clip is spoken again, by a
  // voice that may say it differently the next time.
  async function speak(line, cachedOnly) {
    const heard = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { wav, cached } = await tts(line, { fresh: attempt > 1, cachedOnly });
      const w = await words(line, wav);
      const missed = missingWords(line, w);
      if (!missed.length) return { wav, words: w, cached };
      if (cached) {
        console.log(`audio ${line.id}: the transcript misses "${missed.join(" ")}"; keeping the clip the take was recorded with`);
        return { wav, words: w, cached };
      }
      if (!engine.respeaks) {
        console.log(`audio ${line.id}: the transcript misses "${missed.join(" ")}"; the report's voice check shows what was heard`);
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

  // Every narration line as it will play, in order: a spoken clip with its
  // length and word onsets, or a silent pause. Lines are voiced as many at a
  // time as the narrator takes; two lines with one id would share a clip's files, so they stop the
  // run first. `dry` never speaks; `cachedOnly` uses the clips on disk and
  // fails where one is missing.
  async function prepare(narration, { dry = false, cachedOnly = false } = {}) {
    const twice = narration.map((l) => l.id).filter((id, i, ids) => ids.indexOf(id) !== i);
    if (twice.length) throw new Error(`narration id "${twice[0]}" is used twice; every line needs its own`);
    for (const line of narration) {
      const no = line.text && engine.cannotSay?.(spoken(line.text));
      if (no) throw new Error(`line "${line.id}": ${no}`);
    }
    return mapLimit(narration, engine.jobs, async (line) => {
      if (!line.text) return { ...line, ms: line.ms ?? SILENT_MS, silent: true };
      if (dry && !hasClip(line)) {
        const count = line.text.split(/\s+/).length;
        return { ...line, ms: Math.round((count * 370) / tempo) + 500 };
      }
      const { wav, words: w, cached } = await speak(line, cachedOnly || dry);
      const ms = durationMs(wav);
      console.log(`audio ${line.id}: ${(ms / 1000).toFixed(2)}s${cached ? " (already spoken)" : ""}`);
      return { ...line, wav, ms, words: w };
    });
  }

  return { prepare, narrator: { engine: engine.name, voice, kept: !!narrator.kept }, release: async () => engine.release?.() };
}

module.exports = { makeVoice, narratorOf, speaker, mapLimit };
