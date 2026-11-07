// The thumbnail's moment when video.json has no "cover": the opening card's
// words beside the window at the take's best still. Every spoken line's end,
// once its beat has settled, and every push-in at full size is a candidate.
// Each is scored on how much the screen holds (detail and colour) and on how
// long that same screen stays up: a menu, a modal or a half-drawn page passes
// in a second or two, while the product's main views last. A still that is
// moving, nearly blank, or shows anything the screen check flags is passed
// over.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { identity, readText, screenHits } = require("./qa");

// Before the next line's beat moves anything.
const SETTLE_MS = 150;
const ZOOM_SETTLED_MS = 250;
const SAME_MS = 300;
// Stills are measured at this size, and the take sampled at the smaller one
// (`fps` a second) to see how long each screen stays up.
const STILL = { w: 320, h: 180 };
const SAMPLE = { w: 160, h: 90, fps: 2 };
const MOTION_LOOK_MS = 400;
// Mean change in brightness (0-255): over the last 0.4 s, above which a still
// is mid-move (a scroll, a fade, a menu opening); and between two samples,
// under which they are the same screen (the pointer or a new log line aside).
const MOTION_MAX = 1;
const SAME_SCREEN = 1.5;
// A screen up this long counts as one of the product's main views.
const LASTS_FULL_S = 4;
// Less detail than this share of the best still is a blank or loading screen.
const BLANK = 0.5;
const WEIGHTS = { detail: 1, color: 0.6, lasts: 1 };
// Stills read for names and errors, best first, before giving up.
const READ_AT_MOST = 6;

// Pure: the candidate moments in take time, in order, `{ ms, line, why }`.
// `zooms` are the take's, with video.json "zooms" edits applied.
function coverMoments(timeline, narration = [], zooms = []) {
  const spoken = new Set(narration.filter((n) => n.text).map((n) => n.id));
  const lines = timeline.lines || [];
  const lineAt = (ms) => lines.findLast((l) => l.startMs <= ms);
  const all = [];
  lines.forEach((l, i) => {
    if (!spoken.has(l.id)) return;
    const next = lines[i + 1];
    const ms = (next ? next.startMs : timeline.totalMs) - SETTLE_MS;
    if (ms > l.startMs) all.push({ ms, line: l.id, why: "line end" });
  });
  for (const z of zooms) {
    if (!(z.scale > 1)) continue;
    const ms = z.startMs + z.ms + ZOOM_SETTLED_MS;
    const l = lineAt(ms);
    if (l && spoken.has(l.id) && ms < timeline.totalMs - SETTLE_MS) all.push({ ms, line: l.id, why: `zoom ${z.id}` });
  }
  all.sort((a, b) => a.ms - b.ms);
  const kept = [];
  for (const m of all) if (!kept.length || m.ms - kept.at(-1).ms >= SAME_MS) kept.push(m);
  return kept;
}

const meanDiff = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

// Pure: how many seconds the screen `ref` stays up around sample `i0`.
function lastsS(samples, i0, ref, { fps = SAMPLE.fps, same = SAME_SCREEN } = {}) {
  if (!samples.length) return 0;
  const at = Math.max(0, Math.min(samples.length - 1, i0));
  let a = at;
  let b = at;
  while (a > 0 && meanDiff(samples[a - 1], ref) < same) a--;
  while (b + 1 < samples.length && meanDiff(samples[b + 1], ref) < same) b++;
  return (b - a + 1) / fps;
}

// Pure: the measured moments, best first. Each gets a `score`, and a `skip`
// reason when it can't be the thumbnail; skipped ones sort last.
function rankMoments(measured) {
  const top = (k) => Math.max(0, ...measured.map((m) => m[k]));
  const best = { detail: top("detail"), color: top("color") };
  const share = (v, max) => (max > 0 ? v / max : 0);
  return measured
    .map((m) => {
      const skip = m.motion > MOTION_MAX ? "still moving" : share(m.detail, best.detail) < BLANK ? "nearly blank" : null;
      const score = WEIGHTS.detail * share(m.detail, best.detail) + WEIGHTS.color * share(m.color, best.color) + WEIGHTS.lasts * Math.min(1, m.lastsS / LASTS_FULL_S);
      return { ...m, score: +score.toFixed(3), ...(skip && { skip }) };
    })
    .sort((a, b) => Number(!!a.skip) - Number(!!b.skip) || b.score - a.score || a.ms - b.ms);
}

// Pure: the "cover" that draws `moment`, as video.json would write it.
function coverAt(moment, words, timeline) {
  const line = timeline.lines.find((l) => l.id === moment.line);
  return { words, line: moment.line, at: Math.round(moment.ms - line.startMs) / 1000, style: "window" };
}

const luma = (rgb, n) => {
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = 0.299 * rgb[3 * i] + 0.587 * rgb[3 * i + 1] + 0.114 * rgb[3 * i + 2];
  return y;
};

// Mean brightness step to the next pixel across and down: text, icons and
// photos score high, an empty panel low.
function detailOf(y, w, h) {
  let g = 0;
  for (let r = 0; r < h - 1; r++) {
    for (let c = 0; c < w - 1; c++) {
      const i = r * w + c;
      g += Math.abs(y[i + 1] - y[i]) + Math.abs(y[i + w] - y[i]);
    }
  }
  return g / ((w - 1) * (h - 1));
}

