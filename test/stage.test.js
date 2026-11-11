const test = require("node:test");
const assert = require("node:assert");
const { edgePath, facing, ICONS } = require("../skills/explaincast/idea/stage.js");

const browser = { x: 36, y: 228, w: 240, h: 164 };
const server = { x: 430, y: 228, w: 240, h: 164 };
const db = { x: 824, y: 116, w: 240, h: 164 };
const email = { x: 824, y: 360, w: 240, h: 164 };

test("parts in a row join with a straight line between the facing sides", () => {
  assert.deepStrictEqual(facing(browser, server), ["right", "left"]);
  assert.strictEqual(edgePath(browser, server), "M 278 310 L 428 310");
  assert.strictEqual(edgePath(server, browser), "M 428 310 L 278 310");
});

test("offset parts join with a curve that leaves and enters level", () => {
  assert.strictEqual(edgePath(server, db), "M 672 310 C 746.9 310, 747.1 198, 822 198");
  assert.strictEqual(edgePath(server, db, { shift: [-20, 0], bend: 60 }), "M 672 290 C 732 290, 762 198, 822 198");
});

test("stacked parts join top to bottom", () => {
  assert.deepStrictEqual(facing(db, email), ["bottom", "top"]);
  assert.strictEqual(edgePath(db, email), "M 944 282 L 944 358");
});

test("two ends on the same side make a U past the further one", () => {
  assert.strictEqual(edgePath(email, browser, { from: "bottom", to: "bottom" }), "M 944 526 C 944 616, 156 616, 156 394");
  assert.strictEqual(edgePath(db, email, { from: "right", to: "right", bend: 40 }), "M 1066 198 C 1106 198, 1106 442, 1066 442");
});

test("a side that is not one of the four is refused", () => {
  assert.throws(() => edgePath(browser, server, { from: "middle" }), /left, right, top or bottom/);
});

test("the icons a map usually needs are there", () => {
  for (const name of ["monitor", "server", "database", "mail", "key-round", "hash", "user", "cloud", "lock"]) assert.ok(ICONS[name], name);
});
