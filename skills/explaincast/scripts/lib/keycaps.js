// Keystroke badges: the keys a beat pressed (s.keys, s.press), shown as
// keycaps under the middle of the window for a moment after each press. They
// are drawn into the picture at mux time, so they look the same on every
// target, never touch the page, and stay out of a zoom. video.json
// "keys": false leaves them out, and --mux-only applies that.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// How long a badge stays after its last press; the same keys pressed again
// while it is up keep it up (↓ ↓ ↓ through a list), and other keys replace it.
const SHOW_MS = 1200;
// Where the badge's centre sits, as a share of the finished frame: level with
// the speed-up badge (edit.js), which sits at the right.
const AT = { x: 0.5, y: 0.84 };

const SYMBOLS = {
  cmd: "⌘", command: "⌘", meta: "⌘",
  shift: "⇧",
  alt: "⌥", option: "⌥",
  ctrl: "⌃", control: "⌃",
  enter: "return", return: "return",
  esc: "esc", escape: "esc",
  tab: "tab",
  space: "space", " ": "space",
  backspace: "⌫", delete: "⌫",
  up: "↑", arrowup: "↑",
  down: "↓", arrowdown: "↓",
  left: "←", arrowleft: "←",
  right: "→", arrowright: "→",
  pageup: "page up", pagedown: "page down",
  home: "home", end: "end",
};

// Pure: the keycaps for a combo as s.keys() or s.press() takes it
// ("cmd+shift+k", "Enter", "ArrowDown", "Control+A"), in the order pressed.
function keyCaps(combo) {
  const text = String(combo);
  const parts = text === "+" ? ["+"] : text.endsWith("++") ? [...text.slice(0, -2).split("+"), "+"] : text.split("+");
  return parts.filter((p) => p !== "").map((p) => SYMBOLS[p.toLowerCase()] || (p.length === 1 ? p.toUpperCase() : p));
}

// Pure: presses ({ startMs, caps }, in take order) as badges ({ startMs, ms,
// caps }). A press of the same keys while its badge is up keeps it up; other
// keys end it there and start their own. `totalMs` cuts the last one at the
// take's end.
function keyBadges(presses = [], { showMs = SHOW_MS, totalMs = Infinity } = {}) {
  const out = [];
  for (const p of presses) {
    const last = out.at(-1);
    const sig = p.caps.join(" ");
    if (last && p.startMs < last.endMs) {
      if (last.sig === sig) {
        last.endMs = p.startMs + showMs;
        continue;
      }
      last.endMs = p.startMs;
    }
    out.push({ sig, caps: p.caps, startMs: p.startMs, endMs: p.startMs + showMs });
  }
  return out
    .map((b) => ({ caps: b.caps, startMs: Math.round(b.startMs), ms: Math.round(Math.min(b.endMs, totalMs) - b.startMs) }))
    .filter((b) => b.ms > 0);
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

// The badge's page: a pale pill of keycaps in the speed-up badge's style,
// drawn at twice its CSS size like that badge, with room around it for the
// shadow.
const badgeHtml = (caps) => `<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; background: transparent; }
#wrap { display: inline-block; padding: 24px 28px 36px; }
.pill { display: flex; gap: 12px; padding: 12px; border-radius: 30px; background: rgba(235, 229, 217, 0.96); box-shadow: 0 6px 22px rgba(0,0,0,.45); }
.cap { min-width: 64px; height: 64px; padding: 0 18px; box-sizing: border-box; border-radius: 16px; background: #fff; box-shadow: inset 0 -4px 0 rgba(0,0,0,.14), 0 1px 2px rgba(0,0,0,.2); display: flex; align-items: center; justify-content: center; font: 600 36px/1 -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif; color: #141414; white-space: nowrap; }
</style><div id="wrap"><div class="pill">${caps.map((c) => `<div class="cap">${esc(c)}</div>`).join("")}</div></div>`;

// One PNG per distinct set of keycaps, in the frame cache beside the videos
// (named by what it shows and how, so a changed style draws again). Returns a
// file for each badge, in order.
async function renderKeyBadges(dir, badges) {
  if (!badges.length) return [];
  fs.mkdirSync(dir, { recursive: true });
  const fileOf = (caps) => path.join(dir, `keys-${crypto.createHash("sha1").update(badgeHtml(caps)).digest("hex").slice(0, 12)}.png`);
  const missing = [...new Map(badges.map((b) => [fileOf(b.caps), b.caps])).entries()].filter(([file]) => !fs.existsSync(file));
  if (missing.length) {
    const { chromium, CHROME } = require("./browser");
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 200 }, deviceScaleFactor: 2 });
      for (const [file, caps] of missing) {
        await page.setContent(badgeHtml(caps));
        await page.locator("#wrap").screenshot({ path: file, omitBackground: true });
      }
    } finally {
      await browser.close();
    }
  }
  return badges.map((b) => fileOf(b.caps));
}

module.exports = { SHOW_MS, AT, keyCaps, keyBadges, renderKeyBadges };
