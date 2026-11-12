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

// "eight" → "eighth": the last word of a spelled number, as an ordinal.
const ORDINAL_OF = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
const ordinalOf = (w) => ORDINAL_OF[w] || (w.endsWith("y") ? `${w.slice(0, -1)}ieth` : `${w}th`);

// Words as the transcript and the script both reduce to them: lowercase, no
// punctuation or accents, and numbers spelled out, so "96%" in one and
// "ninety-six percent" in the other are the same three words, and "всё" and
// "все" (or "café" and "cafe") are the same word. Every dot between digits
// splits them, so a version reads as its parts ("3.2.7": three two seven), and
// "5th" reads "fifth". A word spelled from digits keeps them (`digits`), and
// the words of one written number share an `id` (prefixed by `group`).
// Each word of the text reduces on its own, so the words of a text are those
// of its words in turn (captions.js counts on that).
const tokens = (t, group = "") =>
  t
    .toLowerCase()
    .replace(/%/g, " percent")
    .replace(/(\d)\.(?=\d)/g, "$1 ")
    .normalize("NFD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w, i) => {
      const id = `${group}${i}`;
      if (/^\d{1,6}$/.test(w)) return spell(Number(w)).map((x) => ({ w: x, digits: w, id }));
      const ordinal = /^(\d{1,6})(?:st|nd|rd|th)$/.exec(w);
      if (ordinal) return spell(Number(ordinal[1])).map((x, k, all) => ({ w: k === all.length - 1 ? ordinalOf(x) : x, digits: ordinal[1], id }));
      if (/^\d+$/.test(w)) return [{ w, digits: w, id }];
      return [{ w }];
    });

const norm = (t) => tokens(t).map((x) => x.w);

// How the transcript spells what the voice says right (video.json "heard"): a
// heard word for a written one ({ "sas": "sass" }), or either side a phrase
// ({ "karucapatogac": "karutsa patoghits dot" }). Both sides reduce as words do.
let HEARD_AS = {};
let HEARD_PHRASES = [];
function setHeard(map = {}) {
  HEARD_AS = {};
  HEARD_PHRASES = [];
  for (const [k, v] of Object.entries(map)) {
    const h = norm(k);
    const w = norm(v);
    if (!h.length || !w.length) continue;
    if (h.length === 1 && w.length === 1) HEARD_AS[h[0]] = w[0];
    else HEARD_PHRASES.push({ h, w });
  }
}

// A "heard" phrase spoken at `k` that stands for the written words at `i`.
const heardPhrase = (spoken, k, all, i) =>
  HEARD_PHRASES.find(({ h, w }) => h.every((x, n) => spoken[k + n]?.n === x) && w.every((x, n) => all[i + n] === x));
const SOUND_ALIKE = [["to", "too", "two"], ["for", "four"]];
const same = (heard, word) =>
  heard === word ||
  HEARD_AS[heard] === word ||
  SOUND_ALIKE.some((set) => set.includes(heard) && set.includes(word)) ||
  (heard.endsWith("s") && word.endsWith("s") && heard.length > 3 && HEARD_AS[heard.slice(0, -1)] === word.slice(0, -1));

// What a number word is worth, cardinal or ordinal ("eighth" is an 8).
const NUMBER_WORDS = new Map();
for (const [i, w] of ONES.entries()) NUMBER_WORDS.set(w, { type: i === 0 ? "zero" : i < 10 ? "unit" : "teen", v: i });
for (const [i, w] of TENS.entries()) if (w) NUMBER_WORDS.set(w, { type: "tens", v: i * 10 });
NUMBER_WORDS.set("hundred", { type: "hundred", v: 100 });
NUMBER_WORDS.set("thousand", { type: "scale", v: 1000 });
NUMBER_WORDS.set("million", { type: "scale", v: 1e6 });
for (const [w, k] of [...NUMBER_WORDS]) if (k.type !== "zero") NUMBER_WORDS.set(ordinalOf(w), { ...k, ord: true });

// Whether a number word carries on the number so far: "twenty" then "six",
// "fifteen" then "hundred", but not "three" then "two" (a version's parts) or
// "twenty" then "twenty" (a year said in pairs).
function joins(cur, k) {
  if (cur.last === "a") return k?.type === "hundred" || k?.type === "scale";
  if (!k || cur.last === "ord" || cur.last === "zero" || k.type === "zero") return false;
  if (k.type === "unit") return ["tens", "hundred", "scale"].includes(cur.last);
  if (k.type === "teen" || k.type === "tens") return ["hundred", "scale"].includes(cur.last);
  if (k.type === "hundred") return cur.group > 0 && cur.group < 100;
  return cur.group > 0;
}

