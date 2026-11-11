const test = require("node:test");
const assert = require("node:assert");
const { norm, alignWords, transcriptGaps, onsets, findPhrase, setHeard, Timing } = require("../skills/explaincast/scripts/lib/words");

const heard = (text, step = 300) => text.split(" ").map((word, i) => ({ word, start: (i * step) / 1000, end: (i * step + 250) / 1000 }));

test("numbers and percent read the same written or heard", () => {
  assert.deepStrictEqual(norm("96%"), ["ninety", "six", "percent"]);
  assert.deepStrictEqual(norm("ninety-six percent"), ["ninety", "six", "percent"]);
  assert.deepStrictEqual(norm("Step 2, then 1.5x"), ["step", "two", "then", "one", "5x"]);
  assert.deepStrictEqual(norm("2026"), ["two", "thousand", "twenty", "six"]);
});

test("the transcript's digits and misheard names still align", () => {
  const { times } = alignWords("It's at ninety-six percent of the weekly limit", heard("It's at 96% of the weekly limit"));
  assert.ok(times.every((t) => t != null), `unaligned: ${times}`);
  setHeard({ cloud: "claude", clods: "claudes" });
  const names = alignWords("Open Claude, then Claude's menu", heard("Open cloud, then Clods menu"));
  setHeard();
  assert.ok(names.times.every((t) => t != null));
  const sounds = alignWords("Two or three, too", heard("to or three two"));
  assert.ok(sounds.times.every((t) => t != null));
});

const untimed = (text, words) => {
  const { all, times } = alignWords(text, words);
  return all.filter((_, i) => times[i] == null);
};

test("a version reads as its parts, however many dots it has", () => {
  assert.deepStrictEqual(norm("0.7.57"), ["zero", "seven", "fifty", "seven"]);
  assert.deepStrictEqual(untimed("A scan of version 0.7.57 lists them.", heard("A scan of version 0 7 57 lists them")), []);
  assert.deepStrictEqual(untimed("PDF.js stays on 5.7.284, on purpose.", heard("PDF js stays on 5 7 284 on purpose")), []);
  // The speak-time check re-speaks a clip whose last two words go untimed.
  const { times } = alignWords("A fresh build now carries DOMPurify 3.2.7.", heard("A fresh build now carries DOMPurify 3 2 7"));
  assert.ok(times.slice(-2).every((t) => t != null), "a line ending on a version keeps its ending");
});

test("a number matches by its value, however the transcript writes it", () => {
  assert.deepStrictEqual(untimed("All 3,066 library tests pass.", heard("All 3 066 library tests pass")), []);
  assert.deepStrictEqual(untimed("Its first 1,500 characters show.", heard("Its first 1 500 characters show")), []);
  assert.deepStrictEqual(untimed("Its first fifteen hundred characters show.", heard("Its first 1 500 characters show")), []);
  assert.deepStrictEqual(untimed("That leaves two hundred and ninety free spots.", heard("That leaves 290 free spots")), []);
  assert.deepStrictEqual(untimed("Now it holds a hundred and fifty projects.", heard("Now it holds 150 projects")), []);
  assert.deepStrictEqual(untimed("Wait one second.", heard("Wait 1 second")), []);
  // The nearest match wins, number or not: "two" is the "to" right there, not the "two" further on.
  assert.deepStrictEqual(alignWords("Two or three, too", heard("to or three two")).times, [0, 300, 600, 900]);
});

test("ordinals match their digits, and the cardinal the transcript may give", () => {
  assert.deepStrictEqual(norm("5th"), ["fifth"]);
  assert.deepStrictEqual(norm("21st"), ["twenty", "first"]);
  assert.deepStrictEqual(untimed("Eighth, the check error from Monday.", heard("8 The check error from Monday")), []);
  assert.deepStrictEqual(untimed("Built on November 5th.", heard("Built on November fifth")), []);
  assert.deepStrictEqual(untimed("The twenty-first run.", heard("The 21st run")), []);
});

test("a percent Whisper keeps as an empty word still counts as said", () => {
  const words = [
    { word: "anything", start: 2.38, end: 2.66 },
    { word: "at", start: 2.66, end: 2.94 },
    { word: "75", start: 2.94, end: 3.36 },
    { word: "", start: 3.36, end: 3.74 },
    { word: "or", start: 3.9, end: 4.1 },
    { word: "more", start: 4.1, end: 4.4 },
  ];
  const { times } = alignWords("anything at seventy-five percent or more", words);
  assert.deepStrictEqual(times, [2380, 2660, 2940, 2940, 3360, 3900, 4100]);
  assert.deepStrictEqual(untimed("anything at 75 or more", [...words.slice(0, 3), { word: "", start: 3.36 }, ...words.slice(4)]), []);
});

