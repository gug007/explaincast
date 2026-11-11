// The beat API every target shares: the narration clock, the pointer, zooms and
// cards. A target adds how to find things and act on them: locate, glide,
// pressAt, pressDown, dragGlide, release, typeText, sendKey, sendKeys,
// hideCursor, showCursor.
const fs = require("fs");
const path = require("path");
const { sleep, norm, findPhrase, Timing } = require("./words");
const { keyCaps } = require("./keycaps");

const label = (sel) => (typeof sel === "string" ? sel : JSON.stringify(sel));
// The ease every glide uses: a gentle start and stop.
const jerk = (t) => t * t * t * (10 + t * (-15 + 6 * t));

// Small enough for the pointer (about 20 points) to hide much of it.
const SMALL_CONTROL = { w: 200, h: 60 };

// Pure: whether a control under the pointer ({ name, w, h } in points) is a
// small one whose name the line `text` says.
function coversNamed(hit, text) {
  if (!hit?.name || hit.w > SMALL_CONTROL.w || hit.h > SMALL_CONTROL.h) return false;
  const want = norm(hit.name);
  return want.length > 0 && want.length <= 6 && findPhrase(norm(text), want) >= 0;
}

class Stage extends Timing {
  pollMs = 80;

  constructor(opts = {}) {
    super(opts);
    this.capture = opts.capture;
    this.framesDir = opts.framesDir;
    this.origin = opts.origin;
    this.box = opts.box;
    this.out = opts.out;
    this.frameNo = 0;
    this.cards = [];
    this.zooms = [];
    this.presses = [];
    this.warnings = [];
    this.covered = false;
  }

  // Something the take got through but a reviewer should know about; saved
  // with the timeline and listed in the checks.
  warn(kind, message) {
    this.warnings.push({ kind, line: this.line?.id || null, atMs: this.t0 ? Date.now() - this.t0 : 0, message });
    this.log(`warning: ${message}`);
  }

  async install() {}
  finish() {}
  async nudge() {}
  // Runs at the end of every line, once it has settled; a target can check its own screen here.
  async endLine() {}

  // Window points → the finished video's pixels.
  outPoint(p) {
    return { x: this.box.x + (p.x * this.box.w) / this.origin.w, y: this.box.y + (p.y * this.box.h) / this.origin.h };
  }

  async waitFor(sel, timeout = 8000) {
    const until = Date.now() + timeout;
    for (;;) {
      const r = await this.locate(sel);
      if (r) return r;
      if (Date.now() >= until) throw new Error(`waitFor: ${label(sel)} never became visible`);
      await sleep(this.pollMs);
    }
  }

  async waitGone(sel, timeout = 15000) {
    const until = Date.now() + timeout;
    while (await this.locate(sel)) {
      if (Date.now() >= until) throw new Error(`${label(sel)} is still on screen after ${timeout / 1000} s`);
      await sleep(this.pollMs);
    }
  }

