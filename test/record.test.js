const test = require("node:test");
const assert = require("node:assert");
const { runBeats } = require("../skills/explaincast/scripts/lib/record");

// A beat that changes the page at once (an idea page's show()) returns long
// before its line is over; the frame has to wait for the line's end.
test("a line's frame is taken at the line's end, not when its beat returns", async () => {
  const calls = [];
  const stage = {
    beginLine: () => {},
    isCovered: async () => false,
    reveal: async () => {},
    hold: async (ms) => {
      calls.push("hold");
      await new Promise((r) => setTimeout(r, ms));
    },
    frame: async (name) => calls.push(`frame ${name}`),
  };
  const beats = { a: async () => calls.push("beat a") };
  await runBeats(stage, [{ id: "a", ms: 200 }], beats, Date.now(), { gapMs: 0, tailMs: 0 });
  assert.deepStrictEqual(calls.slice(0, 3), ["beat a", "hold", "frame a"]);
});
