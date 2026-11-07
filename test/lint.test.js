const test = require("node:test");
const assert = require("node:assert");
const { checkVideo } = require("../skills/explaincast/scripts/lib/lint");
const { fitLines } = require("../skills/explaincast/scripts/lib/fit");

const ok = {
  title: "A video",
  target: { type: "web", url: "http://localhost:3000" },
  narration: [
    { id: "title", text: "A video about starting a project." },
    { id: "start", text: "Click Start, and both services come up." },
    { id: "outro", ms: 3200 },
  ],
};
const okBeats = {
  setup() {},
  async title(s) {
    await s.card("A video");
  },
  async start(s) {
    await s.click("button", { cue: "Start" });
    await s.zoom("nav", { cue: "both services" });
  },
  async outro(s) {
    await s.card("example.com", { hold: true });
  },
};

test("a video that follows the rules lints clean", () => {
  assert.deepStrictEqual(checkVideo(ok, okBeats), { errors: [], warnings: [] });
});

test("mistakes that used to surface mid-take are errors", () => {
  const video = { ...ok, narration: [...ok.narration.slice(0, 2), { id: "setup", text: "x." }, { id: "wrap", text: "In the next video we add a service." }, ok.narration[2]] };
  const beats = {
    ...okBeats,
    async start(s) {
      await s.click("button", { cue: "Stop" });
    },
  };
  const { errors } = checkVideo(video, beats);
  assert.ok(errors.some((e) => /cue "Stop" is not in its line/.test(e)));
  assert.ok(errors.some((e) => /called "setup"/.test(e)));
  assert.ok(errors.some((e) => /no beat for narration line "wrap"/.test(e)));
  assert.ok(errors.some((e) => /points at another video/.test(e)));
});

test("an ambiguous or backwards cue and a short closing sentence are warnings", () => {
  const video = { ...ok, narration: [ok.narration[0], { id: "start", text: "Remove it from the list, then Remove it. Done." }, ok.narration[2]] };
  const beats = {
    ...okBeats,
    async start(s) {
      await s.click("a", { cue: "from the list" });
      await s.click("b", { cue: "Remove it" });
    },
  };
  const { errors, warnings } = checkVideo(video, beats);
  assert.deepStrictEqual(errors, []);
  assert.ok(warnings.some((w) => /occurs more than once/.test(w)));
  assert.ok(warnings.some((w) => /comes earlier in the line/.test(w)));
  assert.ok(warnings.some((w) => /very short sentence \("Done\."\)/.test(w)));
});

test("placeholders never get recorded", () => {
  const video = { ...ok, narration: [{ id: "a", text: "TODO: write it." }] };
  assert.ok(checkVideo(video, { async a() {} }).errors.some((e) => /TODO placeholder/.test(e)));
  const line = { ...ok, narration: [{ id: "a", text: "Click save." }] };
  assert.ok(checkVideo(line, { async a(s) { await s.click("TODO selector"); } }).errors.some((e) => /TODO placeholder/.test(e)));
});

test("a video needs a target it can open, sized for the canvas", () => {
  const errors = (target) => checkVideo({ ...ok, target }, okBeats).errors.join("\n");
  assert.match(errors(undefined), /"target" needs a "type"/);
  assert.match(errors({ type: "web" }), /"url" or "file"/);
  assert.match(errors({ type: "window" }), /"app" or "launch"/);
  assert.match(errors({ type: "web", url: "x", width: 1600 }), /at most 1200x680/);
});

test("cards and the end card are expected only for an audience that has them", () => {
  const plain = { ...ok, for: "me", narration: [{ id: "start", text: "Click Start, and both services come up." }] };
  assert.deepStrictEqual(checkVideo(plain, okBeats).warnings.filter((w) => /title card/.test(w)), []);
  const branded = { ...ok, brand: "acme.com", narration: [{ id: "title", text: "A video." }, { id: "start", text: "Click Start now." }] };
  assert.ok(checkVideo(branded, okBeats).warnings.some((w) => /should be silent/.test(w)));
  assert.match(checkVideo({ ...ok, for: "boss" }, okBeats).errors[0], /"for" is public, client, me/);
});

test("a re-spoken line is fine while it ends before the next one starts", () => {
  const timeline = { totalMs: 20000, lines: [{ id: "a", startMs: 500, ms: 3000 }, { id: "b", startMs: 8000, ms: 2000 }, { id: "c", startMs: 12000, ms: 2000 }] };
  const lines = [{ id: "a", ms: 5000 }, { id: "b", ms: 4200 }, { id: "c", ms: 2000 }];
  const { errors, notes } = fitLines(timeline, lines);
  assert.strictEqual(notes.length, 1);
  assert.match(notes[0], /"a" changed .* fits/);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /"b" is now 4\.20 s but the take left 4\.00 s/);
  const gone = fitLines(timeline, [{ id: "a", ms: 3000 }, { id: "c", ms: 2000 }, { id: "d", ms: 1000 }]);
  assert.ok(gone.errors.some((e) => /"b" is in the take but no longer/.test(e)));
  assert.ok(gone.errors.some((e) => /"d" is not in the take/.test(e)));
});

test("a word a beat waits for by itself is checked like any cue", () => {
  const video = { ...ok, for: "me", narration: [{ id: "a", text: "A page appears." }] };
  const { errors } = checkVideo(video, { async a(s) { await s.at("elsewhere"); } });
  assert.ok(errors.some((e) => /cue "elsewhere" is not in its line/.test(e)));
});
