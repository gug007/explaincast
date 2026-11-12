// Every recording gets its own folder under <video>/_takes/, with its raw
// capture, timeline, log and a copy of the script that produced it. A take
// that finishes replaces the video's current one, whose files move into its
// own folder; a take that fails or is interrupted never touches them. A clean
// dry run on the real clips keeps its capture, and the next take uses it
// instead of recording the same thing again.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TAKES = "_takes";
const SCRIPT_FILES = ["video.json", "beats.js"];
const pad = (n) => String(n).padStart(3, "0");
// video.json keys that only the render reads: changing one leaves a recording
// as good as a new one.
const RENDER_ONLY = ["music", "look", "zooms", "keys", "speedUpWaits", "cover", "youtube", "hide", "title", "brand"];

function stamp(d = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).slice(2)}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
}

function takeFolders(dir) {
  const root = path.join(dir, TAKES);
  return fs.existsSync(root) ? fs.readdirSync(root).filter((n) => /^\d{3}-/.test(n)).sort() : [];
}

// Output also goes to `file`, so a take's log survives the terminal.
function teeLog(file) {
  const streams = [process.stdout, process.stderr];
  const originals = streams.map((s) => s.write.bind(s));
  streams.forEach((s, i) => {
    s.write = (chunk, ...rest) => {
      try {
        fs.appendFileSync(file, chunk);
      } catch {
        // the log is a convenience; the take goes on without it
      }
      return originals[i](chunk, ...rest);
    };
  });
  return () => streams.forEach((s, i) => (s.write = originals[i]));
}

function beginTake(dir, { dry = false } = {}) {
  const n = takeFolders(dir).reduce((m, name) => Math.max(m, parseInt(name, 10)), 0) + 1;
  const id = `${pad(n)}-${stamp()}${dry ? "-dry" : ""}`;
  const folder = path.join(dir, TAKES, id);
  dropKeptDryRuns(dir);
  fs.mkdirSync(folder, { recursive: true });
  for (const f of SCRIPT_FILES) {
    if (fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(dir, f), path.join(folder, f));
  }
  const stopLog = teeLog(path.join(folder, "take.log"));
  return { id, folder, dry, raw: path.join(folder, "record.mkv"), timeline: path.join(folder, "timeline.json"), stopLog };
}

// Safe to call twice: a Ctrl-C marks the take from the signal handler, and
// the take's own error path may still get there too.
function failTake(take, error) {
  if (take.failedAt) return take.failedAt;
  take.stopLog();
  if (take.partial) fs.writeFileSync(path.join(take.folder, "timeline.partial.json"), JSON.stringify(take.partial, null, 2));
  fs.writeFileSync(path.join(take.folder, "error.txt"), `${error.stack || error}\n`);
  take.failedAt = `${take.folder}-failed`;
  fs.renameSync(take.folder, take.failedAt);
  return take.failedAt;
}

function rewriteCardFiles(timelineFile, fromDir, toDir) {
  if (!fs.existsSync(timelineFile)) return;
  const t = JSON.parse(fs.readFileSync(timelineFile, "utf8"));
  if (!t.cardFiles) return;
  t.cardFiles = t.cardFiles.map((f) => (f.startsWith(fromDir + path.sep) ? path.join(toDir, path.relative(fromDir, f)) : f));
  fs.writeFileSync(timelineFile, JSON.stringify(t, null, 2));
}

// The current take's files (`media`, relative to the video folder) move into
// its folder, then the new take's raw capture and timeline become current.
function promote(dir, take, media) {
  const hasCurrent = ["record.mkv", "timeline.json"].some((f) => fs.existsSync(path.join(dir, f)));
  let archived = null;
  if (hasCurrent) {
    let oldId = null;
    try {
      oldId = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8")).take || null;
    } catch {
      // no timeline: the raw capture alone moves
    }
    const named = oldId && path.join(dir, TAKES, oldId);
    const earlier = path.join(dir, TAKES, "000-earlier");
    const earlierFree = !["record.mkv", "timeline.json"].some((f) => fs.existsSync(path.join(earlier, f)));
    archived = named && fs.existsSync(named) ? named : earlierFree ? earlier : freeFolder(earlier);
    fs.mkdirSync(archived, { recursive: true });
    for (const name of media) {
      const from = path.join(dir, name);
      const to = path.join(archived, name);
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
    }
    rewriteCardFiles(path.join(archived, "timeline.json"), path.join(dir, "cards"), path.join(archived, "cards"));
  }
  for (const name of ["record.mkv", "timeline.json"]) fs.renameSync(path.join(take.folder, name), path.join(dir, name));
  return archived;
}