// The numbers in a run of words (tokens()), by the index they start at:
// { end, value, digits }. A number written in digits is one number; one in
// words is read as people say it ("fifteen hundred", "two thousand twenty
// six", "a hundred and five").
function numbersIn(toks) {
  const found = new Map();
  let cur = null;
  const close = (end) => {
    if (cur) found.set(cur.start, { start: cur.start, end, value: cur.total + cur.group, digits: cur.digits || null });
    cur = null;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (cur?.id != null && t.id === cur.id) continue;
    if (t.digits) {
      close(i);
      cur = { start: i, id: t.id, total: Number(t.digits), group: 0, digits: t.digits };
      continue;
    }
    const next = toks[i + 1];
    if (t.w === "a" && next && !next.digits && ["hundred", "scale"].includes(NUMBER_WORDS.get(next.w)?.type) && !NUMBER_WORDS.get(next.w).ord) {
      close(i);
      cur = { start: i, total: 0, group: 0, last: "a" };
      continue;
    }
    if (t.w === "and" && cur && cur.id == null && (cur.last === "hundred" || cur.last === "scale") && next && !next.digits && joins(cur, NUMBER_WORDS.get(next.w))) continue;
    const k = NUMBER_WORDS.get(t.w);
    if (!k) {
      close(i);
      continue;
    }
    if (!cur || cur.id != null || !joins(cur, k)) {
      close(i);
      cur = { start: i, total: 0, group: 0, last: null };
    }
    if (k.type === "hundred") cur.group = (cur.group || 1) * 100;
    else if (k.type === "scale") [cur.total, cur.group] = [cur.total + (cur.group || 1) * k.v, 0];
    else cur.group += k.v;
    cur.last = k.ord ? "ord" : k.type;
    if (cur.last === "ord" || cur.last === "zero") close(i + 1);
  }
  close(toks.length);
  return found;
}

// Where a spoken number starting at `k` and worth `value` ends, or null: the
// same number however it is written ("1500", "fifteen hundred", "1,500"), a
// cardinal for an ordinal ("Eighth," heard as "8"), or thousands the
// transcript split at their commas ("1,500" heard as "1" "500").
function numberEnd(value, nums, k) {
  const s = nums.get(k);
  if (!s) return null;
  if (s.value === value) return s.end;
  let { digits, end } = s;
  for (let next = nums.get(end); digits && next?.digits?.length === 3; next = nums.get(end)) {
    digits += next.digits;
    end = next.end;
    if (Number(digits) === value) return end;
  }
  return null;
}

// The words of a transcript, each with its onset. Whisper keeps the "%" of a
// number such as "75%" as an empty word after it; that word is the "percent".
function spokenWords(words = []) {
  const spoken = [];
  let afterNumber = false;
  for (const [i, w] of words.entries()) {
    const parts = tokens(w.word || "", `${i}:`);
    if (!parts.length && afterNumber && !(w.word || "").trim()) parts.push({ w: "percent" });
    for (const p of parts) spoken.push({ ...p, n: p.w, ms: w.start * 1000, src: i });
    afterNumber = parts.length > 0 && parts.at(-1).digits != null;
  }
  return spoken;
}

