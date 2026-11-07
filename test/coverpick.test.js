const test = require("node:test");
const assert = require("node:assert");
const { coverMoments, lastsS, rankMoments, coverAt, LASTS_FULL_S } = require("../skills/explaincast/scripts/lib/coverpick");

const narration = [
  { id: "title", text: "Find your apartment." },
  { id: "list", text: "Every building is on one page." },
  { id: "pause", ms: 1500 },
  { id: "sort", text: "Click Affordable to put the cheapest first." },
  { id: "outro", ms: 3200 },
];
const timeline = {
  totalMs: 30000,
  lines: [
    { id: "title", startMs: 500, ms: 4000 },
    { id: "list", startMs: 5000, ms: 5000 },
    { id: "pause", startMs: 10500, ms: 1500 },
    { id: "sort", startMs: 12500, ms: 6000 },
    { id: "outro", startMs: 26000, ms: 3200 },
  ],
};

test("every spoken line's settled end and every push-in at full size is a candidate", () => {
  const zooms = [
    { id: "list#1", startMs: 6000, ms: 700, scale: 1.8 },
    { id: "list#2", startMs: 8000, ms: 500, scale: 1 },
    { id: "sort#1", startMs: 18150, ms: 700, scale: 1.9 },
  ];
  const moments = coverMoments(timeline, narration, zooms);
  assert.deepStrictEqual(moments, [
    { ms: 4850, line: "title", why: "line end" },
    { ms: 6950, line: "list", why: "zoom list#1" },
    { ms: 10350, line: "list", why: "line end" },
    { ms: 19100, line: "sort", why: "zoom sort#1" },
    { ms: 25850, line: "sort", why: "line end" },
  ]);
});

test("moments closer than 300 ms are the same still", () => {
  const zooms = [{ id: "sort#1", startMs: 25000, ms: 500, scale: 1.6 }];
  const ends = coverMoments(timeline, narration, zooms).filter((m) => m.line === "sort");
  assert.deepStrictEqual(ends.map((m) => m.ms), [25750]);
});

test("a screen lasts as long as the samples around it match it", () => {
  const a = Uint8Array.from([10, 10, 10, 10]);
  const b = Uint8Array.from([200, 200, 200, 200]);
  const samples = [b, a, a, a, b, a];
  assert.strictEqual(lastsS(samples, 2, a, { fps: 2, same: 1.5 }), 1.5);
  assert.strictEqual(lastsS(samples, 0, b, { fps: 2, same: 1.5 }), 0.5);
  assert.strictEqual(lastsS([], 0, a), 0);
});

const still = (over) => ({ ms: 1000, line: "list", why: "line end", detail: 20, color: 40, motion: 0, lastsS: 8, ...over });

test("a main view full of content beats a menu that is open for a moment", () => {
  const ranked = rankMoments([still({ ms: 1000, line: "menu", detail: 21, color: 40, lastsS: 1 }), still({ ms: 2000, line: "list" })]);
  assert.strictEqual(ranked[0].line, "list");
});

test("a moving or nearly blank still is passed over, whatever its score", () => {
  const ranked = rankMoments([
    still({ ms: 1000, line: "scroll", detail: 30, color: 60, motion: 3 }),
    still({ ms: 2000, line: "empty", detail: 8, color: 60 }),
    still({ ms: 3000, line: "list", detail: 20, color: 30, lastsS: 2 }),
  ]);
  assert.deepStrictEqual(ranked.map((m) => [m.line, m.skip || null]), [
    ["list", null],
    ["scroll", "still moving"],
    ["empty", "nearly blank"],
  ]);
});

test("how long a screen lasts stops counting once it is clearly a main view", () => {
  const ranked = rankMoments([still({ ms: 1000, line: "short", detail: 22, lastsS: LASTS_FULL_S }), still({ ms: 2000, line: "long", detail: 20, lastsS: 60 })]);
  assert.strictEqual(ranked[0].line, "short");
});

test("without colour anywhere, detail and how long it lasts decide", () => {
  const ranked = rankMoments([still({ ms: 1000, line: "a", color: 0, detail: 5 }), still({ ms: 2000, line: "b", color: 0, detail: 6 })]);
  assert.strictEqual(ranked[0].line, "b");
  assert.ok(Number.isFinite(ranked[0].score));
});

test("the pick is written as the cover video.json would hold", () => {
  assert.deepStrictEqual(coverAt({ ms: 10350, line: "list" }, "Find your apartment", timeline), { words: "Find your apartment", line: "list", at: 5.35, style: "window" });
});
