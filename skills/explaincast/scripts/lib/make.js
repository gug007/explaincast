// node make.js <video folder or slug> [flags], run by take.sh after preflight.js.
// Records a take into _takes/ (takes.js), then renders the MP4, its captions,
// chapters and thumbnail, and checks it (qa.js).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { parseCli, videoDir } = require("./cli");
const { OUT, ZOOM, frameFor } = require("./layout");
const { recordTake, renderTimelineCards, GAP_MS, LEAD_MS, TAIL_MS } = require("./record");
const { CARD_LOOK, renderThumbnail } = require("./cards");
const { videoGraph, frameAssets, frameBox, editZooms, CAPTURE_IN, SCREENCAST_IN } = require("./compose");
const { makeVoice } = require("./voice");
const { DEFAULT_BED, RATE, soundtrack } = require("./mix");
const { beginTake, failTake, promote, finishDryTake } = require("./takes");
const { exitOnSignals, runTeardown, onTeardown } = require("./teardown");
const { fitLines } = require("./fit");
const { lintDir } = require("./lint");
const { writeCaptions } = require("./captions");
const { chapters, chaptersText, mmss } = require("./chapters");
const { runQa } = require("./qa");
const { planEdit, renderEdit } = require("./edit");
const { renderCover } = require("./cover");
const { chooseCover } = require("./coverpick");
const { audienceOf } = require("./audience");
const { setHeard } = require("./words");

