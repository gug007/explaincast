const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Under this an action still reads as landing on its word.
const CUE_LATE_MS = 300;

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function spell(n) {
  if (n < 20) return [ONES[n]];
  if (n < 100) return n % 10 ? [TENS[Math.floor(n / 10)], ONES[n % 10]] : [TENS[n / 10]];
  if (n < 1000) return [ONES[Math.floor(n / 100)], "hundred", ...(n % 100 ? spell(n % 100) : [])];
  return [...spell(Math.floor(n / 1000)), "thousand", ...(n % 1000 ? spell(n % 1000) : [])];
}

const HAN = /\p{Script=Han}/u;
const ZH_DIGITS = "零一二三四五六七八九";
const zhDigits = (d) => [...d].map((c) => ZH_DIGITS[c]).join("");
function zhUnder1e4(n) {
  let s = "";
  let gap = false;
  [...String(n).padStart(4, "0")].forEach((d, i) => {
    if (d === "0") return (gap = s !== "");
    s += (gap ? "零" : "") + ZH_DIGITS[d] + ["千", "百", "十", ""][i];
    gap = false;
  });
  return s;
}
// 30 → 三十, 105 → 一百零五, 12000 → 一万二千; a long or 0-led run is read digit by digit.
function zhInt(d) {
  if (d.length > 8 || (d.length > 1 && d[0] === "0") || d === "0") return zhDigits(d);
  const n = Number(d);
  const hi = Math.floor(n / 1e4);
  const lo = n % 1e4;
  const s = (hi ? `${zhUnder1e4(hi)}万` : "") + (lo ? (hi && lo < 1000 ? "零" : "") + zhUnder1e4(lo) : "");
  return s.replace(/^一十/, "十");
}
const zhNumber = (m, int, frac) => zhInt(int) + (frac ? `点${zhDigits(frac)}` : "");

// Words as the transcript and the script both reduce to them: lowercase, no
// punctuation, and numbers spelled out, so "96%" in one and "ninety-six
// percent" in the other are the same three words. Text with Chinese in it
// (`zh`) is one word per character, its numbers in Chinese (30天 is 三十天)
// and English words kept whole.
const norm = (t, zh = HAN.test(t)) => (zh ? normZh(t) : normEn(t));
const normZh = (t) =>
  t
    .toLowerCase()
    .replace(/(\d+)(?:\.(\d+))?%/g, (m, int, frac) => `百分之${zhNumber(m, int, frac)}`)
    .replace(/(\d+)(?:\.(\d+))?/g, zhNumber)
    .replace(/两/g, "二")
    .replace(/〇/g, "零")
    .replace(/[\u3000-\u303f\uff00-\uffef]/g, " ")
    .replace(/[^a-z0-9\s\p{Script=Han}-]/gu, "")
    .replace(/-/g, " ")
    .match(/\p{Script=Han}|[a-z0-9]+/gu) || [];
const normEn = (t) =>
  t
    .toLowerCase()
    .replace(/%/g, " percent")
    .replace(/(\d)\.(\d)/g, "$1 $2")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (/^\d{1,6}$/.test(w) ? spell(Number(w)) : [w]));

// How the transcript spells names the voice says right (video.json "heard").
let HEARD_AS = {};
const setHeard = (map = {}) => (HEARD_AS = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()])));
const SOUND_ALIKE = [["to", "too", "two"], ["for", "four"]];
// Whisper writes a Chinese character as another that sounds the same (设 as
// 社); two characters match when they share a reading, tones aside. The table
// (pinyin-pro, `npm install` in the skill folder) loads on the first one.
let pinyin;
const readings = new Map();
function readingsOf(c) {
  if (!readings.has(c)) {
    pinyin ||= require("pinyin-pro").pinyin;
    readings.set(c, pinyin(c, { toneType: "none", multiple: true, type: "array" }));
  }
  return readings.get(c);
}
const soundsAlike = (a, b) => HAN.test(a) && HAN.test(b) && readingsOf(a).some((r) => readingsOf(b).includes(r));
const same = (heard, word) =>
  heard === word ||
  soundsAlike(heard, word) ||
  HEARD_AS[heard] === word ||
  SOUND_ALIKE.some((set) => set.includes(heard) && set.includes(word)) ||
  (heard.endsWith("s") && word.endsWith("s") && heard.length > 3 && HEARD_AS[heard.slice(0, -1)] === word.slice(0, -1));

