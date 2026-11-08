const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const NEW = path.join(__dirname, "../skills/explaincast/scripts/new.js");
const make = (...args) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "new-test-"));
  const dir = execFileSync(process.execPath, [NEW, ...args], { encoding: "utf8", cwd: root, env: { ...process.env, EXPLAINCAST_DIR: root } }).trim().split("\n").at(-1);
  return { dir, video: JSON.parse(fs.readFileSync(path.join(dir, "video.json"), "utf8")) };
};

test("a Chinese title gets a pinyin slug and Chinese placeholders", () => {
  const { dir, video } = make("订单管理 Settings 演示", "--file", "page.html", "--for", "me", "--lang", "zh", "--tts", "qwen");
  assert.strictEqual(path.basename(dir), "ding-dan-guan-li-settings-yan-shi");
  assert.strictEqual(video.lang, "zh");
  assert.strictEqual(video.tts, "qwen");
  assert.match(video.narration[0].text, /^TODO：/);
});

test("an English title keeps its slug and placeholders", () => {
  const { dir, video } = make("Set up Single Sign-On", "--url", "http://localhost", "--for", "me");
  assert.strictEqual(path.basename(dir), "set-up-single-sign-on");
  assert.strictEqual(video.lang, undefined);
  assert.match(video.narration[0].text, /^TODO: the first step/);
});
