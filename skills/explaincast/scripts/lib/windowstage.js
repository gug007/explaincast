// A window target: any macOS app, through its real window, the real pointer
// and real keys, so nobody may touch the Mac during a take. There is no DOM, so
// a target is `text=<words on screen>` (read with Vision) or `[x, y]` as
// fractions of the window.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const { Stage, label, jerk } = require("./stage");
const { Capture } = require("./capture");
const { helper } = require("./helpers");
const { sleep } = require("./words");

const osa = (...lines) => execFileSync("osascript", lines.flatMap((l) => ["-e", l]), { encoding: "utf8" }).trim();
const KEY_CODES = { return: 36, enter: 36, esc: 53, escape: 53, tab: 48, space: 49, delete: 51, backspace: 51, down: 125, up: 126, left: 123, right: 124 };
const KEY_NAMES = { arrowdown: "down", arrowup: "up", arrowleft: "left", arrowright: "right", " ": "space" };

function pidOfApp(app) {
  return Number(osa(`set b to id of application "${app}"`, `tell application "System Events" to get unix id of first application process whose bundle identifier is b`));
}

const frontPid = () => Number(osa('tell application "System Events" to get unix id of first application process whose frontmost is true'));

const raise = (pid) => osa(`tell application "System Events" to set frontmost of (first application process whose unix id is ${pid}) to true`);

function mainScreen() {
  const out = execFileSync("osascript", ["-l", "JavaScript", "-e", 'ObjC.import("AppKit"); var s = $.NSScreen.mainScreen; [s.frame.size.width, s.frame.size.height, s.backingScaleFactor].join(" ")'], { encoding: "utf8" });
  const [w, h, scale] = out.trim().split(" ").map(Number);
  return { w, h, scale };
}

