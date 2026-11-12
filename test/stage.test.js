const test = require("node:test");
const assert = require("node:assert");
const { ICONS } = require("../skills/explaincast/idea/stage.js");

test("the icons a screen usually needs are there", () => {
  for (const name of ["monitor", "terminal", "folder", "mail", "search", "settings", "user", "bell", "lock"]) assert.ok(ICONS[name], name);
});
