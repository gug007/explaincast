const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { makeVoice, narratorOf, mapLimit } = require("../skills/explaincast/scripts/lib/voice");
const { post } = require("../skills/explaincast/scripts/lib/openai");
const { wav } = require("../skills/explaincast/scripts/lib/local");

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test("mapLimit keeps the items' order and runs no more than its limit at once", async () => {
  let running = 0;
  let most = 0;
  const out = await mapLimit([30, 5, 20, 1, 10, 2], 3, async (ms, i) => {
    most = Math.max(most, ++running);
    await tick(ms);
    running--;
    return i;
  });
  assert.deepStrictEqual(out, [0, 1, 2, 3, 4, 5]);
  assert.strictEqual(most, 3);
});

test("after a failure mapLimit starts nothing new, lets the running items finish, then throws the first error", async () => {
  const started = [];
  const finished = [];
  await assert.rejects(
    mapLimit(["slow", "boom", "c", "d"], 2, async (x) => {
      started.push(x);
      await tick(x === "slow" ? 40 : 5);
      if (x === "boom") throw new Error("boom");
      finished.push(x);
    }),
    /boom/,
  );
  assert.deepStrictEqual(started, ["slow", "boom"]);
  assert.deepStrictEqual(finished, ["slow"]);
});

test("mapLimit over nothing is nothing", async () => {
  assert.deepStrictEqual(await mapLimit([], 4, async () => 1), []);
});

function stubFetch(replies) {
  const real = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    const [status, body, headers] = replies.shift();
    return new Response(body, { status, headers });
  };
  return { calls, restore: () => (global.fetch = real) };
}

test("post tries a rate-limited call again and returns the reply that follows", async (t) => {
  const f = stubFetch([[429, '{"error":{"code":"rate_limit_exceeded"}}', { "retry-after": "0" }], [200, "ok"]]);
  t.after(f.restore);
  t.mock.method(console, "log", () => {});
  const res = await post("https://api.test/x", {}, "tts a", { waitMs: () => 0 });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(f.calls.length, 2);
});

test("post returns an account out of credit at once, with its body still readable", async (t) => {
  const f = stubFetch([[429, '{"error":{"code":"insufficient_quota"}}']]);
  t.after(f.restore);
  const res = await post("https://api.test/x", {}, "tts a", { waitMs: () => 0 });
  assert.strictEqual(res.status, 429);
  assert.strictEqual(f.calls.length, 1);
  assert.match(await res.text(), /insufficient_quota/);
});

test("post gives up after three tries and returns the last reply", async (t) => {
  const f = stubFetch([[503, "busy"], [503, "busy"], [503, "still busy"]]);
  t.after(f.restore);
  t.mock.method(console, "log", () => {});
  const res = await post("https://api.test/x", {}, "tts a", { waitMs: () => 0 });
  assert.strictEqual(await res.text(), "still busy");
  assert.strictEqual(f.calls.length, 3);
});

function tmpVoice(t) {
  const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-voice-"));
  t.after(() => fs.rmSync(audioDir, { recursive: true, force: true }));
  return makeVoice({ audioDir, voice: "marin", style: "plain" });
}

test("a dry run estimates every unspoken line, in the narration's order", async (t) => {
  const lines = await tmpVoice(t).prepare(
    [
      { id: "title", text: "One two three four." },
      { id: "pause", ms: 1200 },
      { id: "first", text: "One two." },
    ],
    { dry: true },
  );
  assert.deepStrictEqual(lines.map((l) => [l.id, l.ms, !!l.silent]), [
    ["title", 4 * 370 + 500, false],
    ["pause", 1200, true],
    ["first", 2 * 370 + 500, false],
  ]);
});

test("two lines with one id stop the run before anything is voiced", async (t) => {
  await assert.rejects(
    tmpVoice(t).prepare([{ id: "a", text: "One." }, { id: "a", text: "Two." }], { dry: true }),
    /"a" is used twice/,
  );
});

const who = (opts) => {
  const { engine, voice, kept } = narratorOf({ env: {}, ...opts });
  return [engine.name, voice, !!kept];
};

test("a video with no voice named is spoken by the local voice, or by EXPLAINCAST_VOICE", () => {
  assert.deepStrictEqual(who(), ["local", "af_heart", false]);
  assert.deepStrictEqual(who({ env: { EXPLAINCAST_VOICE: "openai" } }), ["openai", "marin", false]);
  assert.deepStrictEqual(who({ voice: "local", env: { EXPLAINCAST_VOICE: "openai" } }), ["local", "af_heart", false]);
});