// Hasler and Süsstrunk's colourfulness.
function colorOf(rgb, n) {
  let mrg = 0;
  let myb = 0;
  for (let i = 0; i < n; i++) {
    mrg += rgb[3 * i] - rgb[3 * i + 1];
    myb += 0.5 * (rgb[3 * i] + rgb[3 * i + 1]) - rgb[3 * i + 2];
  }
  mrg /= n;
  myb /= n;
  let vrg = 0;
  let vyb = 0;
  for (let i = 0; i < n; i++) {
    vrg += (rgb[3 * i] - rgb[3 * i + 1] - mrg) ** 2;
    vyb += (0.5 * (rgb[3 * i] + rgb[3 * i + 1]) - rgb[3 * i + 2] - myb) ** 2;
  }
  return Math.sqrt(vrg / n + vyb / n) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);
}

// A 2x2 box average, so a still compares with the take's samples.
function halve(y, w, h) {
  const out = new Float32Array((w / 2) * (h / 2));
  for (let r = 0; r < h / 2; r++) {
    for (let c = 0; c < w / 2; c++) {
      const i = 2 * r * w + 2 * c;
      out[r * (w / 2) + c] = (y[i] + y[i + 1] + y[i + w] + y[i + w + 1]) / 4;
    }
  }
  return out;
}

function rawFrames(argv, size, channels) {
  const r = spawnSync("ffmpeg", ["-v", "error", ...argv, "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not read the take: ${String(r.stderr || "").slice(-300)}`);
  const bytes = size.w * size.h * channels;
  const frames = [];
  for (let at = 0; at + bytes <= r.stdout.length; at += bytes) frames.push(r.stdout.subarray(at, at + bytes));
  return frames;
}

// The take in brightness, `SAMPLE.fps` frames a second.
function sampleTake(raw, captureIn) {
  const { w, h, fps } = SAMPLE;
  return rawFrames(["-i", raw, "-vf", `fps=${fps},scale=${w}:${h}:${captureIn}:flags=area,format=gray`], SAMPLE, 1);
}

// One moment's still, and the frames 0.2 and 0.4 s before it.
function measure(raw, ms, captureIn, samples) {
  const { w, h } = STILL;
  const n = w * h;
  const from = Math.max(0, ms - MOTION_LOOK_MS);
  const count = Math.round(((ms - from) / 1000) * 30) + 1;
  const frames = rawFrames(["-ss", (from / 1000).toFixed(3), "-i", raw, "-frames:v", String(count), "-vf", `scale=${w}:${h}:${captureIn}:flags=area,format=rgb24`], STILL, 3);
  if (!frames.length) return null;
  const still = frames.at(-1);
  const y = luma(still, n);
  const earlier = [frames[0], frames[Math.floor(frames.length / 2)]].filter((f) => f !== still).map((f) => luma(f, n));
  return {
    detail: +detailOf(y, w, h).toFixed(2),
    color: +colorOf(still, n).toFixed(1),
    motion: +Math.max(0, ...earlier.map((e) => meanDiff(y, e))).toFixed(2),
    lastsS: lastsS(samples, Math.round((ms / 1000) * SAMPLE.fps), halve(y, w, h)),
  };
}

// The first ranked still the screen check has nothing against. A still that
// can't be read is taken as it is, since the take's own screen check then
// fails the video anyway.
function firstClean(ranked, raw, captureIn, hide, log) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-cover-"));
  try {
    const terms = identity();
    let tried = 0;
    for (const m of ranked) {
      if (m.skip) continue;
      if (tried++ === READ_AT_MOST) return null;
      const jpg = path.join(tmp, `${m.ms}.jpg`);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", (m.ms / 1000).toFixed(3), "-i", raw, "-frames:v", "1", "-vf", `scale=${captureIn}`, "-q:v", "2", jpg]);
      let text;
      try {
        text = readText([jpg]).get(jpg) || "";
      } catch (e) {
        log(`thumbnail: could not read the still for names and errors (${e.message})`);
        return m;
      }
      const hits = screenHits(text, terms, hide);
      if (!hits.length) return m;
      m.skip = hits[0].message;
    }
    return null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// `timeline` is the take's, `zooms` its zooms with video.json edits applied,
// `words` the cover's words. Returns null when no still will do.
function chooseCover({ raw, timeline, video, words, zooms = [], captureIn, log = console.log }) {
  const moments = coverMoments(timeline, video.narration, zooms);
  if (!moments.length) return null;
  const samples = sampleTake(raw, captureIn);
  const measured = moments.flatMap((m) => {
    const s = measure(raw, m.ms, captureIn, samples);
    return s ? [{ ...m, ...s }] : [];
  });
  const ranked = rankMoments(measured);
  const pick = firstClean(ranked, raw, captureIn, video.hide, log);
  if (!pick) return { cover: null, ranked };
  return { cover: coverAt(pick, words, timeline), pick, ranked };
}

module.exports = { chooseCover, coverMoments, lastsS, rankMoments, coverAt, LASTS_FULL_S, MOTION_MAX, BLANK };
