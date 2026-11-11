const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { makeVoice, mapLimit, post } = require("../skills/explaincast/scripts/lib/voice");

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