test("voice names an engine, one of its voices, or both", () => {
  assert.deepStrictEqual(who({ voice: "openai" }), ["openai", "marin", false]);
  assert.deepStrictEqual(who({ voice: "cloud" }), ["openai", "marin", false]);
  assert.deepStrictEqual(who({ voice: "cedar" }), ["openai", "cedar", false]);
  assert.deepStrictEqual(who({ voice: "bm_george" }), ["local", "bm_george", false]);
  assert.deepStrictEqual(who({ voice: "openai/cedar" }), ["openai", "cedar", false]);
  assert.deepStrictEqual(who({ voice: "local/am_michael" }), ["local", "am_michael", false]);
  assert.throws(() => who({ voice: "elsewhere/cedar" }), /"voice" is "local", "openai"/);
  assert.throws(() => who({ voice: "openai/cedar/fast" }), /got "openai\/cedar\/fast"/);
});

test("a video already voiced keeps its narrator until video.json names one or --respeak starts over", (t) => {
  const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-voice-"));
  t.after(() => fs.rmSync(audioDir, { recursive: true, force: true }));
  assert.deepStrictEqual(who({ audioDir }), ["local", "af_heart", false]);
  fs.writeFileSync(path.join(audioDir, "intro.txt"), "gpt-4o-mini-tts/cedar@1.1\nplain\nHello.");
  assert.deepStrictEqual(who({ audioDir }), ["openai", "cedar", true]);
  assert.deepStrictEqual(who({ audioDir, respeak: true }), ["local", "af_heart", false]);
  assert.deepStrictEqual(who({ audioDir, voice: "local" }), ["local", "af_heart", false]);
  fs.writeFileSync(path.join(audioDir, "intro.txt"), "kokoro-82m/am_michael\n\nHello.");
  assert.deepStrictEqual(who({ audioDir, env: { EXPLAINCAST_VOICE: "openai" } }), ["local", "am_michael", true]);
  fs.writeFileSync(path.join(audioDir, "intro.txt"), "kokoro-82m/af_heart\n\nHello.");
  assert.deepStrictEqual(who({ audioDir }), ["local", "af_heart", false]);
});

test("the local voice stops at a line it cannot say, before anything is voiced", async (t) => {
  const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-voice-"));
  t.after(() => fs.rmSync(audioDir, { recursive: true, force: true }));
  const voice = makeVoice({ audioDir, env: {} });
  assert.deepStrictEqual(voice.narrator, { engine: "local", voice: "af_heart", kept: false });
  await assert.rejects(voice.prepare([{ id: "a", text: "Open the café menu." }, { id: "b", text: "Всё готово." }], { dry: true }), /line "b": the local voice speaks English only/);
  const lines = await voice.prepare([{ id: "a", text: "Open the café menu." }], { dry: true });
  assert.strictEqual(lines[0].ms, 4 * 370 + 500);
});

test("the cloud voice speaks a line through OpenAI once, and keeps its clip, stamp and words", async (t) => {
  const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-voice-"));
  const real = { fetch: global.fetch, key: process.env.OPENAI_API_KEY };
  t.after(() => {
    fs.rmSync(audioDir, { recursive: true, force: true });
    global.fetch = real.fetch;
    if (real.key == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = real.key;
  });
  t.mock.method(console, "log", () => {});
  process.env.OPENAI_API_KEY = "sk-test";
  const calls = [];
  const heard = [{ word: "Save", start: 0, end: 0.2 }, { word: "it", start: 0.2, end: 0.3 }, { word: "now.", start: 0.3, end: 0.5 }];
  global.fetch = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization, body: typeof init.body === "string" ? JSON.parse(init.body) : null });
    return url.endsWith("/speech") ? new Response(wav(new Float32Array(12000).fill(0.1))) : new Response(JSON.stringify({ words: heard }));
  };
  const narration = [{ id: "a", text: "Save *it* now." }];
  const voice = makeVoice({ audioDir, voice: "openai", style: "plain", env: {} });
  assert.deepStrictEqual(voice.narrator, { engine: "openai", voice: "marin", kept: false });
  const [line] = await voice.prepare(narration);
  assert.deepStrictEqual([line.ms, line.words], [500, heard]);
  assert.deepStrictEqual(calls.map((c) => c.url), ["https://api.openai.com/v1/audio/speech", "https://api.openai.com/v1/audio/transcriptions"]);
  assert.deepStrictEqual(calls[0], { url: calls[0].url, auth: "Bearer sk-test", body: { model: "gpt-4o-mini-tts", voice: "marin", input: "Save it now.", instructions: "plain", response_format: "wav" } });
  assert.strictEqual(fs.readFileSync(path.join(audioDir, "a.txt"), "utf8"), "gpt-4o-mini-tts/marin\nplain\nSave it now.");
  await makeVoice({ audioDir, style: "plain", env: {} }).prepare(narration);
  assert.strictEqual(calls.length, 2);
});