// Start time (ms) of each word of `text` in the clip, or null where the
// transcript has no match for it.
function alignWords(text, words) {
  const zh = HAN.test(text);
  const all = norm(text, zh);
  // In a Chinese line Whisper splits 99.9% as "99." "9" "%" and Settings as
  // "Set" "ting" "s"; each is read whole.
  const heardWords = [];
  for (const w of words || []) {
    const prev = heardWords.at(-1);
    const number = /[\d.]$/.test(prev?.word) && /^[\d.%]/.test(w.word.trim());
    const word = /[a-z]$/i.test(prev?.word) && /^[a-z]/i.test(w.word);
    if (zh && (number || word)) prev.word += w.word.trim();
    else heardWords.push({ word: w.word, start: w.start });
  }
  const spoken = [];
  for (const w of heardWords) for (const n of norm(w.word, zh)) spoken.push({ n, ms: w.start * 1000 });
  const times = new Array(all.length).fill(null);
  // The transcript words each text word took, first and last.
  const from = [];
  const to = [];
  const hit = (i, k, last) => {
    times[i] = spoken[k].ms;
    from[i] = k;
    to[i] = last;
  };
  let j = 0;
  for (let i = 0; i < all.length; i++) {
    for (let k = j; k < Math.min(spoken.length, j + 4); k++) {
      if (same(spoken[k].n, all[i])) {
        hit(i, k, k);
        j = k + 1;
        break;
      }
      if (i + 1 < all.length && spoken[k].n === all[i] + all[i + 1]) {
        hit(i, k, k);
        hit(i + 1, k, k);
        i += 1;
        j = k + 1;
        break;
      }
      if (k + 1 < spoken.length && spoken[k].n + spoken[k + 1].n === all[i]) {
        hit(i, k, k + 1);
        j = k + 2;
        break;
      }
    }
  }
  // What is left of a Chinese word Whisper misheard as a near sound (告警 as
  // 倒景, where 告 and 倒 share no reading): as many unmatched characters on
  // both sides between the same two matched ones are the same words, heard
  // differently.
  for (let i = 0; i < all.length; ) {
    if (times[i] != null) {
      i++;
      continue;
    }
    let e = i;
    while (e < all.length && times[e] == null) e++;
    const p = i > 0 ? to[i - 1] : -1;
    const q = e < all.length ? from[e] : spoken.length;
    const heard = spoken.slice(p + 1, q);
    if (heard.length === e - i && heard.every((x) => HAN.test(x.n)) && all.slice(i, e).every((w) => HAN.test(w))) {
      heard.forEach((x, m) => (times[i + m] = x.ms));
    }
    i = e;
  }
  return { all, times };
}

// An onset for every word of `text`; a word the transcript missed is placed
// between its nearest timed neighbours (or the clip's edges).
function onsets(text, words, lineMs) {
  const { all, times } = alignWords(text, words);
  return times.map((t, i) => {
    if (t != null) return t;
    let lo = i - 1;
    while (lo >= 0 && times[lo] == null) lo--;
    let hi = i + 1;
    while (hi < all.length && times[hi] == null) hi++;
    const loMs = lo >= 0 ? times[lo] : 0;
    const hiMs = hi < all.length ? times[hi] : lineMs;
    return loMs + ((i - lo) / (hi - lo)) * (hiMs - loMs);
  });
}

// Where the words of `want` first occur, in order, inside `all`; -1 if not.
function findPhrase(all, want, from = 0) {
  for (let i = from; i + want.length <= all.length; i++) {
    if (want.every((w, k) => all[i + k] === w)) return i;
  }
  return -1;
}

