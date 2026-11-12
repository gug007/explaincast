// One recording session: opens the target, walks the beats against the
// narration clock, and hands back the timeline the mux lays audio and cards on.
const fs = require("fs");
const path = require("path");
const { OUT, ZOOM, frameFor } = require("./layout");
const { frameBox } = require("./compose");
const { Recorder } = require("./recorder");
const { renderCards, APP_LAYOUT } = require("./cards");
const { sleep } = require("./words");
const { onTeardown } = require("./teardown");

const GAP_MS = 450;
const LEAD_MS = 500;
const TAIL_MS = 1800;
const SETTLE_MS = 150;

// `progress` collects the lines done so far, for the partial timeline a failed
// take leaves; `check` throws when the recording can no longer be used.
async function runBeats(stage, lines, beats, t0, { gapMs = GAP_MS, tailMs = TAIL_MS, progress = {}, check = () => {} } = {}) {
  const timeline = (progress.lines = []);
  for (const [i, line] of lines.entries()) {
    const beat = beats[line.id];
    if (!beat) throw new Error(`no beat for narration line "${line.id}"`);
    check();
    progress.current = line.id;
    const startMs = Date.now() - t0;
    console.log(`beat ${line.id} @ ${(startMs / 1000).toFixed(2)}s`);
    stage.beginLine(line);
    await beat(stage, line);
    if (i === 0 && (await stage.isCovered())) await stage.reveal();
    // frames/ shows each line settled at its end, and the target's own checks run on that moment.
    await stage.holdUntil(line.ms - SETTLE_MS);
    await stage.endLine();
    await stage.frame(line.id);
    const rest = startMs + line.ms + gapMs - (Date.now() - t0);
    if (rest < -1500) console.log(`  dead air after ${line.id}: ${(-rest / 1000).toFixed(1)} s past its line`);
    if (rest > 0) await stage.hold(rest);
    timeline.push({ id: line.id, startMs, ms: line.ms });
  }
  progress.current = null;
  // A held end card has had its time; the tail is for a window left on screen.
  if (!(await stage.isCovered())) await stage.hold(tailMs);
  check();
  await stage.frame("end");
  return timeline;
}

async function waitForFrames(rec, nudge) {
  const startedAt = Date.now();
  for (let n = 0; !rec.started && Date.now() - startedAt < 30000; n++) {
    await nudge(n);
    await sleep(20);
  }
  if (!rec.started) throw new Error("the recording never received a first frame");
}

// Everything the take sets up is undone however it ends (teardown.js); a failed
// take throws with `partial` (the lines it got through) and leaves the screen
// at that moment in `errorShot`.
async function recordTake({ video, dir, lines, beats, raw, framesDir, errorShot, pace = {} }) {
  const { gapMs = GAP_MS, leadMs = LEAD_MS, tailMs = TAIL_MS } = pace;
  const frame = frameFor(video);
  let t0 = Date.now();
  const log = (m) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(2)}s ${m}`);
  const undo = [];
  const later = (fn) => {
    const off = onTeardown(fn);
    undo.push(async () => {
      off();
      await fn();
    });
  };
  const progress = {};
  let stage, capture, rec;
  let stopping = false;
  try {
    const open = video.target.type === "window" ? require("./windowstage").openWindow : require("./webstage").openWeb;
    const target = await open({ video, dir, frame, log });
    later(() => target.close());
    if (beats.setup) await beats.setup({ ...target.hooks, video, dir, log });
    await target.ready();
    rec = new Recorder(raw, { first: !!target.startsOnFirstFrame });
    later(() => rec.stop(Date.now() - t0));
    capture = await target.capture((f) => rec.frame(f));
    later(() => capture.stop());
    stage = target.stage({ capture, framesDir, log, dir, out: OUT, box: frameBox(OUT, frame, ZOOM) });
    later(() => stage.finish());
    await stage.install();
    await stage.cover();
    await waitForFrames(rec, (n) => stage.nudge(n));
    await stage.frame("stage");
    t0 = rec.startWall;
    stage.t0 = t0;
    const check = () => {
      if (!stopping && capture.failed) throw new Error(capture.failed);
      if (rec.failed) throw new Error(`the recording stopped mid-take: ${rec.failed}`);
    };
    await stage.hold(leadMs);
    const timeline = await runBeats(stage, lines, beats, t0, { gapMs, tailMs, progress, check });
    const totalMs = Date.now() - t0;
    await stage.settle();
    stopping = true;
    await capture.stop();
    await rec.stop(totalMs);
    return { totalMs, lines: timeline, cards: stage.cards, zooms: stage.zooms, keys: stage.presses, target: video.target.type, ...(stage.warnings.length && { warnings: stage.warnings }) };
  } catch (e) {
    stopping = true;
    if (capture?.latest) {
      if (errorShot) fs.writeFileSync(errorShot, capture.latest);
      if (framesDir) fs.writeFileSync(path.join(framesDir, "99-error.jpg"), capture.latest);
    }
    e.partial = {
      failedLine: progress.current || null,
      elapsedMs: rec?.started ? Date.now() - t0 : 0,
      lines: progress.lines || [],
      cards: stage?.cards || [],
      zooms: stage?.zooms || [],
      warnings: stage?.warnings || [],
    };
    throw e;
  } finally {
    while (undo.length) {
      try {
        await undo.pop()();
      } catch (err) {
        log(`cleanup: ${err.message}`);
      }
    }
  }
}

// The topic cards as clips in the video's look (look.js), run after the take
// is saved so a rendering hiccup never costs the recording.
async function renderTimelineCards(timeline, dir, look) {
  const cardsDir = path.join(dir, "cards");
  fs.rmSync(cardsDir, { recursive: true, force: true });
  fs.mkdirSync(cardsDir, { recursive: true });
  return renderCards(timeline.cards || [], cardsDir, OUT, { layout: APP_LAYOUT, look });
}

module.exports = { recordTake, renderTimelineCards, GAP_MS, LEAD_MS, TAIL_MS };
