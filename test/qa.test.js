const test = require("node:test");
const assert = require("node:assert");
const { voiceCheck } = require("../skills/explaincast/scripts/lib/qa");

const heard = (text, step = 300) => text.split(" ").map((word, i) => ({ word, start: (i * step) / 1000, end: (i * step + 250) / 1000 }));

test("a spelling difference is a NOTE that gives the heard entry to add", () => {
  const [c] = voiceCheck([{ id: "title", text: "Find an apartment on Karutsa-patoghits dot am today.", words: heard("Find an apartment on KarucaPatogac am today.") }]);
  assert.strictEqual(c.level, "NOTE");
  assert.match(c.message, /^line "title": heard as other words/);
  assert.match(c.message, /\n {2}wrote {2}…an apartment on \[Karutsa-patoghits dot\] am today\.\n {2}heard {2}…an apartment on \[KarucaPatogac\] am today\.\n/);
  assert.match(c.message, /"heard": \{ "karucapatogac": "karutsa patoghits dot" \}/);
});

test("words the voice skipped stay a WARN, and a clean line is OK", () => {
  const [c] = voiceCheck([{ id: "end", text: "Save it now. Then close it.", words: heard("Save it now.") }]);
  assert.strictEqual(c.level, "WARN");
  assert.match(c.message, /the voice skipped words/);
  assert.doesNotMatch(c.message, /"heard"/);
  const ok = voiceCheck([{ id: "a", text: "Save it now.", words: heard("Save it now.") }]);
  assert.deepStrictEqual(ok.map((x) => x.level), ["OK"]);
});

test("the voice check reads what the voice was asked to say", () => {
  const [c] = voiceCheck([{ id: "a", text: "Restart nginx now.", words: heard("Restart engine x now.") }], { nginx: "engine x" });
  assert.strictEqual(c.level, "OK");
});
