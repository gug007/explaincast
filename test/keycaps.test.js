const test = require("node:test");
const assert = require("node:assert");
const { keyCaps, keyBadges, SHOW_MS } = require("../skills/explaincast/scripts/lib/keycaps");
const { Stage, coversNamed } = require("../skills/explaincast/scripts/lib/stage");

test("a combo becomes its keycaps, modifiers as symbols", () => {
  assert.deepStrictEqual(keyCaps("cmd+shift+k"), ["⌘", "⇧", "K"]);
  assert.deepStrictEqual(keyCaps("Control+A"), ["⌃", "A"]);
  assert.deepStrictEqual(keyCaps("Enter"), ["return"]);
  assert.deepStrictEqual(keyCaps("ArrowDown"), ["↓"]);
  assert.deepStrictEqual(keyCaps("esc"), ["esc"]);
  assert.deepStrictEqual(keyCaps("F5"), ["F5"]);
  assert.deepStrictEqual(keyCaps("cmd++"), ["⌘", "+"]);
});

test("the same keys again while their badge is up keep it up; other keys replace it", () => {
  const down = ["↓"];
  const badges = keyBadges([
    { startMs: 1000, caps: down },
    { startMs: 1500, caps: down },
    { startMs: 2000, caps: down },
    { startMs: 2600, caps: ["return"] },
    { startMs: 9000, caps: ["⌘", "K"] },
  ]);
  assert.deepStrictEqual(badges, [
    { caps: down, startMs: 1000, ms: 1600 },
    { caps: ["return"], startMs: 2600, ms: SHOW_MS },
    { caps: ["⌘", "K"], startMs: 9000, ms: SHOW_MS },
  ]);
});

test("the last badge stops at the take's end", () => {
  const [b] = keyBadges([{ startMs: 5000, caps: ["return"] }], { totalMs: 5400 });
  assert.strictEqual(b.ms, 400);
  assert.deepStrictEqual(keyBadges([{ startMs: 5000, caps: ["return"] }], { totalMs: 5000 }), []);
});

test("s.keys and s.press note each press for a badge, unless asked not to", async () => {
  const s = new Stage({});
  const sent = [];
  s.sendKeys = async (c) => sent.push(c);
  s.sendKey = async (k) => sent.push(k);
  s.t0 = Date.now() - 4000;
  await s.keys("cmd+k");
  await s.press("Enter", { badge: false });
  assert.deepStrictEqual(sent, ["cmd+k", "Enter"]);
  assert.strictEqual(s.presses.length, 1);
  assert.deepStrictEqual(s.presses[0].caps, ["⌘", "K"]);
  assert.ok(s.presses[0].startMs >= 4000);
});

test("s.drag presses on the source, carries it to the target and lets go there", async () => {
  const s = new Stage({});
  const rects = { "#card": { x: 100, y: 100, w: 40, h: 20 }, "#done": { x: 500, y: 300, w: 200, h: 100 } };
  const calls = [];
  s.locate = async (sel) => rects[sel];
  s.glide = async (x, y) => calls.push(["glide", x, y]);
  s.pressDown = async (p) => calls.push(["down", p.x, p.y]);
  s.dragGlide = async (x, y) => calls.push(["carry", x, y]);
  s.release = async (p) => calls.push(["up", p.x, p.y]);
  await s.drag("#card", "#done", { pause: 0, hold: 0, settle: 0 });
  assert.deepStrictEqual(calls, [
    ["glide", 120, 110],
    ["down", 120, 110],
    ["carry", 600, 350],
    ["up", 600, 350],
  ]);
});

test("the pointer check flags a small control the line names, and nothing else", () => {
  const save = { name: "Save", w: 72, h: 32 };
  assert.strictEqual(coversNamed(save, "Click Save to keep the draft."), true);
  assert.strictEqual(coversNamed(save, "Your draft is kept."), false, "the line is not about it");
  assert.strictEqual(coversNamed({ ...save, w: 420 }, "Click Save."), false, "too wide for the pointer to hide");
  assert.strictEqual(coversNamed({ name: "", w: 20, h: 20 }, "Click it."), false);
  assert.strictEqual(coversNamed(null, "Click Save."), false);
  assert.strictEqual(coversNamed({ name: "New project", w: 140, h: 36 }, "Open new project from here."), true);
});