function place(pid, ...args) {
  const out = execFileSync(helper("winplace"), [pid, ...args].map(String), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const [x, y, w, h] = out.trim().split(" ").map(Number);
  return { x, y, w, h };
}

class WindowStage extends Stage {
  pollMs = 250;

  constructor(pid, opts) {
    super(opts);
    this.pid = pid;
    this.shot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-")), "frame.jpg");
    this.pointer = { x: opts.origin.w * 0.56, y: opts.origin.h * 0.52 };
  }

  async install() {
    this.pointerBefore = execFileSync("cliclick", ["p"], { encoding: "utf8" }).trim().replace(/\s/g, "");
    this.realMove(this.pointer.x, this.pointer.y);
  }

  // Hands the pointer back where the person left it.
  finish() {
    if (this.pointerBefore) execFileSync("cliclick", [`m:${this.pointerBefore}`]);
    fs.rmSync(path.dirname(this.shot), { recursive: true, force: true });
  }

  screen(x, y) {
    return { x: Math.round(this.origin.x + x), y: Math.round(this.origin.y + y) };
  }

  realMove(x, y) {
    const p = this.screen(x, y);
    execFileSync("cliclick", [`m:${p.x},${p.y}`]);
  }

  async locate(sel) {
    if (Array.isArray(sel)) return { x: sel[0] * this.origin.w, y: sel[1] * this.origin.h, w: 1, h: 1 };
    if (typeof sel !== "string" || !sel.startsWith("text=")) throw new Error(`a window target is "text=<words>" or [x, y] (got ${label(sel)})`);
    if (!this.capture.latest) return null;
    fs.writeFileSync(this.shot, this.capture.latest);
    let out = "";
    try {
      out = execFileSync(helper("ocrbox"), [this.shot, sel.slice(5)], { encoding: "utf8" });
    } catch (e) {
      if (e.status === 1) return null;
      throw e;
    }
    const [x, y, w, h] = out.trim().split(" ").map(Number);
    return { x: x * this.origin.w, y: y * this.origin.h, w: w * this.origin.w, h: h * this.origin.h };
  }

  // `move` places the real pointer at each step: a plain move, or while a
  // button is held, a drag (dragGlide).
  async glide(x, y, ms, move = (px, py) => this.realMove(px, py)) {
    const from = this.pointer;
    const start = Date.now();
    for (let t = 0; t < 1; await sleep(8)) {
      t = Math.min(1, (Date.now() - start) / ms);
      const s = jerk(t);
      move(from.x + (x - from.x) * s, from.y + (y - from.y) * s);
    }
    this.pointer = { x, y };
  }

  // A real click lands on screen coordinates, and keystrokes on whichever app
  // is in front (usually the terminal the take started from, where Return
  // submits), so both need the target in front and the window where it was.
  async ensureFrontmost(what) {
    if (frontPid() === this.pid) return;
    raise(this.pid);
    await sleep(300);
    if (frontPid() !== this.pid) throw new Error(`the target lost keyboard focus; stopped before ${what}`);
    this.warn("focus", "keyboard focus had moved away; brought the target back");
  }

  checkWindow() {
    const now = place(this.pid);
    if (["x", "y", "w", "h"].some((k) => Math.abs(now[k] - this.origin[k]) > 1)) throw new Error(`the window moved during the take (${JSON.stringify(now)}); the take is unusable`);
  }

  async clearAt(p) {
    const [pid, owner] = execFileSync(helper("winat"), [String(p.x), String(p.y)], { encoding: "utf8" }).trim().split("\t");
    if (Number(pid) !== this.pid) throw new Error(`a window of ${owner || "another app"} is under the click at ${p.x},${p.y}; stopped before clicking it`);
  }

  async pressAt(p) {
    await this.ensureFrontmost("clicking");
    this.checkWindow();
    const s = this.screen(p.x, p.y);
    await this.clearAt(s);
    execFileSync("cliclick", [`c:${s.x},${s.y}`]);
    this.pointer = p;
  }

  async pressDown(p) {
    await this.ensureFrontmost("dragging");
    this.checkWindow();
    const s = this.screen(p.x, p.y);
    await this.clearAt(s);
    execFileSync("cliclick", [`dd:${s.x},${s.y}`]);
    this.pointer = p;
  }

  dragGlide(x, y, ms) {
    return this.glide(x, y, ms, (px, py) => {
      const s = this.screen(px, py);
      execFileSync("cliclick", [`dm:${s.x},${s.y}`]);
    });
  }

  async release(p) {
    const s = this.screen(p.x, p.y);
    execFileSync("cliclick", [`du:${s.x},${s.y}`]);
    this.pointer = p;
  }

  async typeText(text) {
    await this.ensureFrontmost("typing");
    execFileSync("cliclick", [`t:${text}`]);
  }

  sendKey(key) {
    const name = key.toLowerCase();
    return this.sendKeys(KEY_NAMES[name] || name);
  }

  async sendKeys(combo) {
    await this.ensureFrontmost(`pressing ${combo}`);
    const parts = combo.toLowerCase().split("+");
    const key = parts.pop();
    const mods = parts.map((m) => ({ cmd: "command down", shift: "shift down", alt: "option down", ctrl: "control down" })[m]).filter(Boolean);
    const using = mods.length ? ` using {${mods.join(", ")}}` : "";
    osa(`tell application "System Events" to ${KEY_CODES[key] != null ? `key code ${KEY_CODES[key]}` : `keystroke "${key}"`}${using}`);
    await sleep(120);
  }

  async hideCursor() {}
  async showCursor() {}
}

// `launch` ([command, ...args]) starts a copy of its own, ended after the take;
// `app` uses the running app (its largest window) and leaves it running.
async function openWindow({ video, dir, frame, log }) {
  const t = video.target;
  const before = frontPid();
  let proc = null;
  let pid;
  if (t.launch) {
    proc = spawn(t.launch[0], t.launch.slice(1), { cwd: dir, stdio: "ignore" });
    pid = proc.pid;
  } else {
    execFileSync("open", ["-g", "-a", t.app]);
    pid = pidOfApp(t.app);
  }
  log(`target pid ${pid}`);
  const screen = mainScreen();
  let origin;
  const close = async () => {
    if (proc && proc.exitCode == null) proc.kill("SIGTERM");
    try {
      raise(before);
    } catch {
      // the app that was in front has gone
    }
  };
  return {
    hooks: { pid },
    startsOnFirstFrame: true,
    ready: async () => {
      const end = Date.now() + 15000;
      for (;;) {
        try {
          place(pid);
          break;
        } catch (e) {
          if (Date.now() >= end) {
            await close();
            throw new Error(`the target never showed a window: ${String(e.stderr || e.message).trim()}`);
          }
          await sleep(300);
        }
      }
      place(pid, Math.round((screen.w - frame.width) / 2), Math.round((screen.h - frame.height) / 2), frame.width, frame.height);
      await sleep(400);
      raise(pid);
      await sleep(400);
      origin = { ...place(pid), scale: screen.scale };
      if (origin.w !== frame.width || origin.h !== frame.height) {
        await close();
        throw new Error(`the window stays ${origin.w}x${origin.h} points; set target.width and target.height to that`);
      }
    },
    capture: async (onFrame) => {
      const k = screen.scale;
      const rect = { x: origin.x * k, y: origin.y * k, w: origin.w * k, h: origin.h * k };
      return new Capture({ rect, pid, scale: k, cursor: true, onFrame });
    },
    stage: (opts) => new WindowStage(pid, { ...opts, origin }),
    close,
  };
}

module.exports = { openWindow };
