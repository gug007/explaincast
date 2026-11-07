// The edit after the mux: a stretch longer than the checks' dead-air limit,
// with nothing said between two lines, plays faster under a badge
// (video.json "speedUpWaits": false keeps waits real time). The straight
// render is cut into segments, each encoded once, and joined; the soundtrack
// is mixed again with every clip at its new time.
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { MASTER_OUT, MASTER_TAGS } = require("./compose");

const FPS = 30;
const FRAME_MS = 1000 / FPS;
const WAIT_MIN_MS = 2500;
const WAIT_HEAD_MS = 400;
const WAIT_TAIL_MS = 300;
const WAIT_SHORTEST_MS = 1500;

const snap = (ms) => Math.round(ms / FRAME_MS) * FRAME_MS;
const waitSpeed = (ms) => (ms <= 12000 ? 4 : Math.min(16, Math.ceil(ms / 3000)));
const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

// Pure: the cuts for a take, or null when the render needs none. A cut is
// { kind: "main" | "wait", fromMs, toMs, speed }, in take time, in the order
// they play.
function planEdit({ timeline, video }) {
  if (video.speedUpWaits === false) return null;
  const lines = timeline.lines || [];
  const text = new Map((video.narration || []).map((n) => [n.id, n.text]));
  const waits = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    if (!text.get(a.id)) continue;
    const end = a.startMs + a.ms;
    if (b.startMs - end <= WAIT_MIN_MS) continue;
    const from = snap(end + WAIT_HEAD_MS);
    const to = snap(b.startMs - WAIT_TAIL_MS);
    if (to - from < WAIT_SHORTEST_MS) continue;
    if ((timeline.cards || []).some((c) => overlaps(from, to, c.startMs, c.startMs + c.ms))) continue;
    waits.push({ kind: "wait", fromMs: from, toMs: to, speed: waitSpeed(to - from), after: a.id });
  }
  if (!waits.length) return null;
  const cuts = [];
  let at = 0;
  for (const w of waits) {
    if (w.fromMs > at) cuts.push({ kind: "main", fromMs: at, toMs: w.fromMs, speed: 1 });
    cuts.push(w);
    at = w.toMs;
  }
  if (timeline.totalMs > at) cuts.push({ kind: "main", fromMs: at, toMs: snap(timeline.totalMs), speed: 1 });
  return { cuts };
}

// Pure: `cuts` with their rendered lengths (outMs) laid end to end.
function layout(cuts) {
  let at = 0;
  return cuts.map((c) => {
    const placed = { ...c, outStartMs: at };
    at += c.outMs;
    return placed;
  });
}

// Pure: where take time `ms` lands in the edit, or null when it was cut.
function mapTime(placed, ms) {
  for (const c of placed) {
    if (ms >= c.fromMs && ms < c.toMs) return c.outStartMs + (ms - c.fromMs) / c.speed;
  }
  return null;
}

