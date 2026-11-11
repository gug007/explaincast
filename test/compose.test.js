const test = require("node:test");
const assert = require("node:assert");
const { coverSpans, videoGraph } = require("../skills/explaincast/scripts/lib/compose");
const { OPEN_LIFT } = require("../skills/explaincast/scripts/lib/overlay");

const cards = [
  { title: "Review code changes", startMs: 1628, ms: 1254, first: true },
  { title: "Undo and commit", startMs: 40000, ms: 2000 },
  { title: "example.com", startMs: 100000, ms: 3600, hold: true },
];

test("the window leaves its place for as long as each card is up", () => {
  const [open, topic, end] = coverSpans(cards, 104000);
  assert.strictEqual(open.a, 0);
  assert.ok(Math.abs(open.b - (1.628 + 1.254 - OPEN_LIFT.leadMs / 1000 + OPEN_LIFT.riseMs / 1000)) < 1e-9);
  assert.ok(Math.abs(open.fadeIn - 1.778) < 1e-9, "the window fades in as the opening words rise");
  assert.deepStrictEqual([topic.a, topic.b], [40, 42]);
  assert.strictEqual(end.a, 100);
  assert.ok(end.b > 104, "a held card keeps the window beside it to the end");
});

test("the composed picture hides the placed window while a card has it", () => {
  const g = videoGraph({
    out: { width: 2560, height: 1440 },
    canvas: "c.png",
    shadow: "s.png",
    mask: "m.png",
    box: { x: 180, y: 100, w: 2200, h: 1240 },
    cards,
    cardFiles: ["a.mkv", "b.mkv", "c.mkv"],
    totalMs: 104000,
  });
  assert.match(g.filter, /enable='not\(gte\(t,0\.000\)\*lt\(t,[\d.]+\)\+gte\(t,40\.000\)\*lt\(t,42\.000\)\+gte\(t,100\.000\)\*lt\(t,105\.000\)\)'/);
  for (const i of [0, 1, 2]) assert.match(g.filter, new RegExp(`\\[v${i + 1}\\]\\[cv${i}\\]overlay`), `card ${i} gets the window above it`);
  assert.match(g.filter, /scale=w='2560\*\(1-0\.22\*\(/);
});

test("a card later in the take reads the window from its own inputs, seeked to the card", () => {
  const g = videoGraph({
    out: { width: 2560, height: 1440 },
    canvas: "c.png",
    shadow: "s.png",
    mask: "m.png",
    box: { x: 180, y: 100, w: 2200, h: 1240 },
    cards,
    cardFiles: ["a.mkv", "b.mkv", "c.mkv"],
    totalMs: 104000,
    take: "take.mkv",
  });
  assert.match(g.filter, /alphamerge,split=2\[w1c\]\[w\]/, "only the opener shares the take's window");
  assert.deepStrictEqual(g.inputs.slice(g.inputs.indexOf("c.mkv") + 1, g.inputs.indexOf("c.mkv") + 6), ["-ss", "40.000", "-t", "2.000", "-i"]);
  assert.match(g.filter, /\[7:v\]scale=2200:1240:[^;]*\[w2t\]/);
  assert.match(g.filter, /\[w2t\]\[m2t\]alphamerge,setpts=PTS-STARTPTS\+40\.000\/TB\[w2c\]/);
  assert.match(g.filter, /\[w3t\]\[m3t\]alphamerge,setpts=PTS-STARTPTS\+100\.000\/TB\[w3c\]/);
  assert.strictEqual(g.count, 3 + 3 + 6);
});

test("key badges come after every other input, over the zoom and under the cards", () => {
  const g = videoGraph({
    out: { width: 2560, height: 1440 },
    canvas: "c.png",
    shadow: "s.png",
    mask: "m.png",
    box: { x: 180, y: 100, w: 2200, h: 1240 },
    cards,
    cardFiles: ["a.mkv", "b.mkv", "c.mkv"],
    zooms: [{ startMs: 5000, ms: 700, scale: 1.8, cx: 900, cy: 500 }],
    keys: [{ startMs: 12000, ms: 1200 }, { startMs: 50000, ms: 100 }],
    keyFiles: ["k1.png", "k2.png"],
    totalMs: 104000,
    take: "take.mkv",
  });
  const files = g.inputs.filter((a, i) => g.inputs[i - 1] === "-i");
  assert.deepStrictEqual(files.slice(-2), ["k1.png", "k2.png"]);
  assert.strictEqual(g.count, 3 + 3 + 6 + 2);
  assert.deepStrictEqual(g.inputs.slice(g.inputs.indexOf("k1.png") - 7, g.inputs.indexOf("k1.png")), ["-framerate", "30", "-loop", "1", "-t", "1.200", "-i"]);
  assert.match(g.filter, /\[13:v\]format=rgba,fade=t=in:st=0:d=0\.12:alpha=1,fade=t=out:st=1\.000:d=0\.2:alpha=1,setpts=PTS-STARTPTS\+12\.000\/TB\[k0\]/);
  assert.match(g.filter, /\[14:v\]format=rgba,fade=t=in:st=0:d=0\.12:alpha=1,setpts=PTS-STARTPTS\+50\.000\/TB\[k1\]/, "too short to fade out as well");
  assert.match(g.filter, /\[vz\]\[k0\]overlay=x=1280-overlay_w\/2:y=1210-overlay_h\/2:eof_action=pass:enable='between\(t,12\.000,13\.200\)'\[vk0\]/);
  assert.match(g.filter, /\[vk1\]\[c0\]overlay/, "the first card goes over the last badge");
});
