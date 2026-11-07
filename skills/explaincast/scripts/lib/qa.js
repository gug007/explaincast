// Checks a finished take and writes qa/report.json:
// - the screen, read with macOS's text recognition once a second: the user's
//   account name, full name, computer name, email and home path, any email
//   address, video.json "hide" terms, and error text
// - clicks the take had to retry (timeline warnings)
// - dead air: pauses between lines longer than 2.5 s
// - loudness and true peak of the finished MP4
// - the transcript of every line against its script
// - qa/sheet.jpg, a frame of every line, card and push-in, to look over at a glance
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync, spawnSync } = require("child_process");
const { mmss } = require("./chapters");
const { MASTER } = require("./mix");
const { helper } = require("./helpers");
const { STILL_OUT } = require("./compose");
const { mapTime } = require("./edit");
const { alignWords } = require("./words");
const { speaker } = require("./voice");

const DEAD_AIR_MS = 2500;
const CARD_SETTLED_MS = 2500;
const ZOOM_SETTLED_MS = 250;
const ERROR_TEXT = [
  "command not found",
  "permission denied",
  "eaddrinuse",
  "address already in use",
  "something went wrong",
  "panicked at",
  "traceback (most recent call last)",
  "unhandled promise rejection",
  "npm err!",
];

const run = (cmd, argv) => spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 26 });
const out = (cmd, argv) => (run(cmd, argv).stdout || "").trim();

// Who is recording: never written to the repo, only matched against the take.
function identity() {
  const terms = [];
  const add = (text, why, min = 3) => {
    const t = (text || "").trim().toLowerCase();
    if (t.length >= min && !terms.some((x) => x.text === t)) terms.push({ text: t, why });
  };
  add(os.userInfo().username, "account name");
  add(os.homedir(), "home folder path");
  const full = out("id", ["-F"]);
  add(full, "full name");
  for (const part of full.split(/\s+/)) add(part, "full name", 4);
  add(out("scutil", ["--get", "ComputerName"]), "computer name");
  add(out("scutil", ["--get", "LocalHostName"]), "computer name");
  add(out("git", ["config", "--global", "user.email"]), "email");
  return terms.map((t) => ({ ...t, re: new RegExp(`(?<![a-z0-9])${t.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`) }));
}

// The text macOS reads in each image, by its path.
function readText(files) {
  const text = new Map();
  const bin = helper("ocr");
  for (let i = 0; i < files.length; i += 40) {
    const r = run(bin, files.slice(i, i + 40));
    if (r.status !== 0) throw new Error(`text recognition failed (${r.status ?? r.signal}): ${(r.stderr || "").slice(-200)}`);
    for (const line of r.stdout.split("\n")) {
      const [file, ...rest] = line.split("\t");
      if (!file) continue;
      text.set(file, `${text.get(file) || ""}\n${rest.join("\t")}`);
    }
  }
  return text;
}

// What on-screen `text` must not show: the recorder's own details (`terms`,
// from identity()), video.json "hide" terms, email addresses and error text.
// `privacy` is the level a privacy hit gets; error text always fails.
function screenHits(text, terms, hide = [], privacy = "FAIL") {
  const low = text.toLowerCase();
  const hits = [];
  for (const t of terms) if (t.re.test(low)) hits.push({ key: `id:${t.text}`, level: privacy, message: `your ${t.why} ("${t.text}") is on screen` });
  for (const term of hide) if (low.includes(term.toLowerCase())) hits.push({ key: `hide:${term}`, level: privacy, message: `"${term}" (video.json hide) is on screen` });
  // The domain ends in letters: "root@dev-server" read beside "Connecting..."
  // is an ssh target, not an address.
  for (const m of low.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/g) || []) {
    if (!/@example\./.test(m)) hits.push({ key: `mail:${m}`, level: privacy, message: `an email address (${m}) is on screen` });
  }
  for (const e of ERROR_TEXT) if (low.includes(e)) hits.push({ key: `err:${e}`, level: "FAIL", message: `error text on screen: "${e}"` });
  return hits;
}

