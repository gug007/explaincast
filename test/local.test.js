const test = require("node:test");
const assert = require("node:assert");
const { chunks, trim, join, wav, cannotSay, hasVoice } = require("../skills/explaincast/scripts/lib/local");

test("a line short enough is read whole, a longer one in runs of whole sentences", () => {
  assert.deepStrictEqual(chunks("Open Settings. Then click Save!"), ["Open Settings. Then click Save!"]);
  assert.deepStrictEqual(chunks("One two three. Four five six? Seven eight nine. Ten.", 32), ["One two three. Four five six?", "Seven eight nine. Ten."]);
  assert.deepStrictEqual(chunks("A sentence longer than the limit stays in one piece. Next.", 20), ["A sentence longer than the limit stays in one piece.", "Next."]);
  assert.deepStrictEqual(chunks("No closing mark"), ["No closing mark"]);
  assert.deepStrictEqual(chunks('He said "stop." Then left.', 16), ['He said "stop."', "Then left."]);
});

test("a clip loses the silence around its sound, and its parts are joined by a pause", () => {
  const rate = 1000;
  const clip = new Float32Array(1000);
  clip.fill(0.5, 300, 600);
  const cut = trim(clip, rate);
  assert.strictEqual(cut.length, 300 + 2 * 30);
  assert.strictEqual(cut[30], 0.5);
  assert.strictEqual(trim(new Float32Array(100), rate).length, 30);
  const joined = join([cut, cut], rate);
  assert.strictEqual(joined.length, 2 * cut.length + 400 + 300);
  assert.strictEqual(joined[cut.length + 400 + 30], 0.5);
  assert.strictEqual(joined.at(-1), 0);
});

test("a clip is written as 16-bit mono PCM", () => {
  const file = wav(new Float32Array([0, 1, -1, 2]), 24000);
  assert.strictEqual(file.length, 44 + 8);
  assert.strictEqual(file.toString("latin1", 0, 4) + file.toString("latin1", 8, 16) + file.toString("latin1", 36, 40), "RIFFWAVEfmt data");
  assert.deepStrictEqual([file.readUInt32LE(4), file.readUInt16LE(20), file.readUInt16LE(22), file.readUInt32LE(24), file.readUInt32LE(28), file.readUInt16LE(34), file.readUInt32LE(40)], [44, 1, 1, 24000, 48000, 16, 8]);
  assert.deepStrictEqual([0, 1, 2, 3].map((i) => file.readInt16LE(44 + i * 2)), [0, 32767, -32767, 32767]);
});

test("the local voice says English, accents and numbers included, and nothing else", () => {
  assert.strictEqual(cannotSay("Version 3.2.7 costs $1,500, or 96% of a café's naïve budget."), null);
  assert.match(cannotSay("Нажмите Сохранить."), /English only/);
  assert.match(cannotSay("Click 保存 now."), /"voice": "openai"/);
});

test("a voice named by accent and sex is the local voice's", () => {
  assert.ok(hasVoice("af_heart") && hasVoice("bm_george"));
  assert.ok(!hasVoice("marin") && !hasVoice("openai") && !hasVoice("af_"));
});
