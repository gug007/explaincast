const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { makeVoice, speaker } = require("../skills/explaincast/scripts/lib/voice");
const { python } = require("../skills/explaincast/scripts/lib/qwen");

// Silence as 16-bit mono WAV, a second by default.
function silence(rate = 24000, seconds = 1) {
  const data = rate * 2 * seconds;
  const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0); b.writeUInt32LE(36 + data, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(data, 40);
  return b;
}
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "voice-test-"));
const words = (text) => text.split(" ").map((word, i) => ({ word, start: i * 0.2, end: i * 0.2 + 0.15 }));

test("the OpenAI voice sends the same requests and keeps the same cache key", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/speech")) return new Response(silence());
    return Response.json({ words: words("Open the menu") });
  });
  process.env.OPENAI_API_KEY ??= "test-key";
  const audioDir = tmpDir();
  const [line] = await makeVoice({ audioDir, style: "calm" }).prepare([{ id: "a", text: "Open the *menu*" }]);
  assert.strictEqual(calls[0].url, "https://api.openai.com/v1/audio/speech");
  assert.deepStrictEqual(JSON.parse(calls[0].init.body), { model: "gpt-4o-mini-tts", voice: "marin", input: "Open the menu", instructions: "calm", response_format: "wav" });
  assert.strictEqual(calls[1].url, "https://api.openai.com/v1/audio/transcriptions");
  assert.strictEqual(calls[1].init.body.get("model"), "whisper-1");
  assert.strictEqual(calls[1].init.body.get("file").name, "a.wav");
  assert.strictEqual(fs.readFileSync(path.join(audioDir, "a.txt"), "utf8"), "gpt-4o-mini-tts/marin\ncalm\nOpen the menu");
  assert.strictEqual(line.ms, 1000);
  assert.strictEqual(line.words.length, 3);
});

test("a provider's clip and words are cached under its model and voice", async () => {
  let spoken = 0;
  const provider = {
    model: "fake-tts",
    defaultVoice: "nova",
    async speak({ text, voice, style }) {
      spoken++;
      assert.deepStrictEqual([text, voice, style], ["打开 Settings 页面", "nova", "随意"]);
      return silence();
    },
    async words() {
      return [{ word: "打开", start: 0, end: 0.3 }, { word: " Settings", start: 0.3, end: 0.7 }, { word: "页面", start: 0.7, end: 0.9 }];
    },
  };
  const audioDir = tmpDir();
  const narration = [{ id: "a", text: "打开 Settings 页面" }];
  const voice = makeVoice({ audioDir, style: "随意", provider });
  assert.strictEqual(voice.name, "nova");
  await voice.prepare(narration);
  const [again] = await makeVoice({ audioDir, style: "随意", provider }).prepare(narration);
  assert.strictEqual(spoken, 1);
  assert.strictEqual(fs.readFileSync(path.join(audioDir, "a.txt"), "utf8"), "fake-tts/nova\n随意\n打开 Settings 页面");
  assert.strictEqual(again.ms, 1000);
});

// Loads the 2 GB models, so it runs only when asked: EXPLAINCAST_QWEN_TEST=1.
test("the local voice speaks Chinese and times every character", { skip: !process.env.EXPLAINCAST_QWEN_TEST || !fs.existsSync(python()) }, async () => {
  const audioDir = tmpDir();
  const voice = makeVoice({ audioDir, tts: "qwen", lang: "zh", style: "像同事在旁边随口演示一样，语气自然放松，语速适中，吐字清楚。" });
  assert.strictEqual(voice.name, "serena");
  const lines = await voice.prepare([
    { id: "a", text: "先点击右上角的设置按钮。" },
    { id: "b", text: "这里能看到最近的订单。" },
  ]);
  for (const l of lines) {
    assert.ok(l.ms > 800 && l.ms < 8000, `${l.id}: ${l.ms}ms`);
    assert.ok(l.words.length >= 5, JSON.stringify(l.words));
    assert.ok(l.words.every((w, i) => w.end >= w.start && (i === 0 || w.start >= l.words[i - 1].start)));
  }
  assert.match(lines[0].words.map((w) => w.word).join(""), /设置按钮/, "simplified, not 設置按鈕");
});

test("pronounce swaps Chinese words inside a line, English ones only whole", () => {
  const say = speaker({ "电商": "电子商务", SLO: "S L O" });
  assert.strictEqual(say("看电商的SLO页面"), "看电子商务的S L O页面");
  assert.strictEqual(say("SLOW and SLO"), "SLOW and S L O");
});

test("a Chinese clip spoken too slowly is spoken again, and kept after three tries", async () => {
  const text = "先点击右上角的设置按钮";
  const chars = text.split("").map((word, i) => ({ word, start: i * 0.2, end: i * 0.2 + 0.15 }));
  const make = (lengths, heard = chars) => {
    let n = 0;
    return { model: "fake", defaultVoice: "v", speak: async () => silence(24000, lengths[n++]), words: async () => heard, count: () => n };
  };
  const quick = make([6, 3]);
  const [line] = await makeVoice({ audioDir: tmpDir(), style: "s", lang: "zh", provider: quick }).prepare([{ id: "a", text }]);
  assert.strictEqual(quick.count(), 2);
  assert.strictEqual(line.ms, 3000);
  const slow = make([6, 6, 6]);
  const [kept] = await makeVoice({ audioDir: tmpDir(), style: "s", lang: "zh", provider: slow }).prepare([{ id: "a", text }]);
  assert.strictEqual(slow.count(), 3);
  assert.strictEqual(kept.ms, 6000);
  const english = make([20], words("Open it"));
  await makeVoice({ audioDir: tmpDir(), style: "s", provider: english }).prepare([{ id: "a", text: "Open it" }]);
  assert.strictEqual(english.count(), 1, "only Chinese has a pace floor");
});
