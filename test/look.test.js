const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { lookOf, lookProblems, DEFAULT_LOOK } = require("../skills/explaincast/scripts/lib/look");
const { CANVAS, INK, SERIF, POOLS, overlayCss } = require("../skills/explaincast/scripts/lib/overlay");
const { checkVideo } = require("../skills/explaincast/scripts/lib/lint");

// A folder with a logo and a font file in it, removed after the test.
function brandFolder(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-look-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "brand"));
  fs.writeFileSync(path.join(dir, "brand/logo.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
  fs.writeFileSync(path.join(dir, "brand/Sans-Bold.woff2"), Buffer.from("wOF2 not a real font"));
  return dir;
}

test("without a look, every video keeps explaincast's own", () => {
  assert.deepStrictEqual(
    { canvas: DEFAULT_LOOK.canvas, ink: DEFAULT_LOOK.ink, font: DEFAULT_LOOK.font, pools: DEFAULT_LOOK.pools, logo: DEFAULT_LOOK.logo, fontFace: DEFAULT_LOOK.fontFace, brand: DEFAULT_LOOK.brand },
    { canvas: CANVAS, ink: INK, font: SERIF, pools: POOLS, logo: null, fontFace: "", brand: false },
  );
  assert.strictEqual(lookOf(undefined).key, DEFAULT_LOOK.key);
  assert.strictEqual(lookOf({}).key, DEFAULT_LOOK.key, "an empty look is the default one");
  assert.match(overlayCss(), /#explaincast-card::before/);
});

test("a brand's canvas goes flat unless it asks for pools, which can take its own colours", () => {
  assert.strictEqual(lookOf({ canvas: "#0e2a3c" }).pools, null);
  assert.strictEqual(lookOf({ canvas: "#0e2a3c", pools: true }).pools, POOLS);
  assert.strictEqual(lookOf({ pools: false }).pools, null);
  const tinted = lookOf({ canvas: "#0e2a3c", pools: ["#1d4d6b", "#24506e"] }).pools;
  assert.strictEqual(tinted, "radial-gradient(40% 50% at 20% 30%, #1d4d6b, transparent 70%), radial-gradient(45% 55% at 80% 70%, #24506e, transparent 70%)");
  assert.doesNotMatch(overlayCss({ pools: null }), /::before/);
  assert.match(overlayCss({ canvas: "#0e2a3c", ink: "#ffffff" }), /background: #0e2a3c; color: #ffffff;/);
});

test("a font file is loaded under a face of its own, a font name is used as installed, and a logo becomes a data URL", (t) => {
  const dir = brandFolder(t);
  const file = lookOf({ font: "brand/Sans-Bold.woff2", logo: "brand/logo.svg" }, dir);
  assert.match(file.fontFace, /^@font-face \{ font-family: "explaincast-brand"; src: url\("data:font\/woff2;base64,[A-Za-z0-9+/=]+"\) format\("woff2"\); font-weight: 100 900;/);
  assert.match(file.font, /^"explaincast-brand", system-ui/);
  assert.match(file.logo, /^data:image\/svg\+xml;base64,/);
  assert.ok(file.brand);
  const named = lookOf({ font: "Avenir Next" });
  assert.strictEqual(named.fontFace, "");
  assert.match(named.font, /^"Avenir Next", system-ui/);
  assert.notStrictEqual(named.key, file.key);
  assert.strictEqual(lookOf({ font: "Avenir Next" }).key, named.key, "the same look keeps its key");
});

test("a look that can't be drawn says what is wrong, before a take", (t) => {
  const dir = brandFolder(t);
  const problems = lookProblems({ canvas: "navy blue", ink: "#fff;} body{", font: "brand/Missing.ttf", logo: "brand/logo.gif", pools: ["#fff", "nope"], accent: "#f00" }, dir);
  assert.strictEqual(problems.length, 6, problems.join("\n"));
  const text = problems.join("\n");
  for (const want of ["unknown accent", '"canvas" is a colour', '"ink" is a colour', 'font file "brand/Missing.ttf" is not there', '"logo" is an image file', '"pools" is true, false']) assert.ok(text.includes(want), `${want}\n${text}`);
  assert.deepStrictEqual(lookProblems({ canvas: "rgb(14 42 60)", ink: "hsl(0 0% 100%)", font: "brand/Sans-Bold.woff2", logo: "brand/logo.svg", pools: false }, dir), []);
  assert.deepStrictEqual(lookProblems({ font: 'Inter"; }' }), ['video.json look: "font" "Inter\\"; }" is not a font name (letters, digits, spaces, dots and hyphens)']);
  assert.throws(() => lookOf({ logo: "brand/none.png" }, dir), /the logo "brand\/none\.png" is not there/);
  assert.deepStrictEqual(lookProblems("dark"), ['video.json "look" is an object: { canvas, ink, font, logo, pools }']);
});

test("lint refuses a video whose look is broken, and a client video without one is fine", (t) => {
  const dir = brandFolder(t);
  const beats = { title: async (s) => s.card("Checkout"), first: async () => {} };
  const video = { title: "Checkout", for: "client", target: { type: "web", url: "http://localhost:3000" }, narration: [{ id: "title", text: "Checkout." }, { id: "first", text: "Pick a plan." }] };
  assert.deepStrictEqual(checkVideo(video, beats, { dir }).errors, []);
  const { errors } = checkVideo({ ...video, look: { logo: "brand/missing.svg" } }, beats, { dir });
  assert.deepStrictEqual(errors, ['video.json look: the logo "brand/missing.svg" is not there (a relative path starts at the video folder)']);
});