  async until(done, { timeout = 120000, label: name = "wait" } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await done()) return true;
      await this.hold(250);
    }
    this.warn("wait", `${name} did not finish within ${Math.round(timeout / 1000)} s`);
    return false;
  }

  rectOf(sel) {
    return this.waitFor(sel);
  }

  async point(sel, at = [0.5, 0.5]) {
    const r = await this.rectOf(sel);
    return { x: r.x + r.w * at[0], y: r.y + r.h * at[1] };
  }

  // Push the picture in on `sel` (compose.js does the actual zoom); it stays
  // until zoomOut.
  async zoom(sel, opts = {}) {
    const r = await this.rectOf(sel);
    const at = opts.at || [0.5, 0.5];
    const o = this.outPoint({ x: r.x + r.w * at[0], y: r.y + r.h * at[1] });
    const tl = this.outPoint(r);
    const br = this.outPoint({ x: r.x + r.w, y: r.y + r.h });
    await this.recordZoom(opts.scale ?? 1.8, o.x, o.y, opts, { sel: label(sel), at, rect: { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y } });
  }

  async zoomOut(opts = {}) {
    await this.recordZoom(1, this.out.width / 2, this.out.height / 2, opts);
  }

  async moveTo(sel, opts = {}) {
    const p = await this.point(sel, opts.at);
    const ms = opts.ms ?? 750;
    if (opts.cue) await this.holdForCue(opts.cue, ms + (opts.pause ?? 0));
    await this.glide(p.x, p.y, ms);
    if (opts.after) await sleep(opts.after);
    return p;
  }

  // `verify` (a selector that must show up, or an async check) makes the click
  // check itself: while the target is still there it is pressed again, twice at
  // most, then the take stops; a target that has gone means the click worked
  // and the page is only slow, so it waits on `verify` instead.
  async click(sel, opts = {}) {
    const pause = opts.pause ?? 160;
    let p = await this.moveTo(sel, { ...opts, pause });
    await sleep(pause);
    p = await this.settledPoint(sel, opts.at, p);
    await this.pressAt(p);
    this.log(`click ${label(sel)}`);
    await sleep(opts.settle ?? 350);
    if (!opts.verify) return p;
    const done = typeof opts.verify === "function" ? opts.verify : async () => !!(await this.locate(opts.verify));
    const what = typeof opts.verify === "function" ? "its check" : label(opts.verify);
    for (let presses = 1; ; presses++) {
      const end = Date.now() + (opts.verifyMs ?? 1500);
      while (Date.now() < end) {
        if (await done()) return p;
        await sleep(100);
      }
      if (!(await this.locate(sel))) {
        const late = Date.now() + 6000;
        while (Date.now() < late) {
          if (await done()) return p;
          await sleep(150);
        }
        throw new Error(`click on ${label(sel)}: the target went away but ${what} never showed up`);
      }
      if (presses === 3) throw new Error(`click on ${label(sel)} did not take effect after 3 presses (${what} never passed)`);
      this.warn("click", `click on ${label(sel)} did not take, pressing again`);
      p = await this.settledPoint(sel, opts.at, p);
      await this.pressAt(p);
    }
  }

  // The target can shift while the pointer glides to it; the press goes where
  // it is now, after a short re-glide.
  async settledPoint(sel, at = [0.5, 0.5], p) {
    const r = await this.locate(sel);
    if (!r) return p;
    const now = { x: r.x + r.w * at[0], y: r.y + r.h * at[1] };
    if (Math.hypot(now.x - p.x, now.y - p.y) <= 3) return p;
    this.log(`${label(sel)} moved while the pointer travelled; following it`);
    await this.glide(now.x, now.y, 150);
    await sleep(170);
    return now;
  }

  // Presses on `from`, carries it to `to` and lets go there. `at` aims inside
  // `from` and `dropAt` inside `to`, as `at` does for a click; `cue` lands the
  // pick-up on its word and `dragMs` is the carry. The real pointer moves in
  // small steps, which drag-and-drop code needs to see a drag at all.
  async drag(from, to, opts = {}) {
    const pause = opts.pause ?? 160;
    let p = await this.moveTo(from, { ...opts, pause });
    await sleep(pause);
    p = await this.settledPoint(from, opts.at, p);
    await this.pressDown(p);
    // Many drag libraries wait for a short hold before they lift an item.
    await sleep(opts.hold ?? 220);
    const end = await this.point(to, opts.dropAt);
    await this.dragGlide(end.x, end.y, opts.dragMs ?? 900);
    await sleep(160);
    await this.release(end);
    this.log(`drag ${label(from)} -> ${label(to)}`);
    await sleep(opts.settle ?? 350);
    return end;
  }

  async upload() {
    throw new Error("s.upload is for web targets; in a window, click through the app's own file dialog");
  }

  // A key press shows as a badge under the window (keycaps.js) unless `badge`
  // is false; `cue` presses it on that word.
  async keys(combo, opts = {}) {
    await this.notePress(combo, opts);
    await this.sendKeys(combo);
  }

  async press(key, opts = {}) {
    await this.notePress(key, opts);
    await this.sendKey(key);
  }

  async notePress(combo, { cue, badge = true } = {}) {
    if (cue) await this.holdForCue(cue, 0);
    if (badge && this.t0) this.presses.push({ startMs: Date.now() - this.t0, caps: keyCaps(combo) });
    this.log(`keys ${combo}`);
  }

  // `words: true` types a word per burst, for long text.
  async type(text, opts = {}) {
    const parts = opts.words ? text.match(/\S+\s*|\s+/g) || [] : text;
    for (const part of parts) {
      await this.typeText(part);
      await sleep(part === " " ? 40 : 55 + Math.random() * 45);
    }
    if (opts.after) await sleep(opts.after);
  }

  // Recorded for compose.js; the beat waits the card's length so the narration
  // and the next action stay in step.
  async card(title, opts = {}) {
    const ms = this.cardMs(opts);
    this.cards.push({ title, startMs: Date.now() - this.t0, ms, hold: !!opts.hold, first: this.covered });
    this.log(`card "${title}" ${ms}ms${opts.hold ? " held" : ""}`);
    this.covered = true;
    await this.hideCursor();
    await sleep(ms);
    if (!opts.hold) {
      this.covered = false;
      await this.showCursor();
    }
  }

  async cover() {
    this.covered = true;
  }

  async isCovered() {
    return this.covered;
  }

  async reveal() {
    this.covered = false;
  }

  async frame(name) {
    if (!this.framesDir || !this.capture.latest) return;
    fs.writeFileSync(path.join(this.framesDir, `${String(this.frameNo++).padStart(2, "0")}-${name}.jpg`), this.capture.latest);
  }
}

module.exports = { Stage, label, jerk, coversNamed };