// What a recording depends on, as one hash: video.json without its
// render-only keys, beats.js, every line's clip and word onsets, the files a
// mock answers with, and for an idea, the page and the kit beside it.
// `lines` are the narration as voice.js prepared it.
function takeKey(dir, video, lines) {
  const h = crypto.createHash("sha1");
  const file = (f) => h.update(`\n${f}\n`).update(fs.existsSync(f) ? fs.readFileSync(f) : "missing");
  h.update(JSON.stringify(Object.fromEntries(Object.entries(video).filter(([k]) => !RENDER_ONLY.includes(k)))));
  file(path.join(dir, "beats.js"));
  for (const l of lines) {
    h.update(`\n${l.id} ${l.ms} ${JSON.stringify(l.words || null)}`);
    if (l.wav) file(l.wav);
  }
  const t = video.target || {};
  for (const reply of Object.values(t.mock || {})) if (typeof reply === "string") file(path.resolve(dir, reply));
  if (t.file) {
    const page = path.resolve(dir, t.file);
    file(page);
    const kit = path.join(path.dirname(page), "idea");
    if (fs.existsSync(kit)) for (const f of fs.readdirSync(kit).sort()) file(path.join(kit, f));
  }
  return h.digest("hex").slice(0, 16);
}

// A dry run's capture is only for its frames, unless `keep` (a clean run on
// the real clips): then it stays for the take. Its log and timeline stay
// either way.
function finishDryTake(take, { keep = false } = {}) {
  if (!keep) fs.rmSync(take.raw, { force: true });
}

function readTimeline(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// Only the newest take can stand in for the next, so a kept dry run's capture
// goes once another take begins. A take's own capture, archived back into its
// folder, is never kept for reuse and stays.
function dropKeptDryRuns(dir) {
  for (const id of takeFolders(dir)) {
    const folder = path.join(dir, TAKES, id);
    if (id.endsWith("-dry") && readTimeline(path.join(folder, "timeline.json"))?.reuse) fs.rmSync(path.join(folder, "record.mkv"), { force: true });
  }
}

// The newest take, when it is a dry run kept for `key` with no warnings: a
// new recording would only make the same take again. Null otherwise.
function dryTakeFor(dir, key) {
  const id = takeFolders(dir).at(-1);
  if (!id?.endsWith("-dry")) return null;
  const folder = path.join(dir, TAKES, id);
  const take = { id, folder, dry: true, raw: path.join(folder, "record.mkv"), timeline: path.join(folder, "timeline.json") };
  const timeline = fs.existsSync(take.raw) && readTimeline(take.timeline);
  return timeline && timeline.reuse === key && !timeline.warnings?.length ? take : null;
}

// The dry run made the take: its log carries on with the render, and once
// promoted its timeline is a take's like any other. Returns where the
// previous take went, if there was one, and how to stop the log.
function useDryTake(dir, take, media) {
  const stopLog = teeLog(path.join(take.folder, "take.log"));
  const archived = promote(dir, take, media);
  const file = path.join(dir, "timeline.json");
  const { reuse, ...timeline } = readTimeline(file);
  fs.writeFileSync(file, JSON.stringify(timeline, null, 2));
  return { archived, stopLog };
}

function freeFolder(base) {
  if (!fs.existsSync(base)) return base;
  for (let i = 2; ; i++) if (!fs.existsSync(`${base}-${i}`)) return `${base}-${i}`;
}

module.exports = { beginTake, failTake, promote, finishDryTake, takeKey, dryTakeFor, useDryTake, RENDER_ONLY };
