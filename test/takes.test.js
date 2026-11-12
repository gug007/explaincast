const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { beginTake, promote, finishDryTake, takeKey, dryTakeFor, useDryTake } = require("../skills/explaincast/scripts/lib/takes");

const MEDIA = ["record.mkv", "timeline.json"];

// A video folder with a script and one voiced line, removed after the test.
function video(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-takes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v = { title: "Demo", for: "me", target: { type: "web", file: "page.html" }, music: false, narration: [{ id: "a", text: "Click Save." }] };
  fs.writeFileSync(path.join(dir, "video.json"), JSON.stringify(v));
  fs.writeFileSync(path.join(dir, "beats.js"), "module.exports = { async a(s) {} };\n");
  fs.writeFileSync(path.join(dir, "page.html"), "<p>one</p>");
  fs.mkdirSync(path.join(dir, "audio"));
  fs.writeFileSync(path.join(dir, "audio", "a.wav"), "clip one");
  const lines = [{ id: "a", text: "Click Save.", ms: 1200, wav: path.join(dir, "audio", "a.wav"), words: [{ word: "Click", start: 0, end: 0.3 }] }];
  return { dir, v, lines };
}

// A take run to its end: dry ones keep their capture when `key` is given.
function take(dir, { dry, key, warnings } = {}) {
  const tk = beginTake(dir, { dry });
  tk.stopLog();
  fs.writeFileSync(tk.raw, `capture of ${tk.id}`);
  fs.writeFileSync(tk.timeline, JSON.stringify({ take: tk.id, totalMs: 2000, lines: [], ...(key && { reuse: key }), ...(warnings && { warnings }) }));
  if (dry) finishDryTake(tk, { keep: !!key });
  else promote(dir, tk, MEDIA);
  return tk;
}

test("the take key ignores what only the render reads and follows what the recording reads", (t) => {
  const { dir, v, lines } = video(t);
  const key = takeKey(dir, v, lines);
  assert.strictEqual(takeKey(dir, { ...v, music: true, look: { canvas: "#fff" }, zooms: { "a#1": { drop: true } }, youtube: { tags: ["x"] }, title: "Other" }, lines), key);
  assert.notStrictEqual(takeKey(dir, { ...v, for: "public" }, lines), key, "the audience sets the pace");
  assert.notStrictEqual(takeKey(dir, { ...v, heard: { "save": "Save" } }, lines), key, "heard moves the cues");
  assert.notStrictEqual(takeKey(dir, v, [{ ...lines[0], ms: 1300 }]), key);
  fs.writeFileSync(lines[0].wav, "clip two");
  assert.notStrictEqual(takeKey(dir, v, lines), key, "a clip spoken again");
  const now = takeKey(dir, v, lines);
  fs.writeFileSync(path.join(dir, "page.html"), "<p>two</p>");
  assert.notStrictEqual(takeKey(dir, v, lines), now, "an idea's page");
  const then = takeKey(dir, v, lines);
  fs.appendFileSync(path.join(dir, "beats.js"), "// moved\n");
  assert.notStrictEqual(takeKey(dir, v, lines), then);
});

test("a clean dry run kept for the same key is the next take, and only while it is the newest", (t) => {
  const { dir, v, lines } = video(t);
  const key = takeKey(dir, v, lines);
  const dry = take(dir, { dry: true, key });
  assert.strictEqual(dryTakeFor(dir, key)?.id, dry.id);
  assert.strictEqual(dryTakeFor(dir, "something else"), null);
  take(dir, {});
  assert.strictEqual(dryTakeFor(dir, key), null, "a take after it");
});

test("a dry run with warnings, or on estimated lengths, is never kept", (t) => {
  const { dir, v, lines } = video(t);
  const key = takeKey(dir, v, lines);
  take(dir, { dry: true, key, warnings: [{ kind: "cue", message: "late" }] });
  assert.strictEqual(dryTakeFor(dir, key), null);
  const est = take(dir, { dry: true });
  assert.ok(!fs.existsSync(est.raw), "an estimated dry run drops its capture as before");
  assert.strictEqual(dryTakeFor(dir, key), null);
});

test("the dry run used as the take is promoted like a take, and its capture survives being archived later", (t) => {
  const { dir, v, lines } = video(t);
  const key = takeKey(dir, v, lines);
  const dry = take(dir, { dry: true, key });
  const { stopLog } = useDryTake(dir, dryTakeFor(dir, key), MEDIA);
  stopLog();
  assert.strictEqual(fs.readFileSync(path.join(dir, "record.mkv"), "utf8"), `capture of ${dry.id}`);
  const promoted = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
  assert.strictEqual(promoted.take, dry.id);
  assert.ok(!("reuse" in promoted), "a promoted take is never offered again");
  assert.strictEqual(dryTakeFor(dir, key), null, "its capture has moved to the video");
  take(dir, {});
  assert.strictEqual(fs.readFileSync(path.join(dry.folder, "record.mkv"), "utf8"), `capture of ${dry.id}`, "archived back into its folder and kept");
});

test("a kept dry run's capture goes once another take begins", (t) => {
  const { dir, v, lines } = video(t);
  const key = takeKey(dir, v, lines);
  const first = take(dir, { dry: true, key });
  const second = take(dir, { dry: true, key });
  assert.ok(!fs.existsSync(first.raw));
  assert.strictEqual(dryTakeFor(dir, key)?.id, second.id);
});