// Pure: the take's timeline as the edited video plays it.
function editTimeline(timeline, placed) {
  const moved = (items) =>
    items.flatMap((item) => {
      const startMs = mapTime(placed, item.startMs);
      return startMs == null ? [] : [{ ...item, startMs: Math.round(startMs) }];
    });
  const last = placed.at(-1);
  return {
    ...timeline,
    totalMs: Math.round(last.outStartMs + last.outMs),
    lines: moved(timeline.lines),
    cards: moved(timeline.cards || []),
    zooms: [],
    edit: placed.map(({ kind, fromMs, toMs, speed, outStartMs, outMs, after }) => ({ kind, fromMs: Math.round(fromMs), toMs: Math.round(toMs), speed, outStartMs: Math.round(outStartMs), outMs: Math.round(outMs), ...(after ? { after } : {}) })),
  };
}

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr.slice(-2000)}`);
}

function frameCount(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(out.trim());
}

// The "4×" pill, drawn once per speed in the frame cache beside the videos.
async function badge(dir, speed) {
  const file = path.join(dir, `badge-${speed}x.png`);
  if (fs.existsSync(file)) return file;
  const { chromium, CHROME } = require("./browser");
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 260, height: 104 }, deviceScaleFactor: 2 });
    await page.setContent(`<!doctype html><style>
      html, body { margin: 0; background: transparent; }
      .pill { position: absolute; inset: 10px; border-radius: 42px; background: rgba(235, 229, 217, 0.96); box-shadow: 0 6px 22px rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; gap: 14px; font: 700 44px/1 -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif; color: #141414; }
      svg { width: 46px; height: 34px; }
    </style><div class="pill"><svg viewBox="0 0 46 34"><path d="M2 3 L22 17 L2 31 Z M24 3 L44 17 L24 31 Z" fill="#141414"/></svg>${speed}×</div>`);
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: file, omitBackground: true });
  } finally {
    await browser.close();
  }
  return file;
}

// Cuts `src` (the straight render) into `out`. `mix(clips, totalMs)` returns
// the soundtrack's { inputs, filter } ending in [a]; `clips` are the voiced
// lines ({ id, wav }) by id. Returns the edited timeline.
async function renderEdit({ src, out, plan, timeline, clips, mix, badgeDir, workDir, size, log = console.log }) {
  fs.mkdirSync(workDir, { recursive: true });
  const segments = [];
  for (const [i, c] of plan.cuts.entries()) {
    const file = path.join(workDir, `${String(i).padStart(2, "0")}-${c.kind}.mp4`);
    const args = ["-ss", (c.fromMs / 1000).toFixed(6), "-to", (c.toMs / 1000).toFixed(6), "-i", src];
    let graph = `[0:v]setpts=(PTS-STARTPTS)/${c.speed}${c.speed > 1 ? `,fps=${FPS}` : ""}`;
    if (c.speed > 1) {
      args.push("-loop", "1", "-i", await badge(badgeDir, c.speed));
      const x = Math.round(size.width * 0.86);
      const y = Math.round(size.height * 0.84);
      graph += `[sp];[1:v]format=rgba,scale=out_color_matrix=bt709:out_range=tv,format=yuva420p[b];[sp][b]overlay=x=${x}-overlay_w/2:y=${y}-overlay_h/2:shortest=1`;
    }
    graph += `,${MASTER_OUT}[v]`;
    ffmpeg([...args, "-filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", String(FPS), ...MASTER_TAGS, "-video_track_timescale", "15360", file]);
    segments.push({ ...c, file, outMs: (frameCount(file) * 1000) / FPS });
  }
  const placed = layout(segments);
  const edited = editTimeline(timeline, placed);
  const byId = new Map(clips.map((c) => [c.id, c]));
  const voiced = edited.lines.filter((l) => byId.get(l.id)?.wav).map((l) => ({ id: l.id, wav: byId.get(l.id).wav, startMs: l.startMs }));
  const sound = mix(voiced, edited.totalMs);
  const audio = path.join(workDir, "soundtrack.wav");
  ffmpeg([...sound.inputs, "-filter_complex", sound.filter, "-map", "[a]", "-t", (edited.totalMs / 1000).toFixed(3), "-ar", "48000", audio]);
  const list = path.join(workDir, "segments.txt");
  fs.writeFileSync(list, segments.map((s) => `file '${s.file.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", (edited.totalMs / 1000).toFixed(3), "-movflags", "+faststart", "-f", "mp4", out]);
  for (const c of placed) {
    if (c.kind === "wait") log(`edit: the wait after "${c.after}" plays at ${c.speed}x (${((c.toMs - c.fromMs) / 1000).toFixed(1)} s -> ${(c.outMs / 1000).toFixed(1)} s)`);
  }
  return edited;
}

module.exports = { planEdit, layout, mapTime, editTimeline, renderEdit };
