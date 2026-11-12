const test = require("node:test");
const assert = require("node:assert");
const { Stage } = require("../skills/explaincast/scripts/lib/stage");

// A target whose button slides from `from` to `to` while the zoom glides in.
function slidingStage({ cheap, from, to }) {
  const s = new Stage({ origin: { w: 1100, h: 620 }, box: { x: 0, y: 0, w: 2200, h: 1240 }, out: { width: 2200, height: 1240 } });
  s.t0 = Date.now();
  s.log = () => {};
  s.cheapLookups = cheap;
  let rect = from;
  s.locate = async () => rect;
  s.slide = () => { rect = to; };
  return s;
}

test("a zoom on a web target lands where the target is once the zoom arrives", async () => {
  const s = slidingStage({ cheap: true, from: { x: 100, y: 100, w: 40, h: 20 }, to: { x: 500, y: 400, w: 40, h: 20 } });
  await s.zoom("#toggle", { ms: 30 });
  s.slide();
  await s.settle();
  assert.deepStrictEqual([s.zooms[0].cx, s.zooms[0].cy], [1040, 820]);
  assert.deepStrictEqual(s.zooms[0].rect, { x: 1000, y: 800, w: 80, h: 40 });
});

test("a target that is costly to look up keeps the zoom it started with", async () => {
  const s = slidingStage({ cheap: false, from: { x: 100, y: 100, w: 40, h: 20 }, to: { x: 500, y: 400, w: 40, h: 20 } });
  await s.zoom("text=Save", { ms: 30 });
  s.slide();
  await s.settle();
  assert.deepStrictEqual([s.zooms[0].cx, s.zooms[0].cy], [240, 220]);
});
