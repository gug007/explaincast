const test = require("node:test");
const assert = require("node:assert");
const { planEdit, layout, mapTime, editTimeline } = require("../skills/explaincast/scripts/lib/edit");
const { checkVideo } = require("../skills/explaincast/scripts/lib/lint");

const FRAME = 1000 / 30;
const near = (a, b) => assert.ok(Math.abs(a - b) <= FRAME, `${a} is not within a frame of ${b}`);

const narration = [
  { id: "title", text: "A video." },
  { id: "open", text: "Open it." },
  { id: "works", text: "It works." },
  { id: "review", text: "Review it." },
  { id: "outro", ms: 3200 },
];
const take = {
  totalMs: 40600,
  lines: [
    { id: "title", startMs: 500, ms: 8000 },
    { id: "open", startMs: 9000, ms: 4000 },
    { id: "works", startMs: 13500, ms: 5000 },
    { id: "review", startMs: 30500, ms: 6000 },
    { id: "outro", startMs: 36950, ms: 3200 },
  ],
  cards: [
    { title: "A video", startMs: 1628, ms: 1250, first: true },
    { title: "example.com", startMs: 36950, ms: 3600, hold: true },
  ],
};
// Every cut rendered at exactly its planned length.
const rendered = (plan) => layout(plan.cuts.map((c) => ({ ...c, outMs: (c.toMs - c.fromMs) / c.speed })));

test("a take with no long waits needs no edit", () => {
  const short = { ...take, lines: take.lines.map((l) => (l.id === "review" ? { ...l, startMs: 19000 } : l.id === "outro" ? { ...l, startMs: 25450 } : l)) };
  assert.strictEqual(planEdit({ timeline: short, video: { narration } }), null);
});

test("a long wait between lines plays at 4x, and later lines move up by what it saved", () => {
  const plan = planEdit({ timeline: take, video: { narration } });
  const wait = plan.cuts.find((c) => c.kind === "wait");
  assert.strictEqual(wait.speed, 4);
  assert.strictEqual(wait.after, "works");
  near(wait.fromMs, 18500 + 400);
  near(wait.toMs, 30500 - 300);
  const placed = rendered(plan);
  const saved = (wait.toMs - wait.fromMs) * (3 / 4);
  near(mapTime(placed, 30500), 30500 - saved);
  near(mapTime(placed, 9000), 9000);
});

test("a very long wait speeds up further, to 16x at most", () => {
  const halfHour = 30 * 60 * 1000;
  const long = {
    ...take,
    totalMs: take.totalMs + halfHour,
    lines: take.lines.map((l) => (["review", "outro"].includes(l.id) ? { ...l, startMs: l.startMs + halfHour } : l)),
    cards: take.cards.map((c) => (c.hold ? { ...c, startMs: c.startMs + halfHour } : c)),
  };
  assert.strictEqual(planEdit({ timeline: long, video: { narration } }).cuts.find((c) => c.kind === "wait").speed, 16);
});

test("speedUpWaits: false keeps waits real time", () => {
  assert.strictEqual(planEdit({ timeline: take, video: { narration, speedUpWaits: false } }), null);
});

test("a wait a card fills is left alone", () => {
  const carded = { ...take, cards: [...take.cards, { title: "Topic", startMs: 22000, ms: 2000 }] };
  assert.strictEqual(planEdit({ timeline: carded, video: { narration } })?.cuts.some((c) => c.kind === "wait") ?? false, false);
});

test("the edited timeline keeps every line and card at its new time", () => {
  const plan = planEdit({ timeline: take, video: { narration } });
  const placed = rendered(plan);
  const edited = editTimeline(take, placed);
  assert.deepStrictEqual(edited.lines.map((l) => l.id), ["title", "open", "works", "review", "outro"]);
  near(edited.lines.find((l) => l.id === "review").startMs, mapTime(placed, 30500));
  assert.strictEqual(edited.cards.length, 2);
  near(edited.totalMs, placed.reduce((s, c) => s + c.outMs, 0));
  assert.ok(edited.edit.some((c) => c.kind === "wait"));
});

const beats = {
  setup() {},
  async title(s) {
    await s.card("A video");
  },
  async open() {},
  async works() {},
  async review() {},
  async outro(s) {
    await s.card("example.com", { hold: true });
  },
};

test("the lint checks a cover and speedUpWaits", () => {
  const good = { title: "A video", target: { type: "web", url: "x" }, narration, cover: { words: "Check it", line: "review", at: 1, style: "window" } };
  assert.deepStrictEqual(checkVideo(good, beats).errors, []);
  const bad = { title: "A video", target: { type: "web", url: "x" }, narration, cover: { line: "nope", style: "poster", crop: [1, 2] }, speedUpWaits: "yes" };
  const errors = checkVideo(bad, beats).errors.join("\n");
  for (const want of ['no "words"', 'names "nope"', 'style "poster"', '"crop"', '"speedUpWaits"']) {
    assert.ok(errors.includes(want), `missing: ${want}\n${errors}`);
  }
});