// The narration clock a stage keeps: which line is playing, when it started,
// and where in it a cue phrase is spoken.
class Timing {
  constructor(opts = {}) {
    this.log = opts.log || (() => {});
  }

  beginLine(line) {
    this.line = line;
    this.lineStart = Date.now();
  }

  // ms after the line starts at which `text` is spoken. Text words are aligned
  // to the clip's transcript; a word the transcript missed is interpolated
  // between its nearest timed neighbours (or the clip's edges).
  cueMs(text) {
    const { all, times } = alignWords(this.line.text, this.line.words);
    const at = findPhrase(all, norm(text, HAN.test(this.line.text)));
    if (at < 0) throw new Error(`cue "${text}" is not in line "${this.line.id}"`);
    if (times[at] == null && this.line.words?.length) this.log(`cue "${text}" interpolated (transcript missed it)`);
    return Math.round(onsets(this.line.text, this.line.words, this.line.ms)[at]);
  }

  // Waits until an action `leadMs` long has to start to finish on the cue. When
  // that moment has passed the action lands late, which only shows in the
  // finished video, so it is reported.
  async holdForCue(text, leadMs) {
    const at = this.cueMs(text) - leadMs;
    const late = Date.now() - (this.lineStart + at);
    if (late > CUE_LATE_MS) {
      const note = `"${text}" lands ${(late / 1000).toFixed(1)} s late: the steps before it ran past the word, so start them sooner or add words before it`;
      if (this.line.words?.length) this.warn("cue", note);
      else this.log(`${note} (estimated timing)`);
    }
    await this.holdUntil(at);
  }

  // Waits for a word, for what a beat does by itself (an idea page's next step).
  at(text) {
    return this.holdForCue(text, 0);
  }

  async hold(ms) {
    await sleep(ms);
  }

  async holdUntil(msFromLineStart) {
    const rest = this.lineStart + msFromLineStart - Date.now();
    if (rest > 0) await sleep(rest);
  }

  // How long a topic card stays up: through the line's narration by default,
  // or until the cue word in `until` is spoken, so the rest of the line plays
  // over the app.
  cardMs(opts = {}) {
    if (opts.ms) return opts.ms;
    const end = opts.until ? this.lineStart + this.cueMs(opts.until) : this.lineStart + this.line.ms + 400;
    return Math.max(opts.until ? 1200 : 2800, end - Date.now());
  }

  // A zoom keyframe for the compositor: the picture eases to `scale` around
  // (cx, cy) in output pixels over `ms`, finishing on the cue word when one is
  // given, and stays there until the next keyframe. Its id (`<line>#<n>`) and
  // the target's rectangle let video.json "zooms" adjust it at mux time.
  async recordZoom(scale, cx, cy, opts = {}, target = {}) {
    const ms = opts.ms ?? 700;
    if (opts.cue) await this.holdForCue(opts.cue, ms);
    this.zooms = this.zooms || [];
    const lineId = this.line?.id || "lead";
    const n = this.zooms.filter((z) => z.id?.startsWith(`${lineId}#`)).length + 1;
    const rect = target.rect && Object.fromEntries(Object.entries(target.rect).map(([k, v]) => [k, Math.round(v)]));
    this.zooms.push({
      id: `${lineId}#${n}`,
      startMs: Date.now() - this.t0,
      ms,
      scale: Math.min(3, Math.max(1, scale)),
      cx: Math.round(cx),
      cy: Math.round(cy),
      ...(target.sel && { sel: target.sel, at: target.at || [0.5, 0.5], rect }),
    });
    this.log(`zoom ${scale === 1 ? "out" : `${scale}x at ${Math.round(cx)},${Math.round(cy)}`} over ${ms}ms`);
  }
}

module.exports = { sleep, HAN, norm, alignWords, onsets, findPhrase, setHeard, Timing };
