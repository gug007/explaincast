const test = require("node:test");
const assert = require("node:assert");
const { ICONS, countText } = require("../skills/explaincast/idea/stage.js");

test("the icons a screen usually needs are there", () => {
  for (const name of ["monitor", "terminal", "folder", "mail", "search", "settings", "user", "bell", "lock"]) assert.ok(ICONS[name], name);
});

test("a counted number keeps the decimals of the number it is heading for", () => {
  assert.strictEqual(countText(1234.4, 8400, { prefix: "$" }), "$1,234");
  assert.strictEqual(countText(0.5, 1.25, { suffix: " s" }), "0.50 s");
  assert.strictEqual(countText(34, 34, { prefix: "£", places: 2 }), "£34.00");
});