const ROOT = process.env.EXPLAINCAST_DIR || path.join(os.homedir(), "Movies/explaincast");
let o, DIR;
try {
  const cli = parseCli(process.argv.slice(2), { script: "make.js" });
  o = cli.o;
  DIR = videoDir(cli.video, ROOT);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const slug = path.basename(DIR);
const DEFAULT_VOICE = "marin";
const DEFAULT_STYLE =
  "Talk like a real person casually showing a colleague how something works, over their shoulder: relaxed, natural, everyday intonation with small pauses. Not a voiceover artist or announcer, no over-enunciation, moderate pace. Keep every word crisp and easy to catch.";
const MUSIC_UNDER_VOICE_LU = 14;
// Every narrator sounds alike: clips evened out, treble shelved to one
// brightness.
const VOICE_SHAPE = { level: true, brightness: -16.5 };

const video = JSON.parse(fs.readFileSync(path.join(DIR, "video.json"), "utf8"));
const audience = audienceOf(video);
setHeard(video.heard);
const VOICE = video.voice || DEFAULT_VOICE;
const TTS_STYLE = video.style || DEFAULT_STYLE;
const dry = !!o["no-audio"];
const muxOnly = !!o["mux-only"];
const audioDir = path.join(DIR, "audio");
const wantsMusic = video.music ?? audience.music;
const music = wantsMusic === false ? null : typeof wantsMusic === "string" ? path.resolve(DIR, wantsMusic) : DEFAULT_BED;
const voice = makeVoice({ audioDir, voice: VOICE, style: TTS_STYLE, respeak: !!o.respeak, pronounce: video.pronounce });
const frame = frameFor(video);
const captureIn = video.target.type === "web" ? SCREENCAST_IN : CAPTURE_IN;
// What moves with a take when a newer one replaces it.
const MEDIA = ["record.mkv", "timeline.json", `${slug}.mp4`, `${slug}.srt`, "chapters.txt", "youtube.txt", "cards", "qa"];
// The current take and its render.
const P = { raw: path.join(DIR, "record.mkv"), timeline: path.join(DIR, "timeline.json"), mp4: path.join(DIR, `${slug}.mp4`) };

async function record(lines) {
  const beats = require(path.join(DIR, "beats.js"));
  const framesDir = path.join(DIR, "frames");
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const take = beginTake(DIR, { dry });
  console.log(`take ${take.id} -> ${take.folder}`);
  const interrupted = onTeardown(() => failTake(take, new Error("interrupted (Ctrl-C or a kill signal)")));
  let timeline;
  try {
    timeline = await recordTake({ video, dir: DIR, lines, beats, raw: take.raw, framesDir, errorShot: path.join(take.folder, "error.jpg"), pace: audience.pace });
  } catch (e) {
    interrupted();
    take.partial = e.partial;
    const where = failTake(take, e);
    console.error(`the take failed${e.partial?.failedLine ? ` in "${e.partial.failedLine}"` : ""}; its log, partial timeline and last screen are in ${where}; the current take is untouched`);
    throw e;
  }
  interrupted();
  timeline.take = take.id;
  fs.writeFileSync(take.timeline, JSON.stringify(timeline, null, 2));
  console.log(`recorded ${(timeline.totalMs / 1000).toFixed(1)}s (${VOICE})`);
  for (const w of timeline.warnings || []) console.log(`  warning (${w.kind}${w.line ? `, line ${w.line}` : ""}): ${w.message}`);
  if (dry) return finishDryTake(take);
  const archived = promote(DIR, take, MEDIA);
  if (archived) console.log(`the previous take moved to ${archived}`);
}

// The topic cards as clips, rendered once per take (or again when their files
// are gone or the card's look has changed since).
async function ensureCards() {
  const timeline = JSON.parse(fs.readFileSync(P.timeline, "utf8"));
  const have = timeline.cardLook === CARD_LOOK && timeline.cardFiles?.length === (timeline.cards || []).length && timeline.cardFiles.every((f) => fs.existsSync(f));
  if (have) return;
  timeline.cardFiles = await renderTimelineCards(timeline, DIR);
  timeline.cardLook = CARD_LOOK;
  fs.writeFileSync(P.timeline, JSON.stringify(timeline, null, 2));
  console.log(`cards: ${timeline.cardFiles.length} clip(s)`);
}

// The soundtrack for clips at their times: the bed fades in over the opening
// and out over the closing card. `base` is the first clip's input index.
function mixFor(clips, totalMs, base = 0) {
  const bed = music && fs.existsSync(music) ? music : null;
  if (music && !bed) console.log(`no music: ${music} is missing${music === DEFAULT_BED ? " (preflight.js downloads it)" : ""}`);
  return soundtrack({ clips, base, bed, totalMs, underLu: MUSIC_UNDER_VOICE_LU, fadeInS: 2.5, fadeOutS: 2, voice: VOICE_SHAPE });
}

// The straight render of the take into `file`. Without `audio` it is picture
// only, for the edit to cut.
async function mux(lines, { file, crf = 18, audio = true }) {
  const timeline = JSON.parse(fs.readFileSync(P.timeline, "utf8"));
  const fit = fitLines(timeline, lines);
  for (const n of fit.notes) console.log(n);
  if (fit.errors.length) throw new Error(fit.errors.join("\n"));
  const { totalMs } = timeline;
  const spoken = timeline.lines.map((t) => ({ ...t, line: lines.find((l) => l.id === t.id) })).filter((t) => !t.line.silent);
  const zooms = editZooms(timeline.zooms || [], video.zooms, (m) => console.log(m));
  if (zooms.some((z) => z.id)) console.log(`zooms: ${zooms.map((z) => z.id).join(" ")} (video.json "zooms" adjusts one by id)`);
  const box = frameBox(OUT, frame, ZOOM);
  const assets = await frameAssets(path.join(path.dirname(DIR), "_frame"), { out: OUT, frame: { ...frame, zoom: ZOOM }, box });
  const graph = videoGraph({ ...assets, out: OUT, box, cards: timeline.cards || [], cardFiles: timeline.cardFiles || [], zooms, totalMs, take: P.raw, captureIn });
  const inputs = ["-i", P.raw, ...graph.inputs];
  let filter = graph.filter;
  const maps = ["-map", graph.label];
  if (audio) {
    const sound = mixFor(spoken.map((t) => ({ id: t.id, wav: t.line.wav, startMs: t.startMs })), totalMs, 1 + graph.count);
    inputs.push(...sound.inputs);
    filter = `${filter};${sound.filter}`;
    maps.push("-map", "[a]");
  }
  const argv = [
    "-y", ...inputs,
    "-filter_complex", filter,
    ...maps,
    "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", "30", ...graph.tags,
    ...(audio ? ["-c:a", "aac", "-b:a", "192k", "-ar", String(RATE)] : ["-an"]),
    "-t", (totalMs / 1000).toFixed(3),
    "-movflags", "+faststart",
    "-f", "mp4", file,
  ];
  const r = spawnSync("ffmpeg", argv, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    fs.rmSync(file, { force: true });
    throw new Error(`ffmpeg failed (${r.error?.code || r.signal || `exit ${r.status}`}):\n${(r.stderr || "").slice(-2000)}`);
  }
  return timeline;
}

// A finished render replaces the MP4 only once it is complete.
function placeMp4(part) {
  fs.renameSync(part, P.mp4);
  console.log(`muxed -> ${P.mp4}`);
}

// The straight render, or with long waits, the edit of it (edit.js). Returns
// the timeline as the MP4 plays it.
async function render(lines) {
  const taken = JSON.parse(fs.readFileSync(P.timeline, "utf8"));
  const plan = planEdit({ timeline: taken, video });
  const part = `${P.mp4}.part`;
  if (!plan) {
    await mux(lines, { file: part });
    placeMp4(part);
    return taken;
  }
  const work = path.join(DIR, ".edit");
  const straight = path.join(work, "straight.mp4");
  fs.mkdirSync(work, { recursive: true });
  try {
    // Nearly lossless, since the edit encodes it once more.
    await mux(lines, { file: straight, crf: 12, audio: false });
    const edited = await renderEdit({
      src: straight,
      out: part,
      plan,
      timeline: taken,
      clips: lines,
      mix: (clips, totalMs) => mixFor(clips, totalMs),
      badgeDir: path.join(path.dirname(DIR), "_frame"),
      workDir: work,
      size: OUT,
    });
    placeMp4(part);
    return edited;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(part, { force: true });
  }
}

// A paste-ready description for a public upload.
function writeYoutube(list) {
  const y = video.youtube;
  if (!y) return;
  const text = [video.title, "", ...(y.hook || []), "", ...(y.learn?.length ? ["You'll learn:", ...y.learn.map((l) => `- ${l}`), ""] : []), ...(list.length >= 3 ? ["Chapters:", ...list.map((c) => `${mmss(c.ms)} ${c.name}`), ""] : []), `Tags: ${(y.tags || []).join(", ")}`];
  fs.writeFileSync(path.join(DIR, "youtube.txt"), `${text.join("\n")}\n`);
}

// Captions, chapters and the thumbnail beside the MP4, then the checks.
// `timeline` is the MP4's (edited when there is an edit), `taken` the take's.
async function finish(lines, timeline, taken) {
  const srt = P.mp4.replace(/\.mp4$/, ".srt");
  console.log(`captions: ${writeCaptions(srt, timeline, lines)} -> ${srt}`);
  if (audience.chapters) {
    const spoken = Object.fromEntries(lines.filter((l) => l.words?.length).map((l) => [l.id, { last: l.words.at(-1).end * 1000 }]));
    const ch = chapters(timeline, video, spoken);
    if (ch.list.length > 1) {
      fs.writeFileSync(path.join(DIR, "chapters.txt"), chaptersText(ch.list));
      console.log(`chapters: ${ch.list.map((c) => c.name).join(" | ")}`);
    }
    if (audience.name === "public") {
      for (const p of ch.problems) console.log(`  chapters: ${p}`);
      writeYoutube(ch.list);
    }
  }
  const opener = (timeline.cards || []).find((c) => c.first && !c.hold);
  const thumbnail = video.cover || (audience.thumbnail && opener) ? await makeThumbnail(path.join(DIR, "thumbnail.jpg"), opener?.title || video.title, taken) : null;
  runQa({ dir: DIR, mp4: P.mp4, raw: P.raw, timeline, video, privacy: audience.privacy, lines, zooms: taken.zooms, thumbnail });
}

// thumbnail.jpg: video.json's "cover" as written, "card" for the opening
// card's words alone, and otherwise those words beside the window at the
// take's best still (coverpick.js). `taken` is the take's timeline. Returns
// what it drew, for the report.
async function makeThumbnail(file, words, taken) {
  const draw = (cover) => renderCover({ cover, raw: P.raw, timeline: taken, frame, file, captureIn });
  let made;
  if (video.cover === "card") {
    await renderThumbnail(words, file, OUT);
    made = { file, from: "the opening card (video.json cover)" };
  } else if (video.cover) {
    await draw(video.cover);
    made = { file, from: "video.json cover", cover: video.cover };
  } else {
    const zooms = editZooms(taken.zooms || [], video.zooms);
    let picked = null;
    try {
      picked = chooseCover({ raw: P.raw, timeline: taken, video, words, zooms, captureIn });
    } catch (e) {
      console.log(`thumbnail: could not look through the take for a still (${e.message})`);
    }
    const passedOver = (picked?.ranked || []).filter((m) => m.skip).map((m) => `${m.line} at ${mmss(m.ms)}: ${m.skip}`);
    if (picked?.cover) {
      await draw(picked.cover);
      const { pick } = picked;
      const where = pick.why === "line end" ? `the end of line "${pick.line}"` : `${pick.why} in line "${pick.line}"`;
      made = { file, from: "picked from the take", cover: picked.cover, moment: `${where}, ${mmss(pick.ms)} into the take`, ...(passedOver.length && { passedOver }) };
      console.log(`thumbnail: the window at ${made.moment} (best of ${picked.ranked.length} stills); set video.json "cover" to choose another, as in ${JSON.stringify(picked.cover)}`);
    } else {
      await renderThumbnail(words, file, OUT);
      made = { file, from: "the opening card: no still of the take would do", ...(passedOver.length && { passedOver }) };
      console.log(`thumbnail: no still of the take would do, so it is the opening card${passedOver.length ? ` (${passedOver.join("; ")})` : ""}`);
    }
  }
  console.log(`thumbnail -> ${file}`);
  return made;
}

(async () => {
  exitOnSignals();
  if (o["speak-only"] && video.narration.some((l) => /\bTODO\b/.test(l.text || ""))) throw new Error("the narration still has TODO placeholders; a clip would speak them");
  if (!muxOnly && !o["speak-only"]) {
    const lint = lintDir(DIR);
    for (const w of lint.warnings) console.log(`lint: ${w}`);
    if (lint.errors.length) throw new Error(`the video has mistakes to fix before a take:\n  ${lint.errors.join("\n  ")}`);
  }
  const lines = await voice.prepare(video.narration, { dry, cachedOnly: muxOnly });
  if (o["speak-only"]) {
    const { gapMs = GAP_MS, leadMs = LEAD_MS, tailMs = TAIL_MS } = audience.pace;
    const ms = lines.reduce((sum, l) => sum + l.ms + gapMs, leadMs + tailMs);
    return console.log(`about ${(ms / 1000).toFixed(1)} s in all; a dry run now uses these lengths`);
  }
  if (!muxOnly) await record(lines);
  if (dry) return;
  await ensureCards();
  const timeline = await render(lines);
  const taken = JSON.parse(fs.readFileSync(P.timeline, "utf8"));
  await finish(lines, timeline, taken);
  console.log(`done -> ${P.mp4}`);
})().catch(async (e) => {
  console.error(e.stack && !/^Error: /.test(String(e)) ? e.stack : e.message || e);
  await runTeardown();
  process.exit(1);
});