// Start time (ms) of each word of `text` in the clip, or null where the
// transcript has no match for it. A number is matched whole, by its value, so
// the way the transcript writes it doesn't matter; every word of it gets a
// time from the spoken number, in step where the two have as many words.
// `heardAt` holds the spoken words [from, to) each matched word took.
function alignWords(text, words) {
  const script = tokens(text);
  const all = script.map((t) => t.w);
  const spoken = spokenWords(words || []);
  const written = numbersIn(script);
  const said = numbersIn(spoken);
  const times = new Array(all.length).fill(null);
  const heardAt = new Array(all.length).fill(null);
  const match = (from, to, k, end, msOf = () => spoken[k].ms) => {
    for (let x = from; x < to; x++) [times[x], heardAt[x]] = [msOf(x), [k, end]];
  };
  let j = 0;
  for (let i = 0; i < all.length; i++) {
    const num = written.get(i);
    for (let k = j; k < Math.min(spoken.length, j + 4); k++) {
      const end = num && numberEnd(num.value, said, k);
      if (end) {
        match(num.start, num.end, k, end, (x) => spoken[Math.min(k + (x - num.start), end - 1)].ms);
        j = end;
        i = num.end - 1;
        break;
      }
      const phrase = heardPhrase(spoken, k, all, i);
      if (phrase) {
        match(i, i + phrase.w.length, k, k + phrase.h.length);
        j = k + phrase.h.length;
        i += phrase.w.length - 1;
        break;
      }
      if (same(spoken[k].n, all[i])) {
        match(i, i + 1, k, k + 1);
        j = k + 1;
        break;
      }
      if (i + 1 < all.length && spoken[k].n === all[i] + all[i + 1]) {
        match(i, i + 2, k, k + 1);
        i += 1;
        j = k + 1;
        break;
      }
      if (k + 1 < spoken.length && spoken[k].n + spoken[k + 1].n === all[i]) {
        match(i, i + 1, k, k + 2);
        j = k + 2;
        break;
      }
    }
  }
  return { all, times, spoken, heardAt };
}

// Up to a few words either side of words [a, b] of `list`, the run itself in
// brackets: "…apartment on [Karutsa-patoghits dot] am…". An empty run (a > b)
// shows as "[ ]" before word a.
const CONTEXT = 3;
function inContext(list, a, b) {
  const lo = Math.max(0, a - CONTEXT);
  const hi = Math.min(list.length, b + 1 + CONTEXT);
  const run = a > b ? " " : list.slice(a, b + 1).join(" ");
  return [lo > 0 ? "…" : "", [...list.slice(lo, a), `[${run}]`, ...list.slice(b + 1, hi)].join(" "), hi < list.length ? "…" : ""].join("");
}

// The written words the transcript has no match for, in runs, each set
// against what was heard between its matched neighbours. Nothing heard there
// means the voice skipped the run ("skipped"). A short run heard as a few
// other words is most likely a name the transcript spells its own way
// ("spelling"), and `heard` is the video.json entry that matches it; anything
// longer may be the voice saying something else ("differs").
function transcriptGaps(text, words = []) {
  const { all, times, spoken, heardAt } = alignWords(text, words);
  const written = text.split(/\s+/).filter(Boolean);
  const wordOf = written.flatMap((w, n) => norm(w).map(() => n));
  const said = words.map((w) => (w.word || "").trim());
  const gaps = [];
  for (let i = 0; i < all.length; i++) {
    if (times[i] != null) continue;
    let end = i;
    while (end + 1 < all.length && times[end + 1] == null) end++;
    const from = i > 0 ? heardAt[i - 1][1] : 0;
    const to = end + 1 < all.length ? heardAt[end + 1][0] : spoken.length;
    const wrote = all.slice(i, end + 1);
    const heard = spoken.slice(from, to).map((s) => s.n);
    const at = from < spoken.length ? spoken[from].src : said.length;
    const [ha, hb] = heard.length ? [spoken[from].src, spoken[to - 1].src] : [at, at - 1];
    const kind = !heard.length ? "skipped" : heard.length <= 3 && wrote.length <= 4 ? "spelling" : "differs";
    gaps.push({
      kind,
      wrote: inContext(written, wordOf[i], wordOf[end]),
      heard: inContext(said, ha, hb),
      ...(kind === "spelling" && { entry: { [heard.join(" ")]: wrote.join(" ") } }),
    });
    i = end;
  }
  return gaps;
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
    const at = findPhrase(all, norm(text));
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
    const zoom = {
      id: `${lineId}#${n}`,
      startMs: Date.now() - this.t0,
      ms,
      scale: Math.min(3, Math.max(1, scale)),
      cx: Math.round(cx),
      cy: Math.round(cy),
      ...(target.sel && { sel: target.sel, at: target.at || [0.5, 0.5], rect }),
    };
    this.zooms.push(zoom);
    this.log(`zoom ${scale === 1 ? "out" : `${scale}x at ${Math.round(cx)},${Math.round(cy)}`} over ${ms}ms`);
    return zoom;
  }
}

module.exports = { sleep, norm, alignWords, transcriptGaps, onsets, findPhrase, setHeard, Timing };