// Text on screen per second of the take, reading each distinct frame once.
function readScreen(raw) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-qa-"));
  try {
    execFileSync("ffmpeg", ["-v", "error", "-i", raw, "-vf", "fps=1", "-q:v", "3", path.join(tmp, "%05d.jpg")]);
    const frames = fs.readdirSync(tmp).filter((f) => f.endsWith(".jpg")).sort();
    const byHash = new Map();
    for (const f of frames) {
      const h = crypto.createHash("sha1").update(fs.readFileSync(path.join(tmp, f))).digest("hex");
      if (!byHash.has(h)) byHash.set(h, []);
      byHash.get(h).push(f);
    }
    const unique = [...byHash.values()].map((fs2) => path.join(tmp, fs2[0]));
    const text = readText(unique);
    if (unique.length && ![...text.values()].some((t) => t.trim())) throw new Error("text recognition read nothing on any frame");
    const perSecond = [];
    for (const [, group] of byHash) {
      const t = text.get(path.join(tmp, group[0])) || "";
      for (const f of group) perSecond.push({ s: parseInt(f, 10) - 1, text: t });
    }
    return perSecond.sort((a, b) => a.s - b.s);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Seconds where `match` holds, as "m:ss–m:ss" ranges.
function ranges(seconds) {
  const out2 = [];
  for (const s of seconds.sort((a, b) => a - b)) {
    const last = out2.at(-1);
    if (last && s - last[1] <= 2) last[1] = s;
    else out2.push([s, s]);
  }
  return out2.map(([a, b]) => (a === b ? mmss(a * 1000) : `${mmss(a * 1000)}–${mmss(b * 1000)}`)).join(", ");
}

function screenChecks(raw, clock, { hide = [], privacy = "FAIL" }) {
  const checks = [];
  const screen = readScreen(raw);
  const hits = new Map();
  const note = (key, level, message, s) => {
    if (!hits.has(key)) hits.set(key, { level, message, seconds: [] });
    hits.get(key).seconds.push(s);
  };
  const terms = identity();
  for (const { s, text } of screen) {
    for (const h of screenHits(text, terms, hide, privacy)) note(h.key, h.level, h.message, s);
  }
  for (const h of hits.values()) checks.push({ level: h.level, check: "screen", message: `${h.message} at ${ranges(h.seconds)}${clock}` });
  if (!hits.size) checks.push({ level: "OK", check: "screen", message: `read ${screen.length} s of the take: none of your own details, "hide" terms, email addresses or error text (it knows no other names)` });
  return checks;
}

// A pause a card fills, or one the edit plays faster (edit.js), is not dead air.
function deadAir(timeline) {
  const checks = [];
  const busy = [
    ...(timeline.cards || []).map((c) => [c.startMs, c.startMs + c.ms]),
    ...(timeline.edit || []).filter((c) => c.kind === "wait").map((c) => [c.outStartMs, c.outStartMs + c.outMs]),
  ];
  timeline.lines.forEach((t, i) => {
    const next = timeline.lines[i + 1];
    if (!next) return;
    const from = t.startMs + t.ms;
    const gap = next.startMs - from;
    if (gap <= DEAD_AIR_MS || busy.some(([a, b]) => a < next.startMs && from < b)) return;
    checks.push({ level: "WARN", check: "dead air", message: `${(gap / 1000).toFixed(1)} s with nothing said after "${t.id}" at ${mmss(from)}` });
  });
  return checks.length ? checks : [{ level: "OK", check: "dead air", message: `no silence over ${DEAD_AIR_MS / 1000} s between lines` }];
}

// The voice can say a word that isn't written; the captions show the script
// either way, so only the transcript gives it away.
function voiceCheck(lines, pronounce) {
  const say = speaker(pronounce);
  const checks = [];
  for (const line of lines) {
    if (!line.text || !line.words?.length) continue;
    const { all, times } = alignWords(say(line.text), line.words);
    const missed = all.filter((_, i) => times[i] == null);
    if (missed.length) checks.push({ level: "WARN", check: "voice", message: `line "${line.id}": the transcript lacks "${missed.join(" ")}"; hear it, or reword the line` });
  }
  return checks.length ? checks : [{ level: "OK", check: "voice", message: "every written word is in the transcript" }];
}

function loudnessCheck(mp4) {
  const err = run("ffmpeg", ["-hide_banner", "-nostats", "-i", mp4, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]).stderr || "";
  const summary = err.split("Summary").pop() || "";
  const i = parseFloat((/I:\s+(-?[\d.]+) LUFS/.exec(summary) || [])[1]);
  const tp = parseFloat((/Peak:\s+(-?[\d.]+) dBFS/.exec(summary) || [])[1]);
  if (!Number.isFinite(i)) return [{ level: "WARN", check: "loudness", message: "could not measure the MP4's loudness" }];
  const level = Math.abs(i - MASTER.lufs) > 1.5 || tp > -1 ? "WARN" : "OK";
  return [{ level, check: "loudness", message: `${i.toFixed(1)} LUFS (target ${MASTER.lufs}), true peak ${tp.toFixed(1)} dBTP` }];
}

// The moments worth a look: every line near its end, every card once its words
// have settled, and every push-in at full size. `zooms` are in take time.
function moments(timeline, video, zooms = []) {
  const toCut = (ms) => (timeline.edit ? mapTime(timeline.edit, ms) : ms);
  const spoken = timeline.lines.filter((t) => video.narration.find((n) => n.id === t.id)?.text);
  return [
    ...spoken.map((t) => ({ ms: t.startMs + t.ms * 0.8, what: `line ${t.id}` })),
    ...(timeline.cards || []).map((c) => ({ ms: c.startMs + Math.min(c.ms * 0.8, CARD_SETTLED_MS), what: `card "${c.title}"` })),
    ...zooms.filter((z) => z.scale > 1).map((z) => ({ ms: toCut(z.startMs + z.ms + ZOOM_SETTLED_MS), what: `zoom ${z.id}` })),
  ]
    .filter((m) => m.ms != null && m.ms < timeline.totalMs)
    .sort((a, b) => a.ms - b.ms);
}

function sheet(mp4, list, file) {
  if (!list.length) return [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-sheet-"));
  try {
    list.forEach((m, i) => {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", (m.ms / 1000).toFixed(2), "-i", mp4, "-frames:v", "1", "-vf", `scale=640:-2:${STILL_OUT}`, path.join(tmp, `${String(i).padStart(3, "0")}.jpg`)]);
    });
    const cols = 5;
    const rows = Math.ceil(list.length / cols);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", path.join(tmp, "%03d.jpg"), "-vf", `tile=${cols}x${rows}:padding=6:color=white`, "-frames:v", "1", "-q:v", "3", file]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return list.map((m, i) => ({ tile: i + 1, at: mmss(m.ms), what: m.what }));
}

// `raw` is the take's capture; on an edited cut its clock is the take's, not
// the cut's. `privacy` is how a name on screen counts for this audience.
// `thumbnail` (optional) says which picture became thumbnail.jpg and why, for
// the report.
function runQa({ dir, mp4, raw, timeline, video, privacy = "FAIL", lines = [], zooms, thumbnail, log = console.log }) {
  const qaDir = path.join(path.dirname(mp4), "qa");
  fs.mkdirSync(qaDir, { recursive: true });
  const checks = [];
  try {
    checks.push(...screenChecks(raw, timeline.edit ? " (take time)" : "", { hide: video.hide, privacy }));
  } catch (e) {
    checks.push({ level: "FAIL", check: "screen", message: `the screen could not be read, so nothing was checked for names or errors: ${e.message}` });
  }
  for (const w of timeline.warnings || []) {
    checks.push({ level: "WARN", check: w.kind, message: `${w.message}${w.line ? ` (line "${w.line}")` : ""}` });
  }
  if (!timeline.warnings?.length) checks.push({ level: "OK", check: "timing", message: "every cue landed and no click was retried" });
  checks.push(...voiceCheck(lines, video.pronounce));
  checks.push(...deadAir(timeline));
  checks.push(...loudnessCheck(mp4));
  const sheetFile = path.join(qaDir, "sheet.jpg");
  const tiles = sheet(mp4, moments(timeline, video, zooms), sheetFile);
  const report = {
    video: path.basename(dir),
    mp4,
    checkedAt: new Date().toISOString(),
    pass: !checks.some((c) => c.level === "FAIL"),
    checks,
    ...(tiles.length && { sheet: sheetFile, tiles }),
    ...(thumbnail && { thumbnail }),
  };
  fs.writeFileSync(path.join(qaDir, "report.json"), JSON.stringify(report, null, 2));
  const fails = checks.filter((c) => c.level === "FAIL");
  const warns = checks.filter((c) => c.level === "WARN");
  log(`qa: ${fails.length} FAIL, ${warns.length} WARN -> ${path.join(qaDir, "report.json")}${tiles.length ? `, ${sheetFile}` : ""}`);
  for (const c of [...fails, ...warns]) log(`  ${c.level} ${c.check}: ${c.message}`);
  return report;
}

module.exports = { runQa, identity, readText, screenHits };