test("a number's words are timed in step with the spoken ones, and a cue on it lands there", () => {
  const { times } = alignWords("first fifteen hundred characters", heard("first 1 500 characters"));
  assert.deepStrictEqual(times, [0, 300, 600, 900]);
  const t = new Timing();
  t.beginLine({ id: "a", text: "Only its first 1,500 characters show", words: heard("Only its first 1 500 characters show"), ms: 3000 });
  assert.strictEqual(t.cueMs("1,500"), 900);
  assert.strictEqual(t.cueMs("characters"), 1500);
});

test("each word reduces on its own, so captions can count a word's parts", () => {
  const text = "Eighth: v0.7.57 is 96% done, 1,500 rows on the 21st, twenty-first try.";
  const parts = text.split(/\s+/).reduce((n, w) => n + norm(w).length, 0);
  assert.strictEqual(parts, norm(text).length);
});

test("a heard entry can stand for a phrase, on either side", () => {
  setHeard({ karucapatogac: "Karutsa-patoghits dot", "super base": "Supabase" });
  const site = alignWords("Find an apartment on Karutsa-patoghits dot am today.", heard("Find an apartment on KarucaPatogac am today."));
  const db = alignWords("It keeps rows in Supabase now.", heard("It keeps rows in super base now."));
  setHeard();
  assert.deepStrictEqual(site.times, [0, 300, 600, 900, 1200, 1200, 1200, 1500, 1800]);
  assert.deepStrictEqual(db.times, [0, 300, 600, 900, 1200, 1800]);
});

test("a gap in the transcript is a skip or a spelling, shown against what was heard", () => {
  const [spelling] = transcriptGaps("Find an apartment on Karutsa-patoghits dot am today.", heard("Find an apartment on KarucaPatogac am today."));
  assert.deepStrictEqual(spelling, {
    kind: "spelling",
    wrote: "…an apartment on [Karutsa-patoghits dot] am today.",
    heard: "…an apartment on [KarucaPatogac] am today.",
    entry: { karucapatogac: "karutsa patoghits dot" },
  });
  setHeard(spelling.entry);
  assert.deepStrictEqual(transcriptGaps("Find an apartment on Karutsa-patoghits dot am today.", heard("Find an apartment on KarucaPatogac am today.")), []);
  setHeard();
  const [skipped] = transcriptGaps("Save it now. Then close it.", heard("Save it now."));
  assert.deepStrictEqual(skipped, { kind: "skipped", wrote: "Save it now. [Then close it.]", heard: "Save it now. [ ]" });
  const [differs] = transcriptGaps("Open the menu and pick a theme you like.", heard("Open the settings pane, scroll down, then like."));
  assert.strictEqual(differs.kind, "differs");
  assert.strictEqual(differs.entry, undefined);
  assert.deepStrictEqual(transcriptGaps("All 3,066 tests pass on 0.7.57.", heard("All 3 066 tests pass on 0 7 57.")), []);
});

test("a word the transcript missed gets an onset between its neighbours", () => {
  const at = onsets("click the blue button", [{ word: "click", start: 0, end: 0.2 }, { word: "button", start: 0.9, end: 1.1 }], 1500);
  assert.strictEqual(at[0], 0);
  assert.ok(at[1] > 0 && at[1] < at[2] && at[2] < 900);
  assert.strictEqual(at[3], 900);
});

test("phrases are found in order, and again after a first match", () => {
  const all = norm("Remove it, then press Remove it again");
  const first = findPhrase(all, norm("Remove it"));
  assert.strictEqual(first, 0);
  assert.strictEqual(findPhrase(all, norm("Remove it"), first + 1), 4);
  assert.strictEqual(findPhrase(all, norm("not here")), -1);
});

test("cueMs lands on the spoken word and refuses a cue the line lacks", () => {
  const t = new Timing();
  t.beginLine({ id: "a", text: "Now click Send it", words: heard("Now click Send it"), ms: 2000 });
  assert.strictEqual(t.cueMs("Send"), 600);
  assert.throws(() => t.cueMs("Stop"), /not in line "a"/);
});

test("an action that can't reach its word in time is reported, once the timing is real", async () => {
  const warnings = [];
  const stage = new Timing();
  stage.warn = (kind, message) => warnings.push(message);
  stage.lineStart = Date.now() - 2000;
  stage.line = { id: "a", text: "Press save now", ms: 3000, words: [{ word: "Press", start: 0.1, end: 0.4 }, { word: "save", start: 1, end: 1.3 }, { word: "now", start: 1.4, end: 1.6 }] };
  await stage.holdForCue("save", 500);
  assert.match(warnings[0], /"save" lands 1\.\d s late/);
  stage.line = { ...stage.line, words: [] };
  await stage.holdForCue("save", 500);
  assert.strictEqual(warnings.length, 1, "a dry run's estimate only logs");
});
