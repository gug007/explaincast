const test = require("node:test");
const assert = require("node:assert");
const { norm, alignWords, onsets, findPhrase, setHeard, Timing } = require("../skills/explaincast/scripts/lib/words");

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

// Whisper's Chinese words: a few characters each, the first with a space.
const heardZh = (...parts) => parts.map((word, i) => ({ word, start: i * 0.5, end: i * 0.5 + 0.4 }));

test("Chinese splits into characters, with English words kept whole", () => {
  assert.deepStrictEqual(norm("打开 Settings 页面。"), ["打", "开", "settings", "页", "面"]);
  assert.deepStrictEqual(norm("点击「保存」，好了！"), ["点", "击", "保", "存", "好", "了"]);
});

test("Chinese numbers read the same written or heard", () => {
  assert.deepStrictEqual(norm("最近30天"), norm("最近三十天"));
  assert.deepStrictEqual(norm("成功率99.9%"), norm("成功率百分之九十九点九"));
  assert.deepStrictEqual(norm("超过500毫秒"), norm("超过五百毫秒"));
  assert.deepStrictEqual(norm("第105个"), norm("第一百零五个"));
  assert.deepStrictEqual(norm("12000次"), norm("一万二千次"));
  assert.deepStrictEqual(norm("两个按钮"), norm("2个按钮"));
  assert.deepStrictEqual(norm("10个"), norm("十个"));
});

test("a Chinese line aligns to Whisper's words, digits and all", () => {
  const { times } = alignWords("这里能看到最近三十天的成功率", heardZh(" 这里", "能看到", "最近", "30天", "的", "成功率"));
  assert.ok(times.every((t) => t != null), `unaligned: ${times}`);
  const mixed = alignWords("打开 Settings 页面", heardZh(" 打开", " Settings", " 页面"));
  assert.deepStrictEqual(mixed.times, [0, 0, 500, 1000, 1000]);
});

test("a misheard Chinese word between two heard ones still counts as spoken", () => {
  const { times } = alignWords("告警就会自动触发，值班同学马上收到", heardZh(" 告警", "就会", "自动", "出发", "值班", "同学", "马上", "收到"));
  assert.ok(times.every((t) => t != null), `unaligned: ${times}`);
  const tail = alignWords("这是电商", heardZh(" 这是", "便商"));
  assert.ok(tail.times.every((t) => t != null), `unaligned: ${tail.times}`);
});

test("a Chinese word the voice dropped is not papered over", () => {
  const { all, times } = alignWords("点击设置按钮", heardZh(" 点击", "按钮"));
  assert.deepStrictEqual(all.filter((_, i) => times[i] == null), ["设", "置"]);
});

test("cues in a Chinese line land on their characters", () => {
  const t = new Timing();
  t.beginLine({ id: "a", text: "先点击右上角的设置按钮", words: heardZh(" 先", "点击", "右上角", "的", "设置", "按钮"), ms: 3500 });
  assert.strictEqual(t.cueMs("设置"), 2000);
  assert.strictEqual(t.cueMs("按钮"), 2500);
  assert.throws(() => t.cueMs("删除"), /not in line "a"/);
});

test("a number Whisper splits over several words is read whole", () => {
  const words = [["是", 2.7], ["99.", 3.26], ["9", 5.08], ["%。", 5.46]].map(([word, start]) => ({ word, start, end: start + 0.3 }));
  const { times } = alignWords("成功率是99.9%。", [{ word: "成功率", start: 2.16, end: 2.7 }, ...words]);
  assert.ok(times.every((t) => t != null), `unaligned: ${times}`);
});

test("an English word Whisper splits inside a Chinese line is read whole", () => {
  const { times } = alignWords("打开 Settings 页面的 SLO 配置", heardZh("打开", "Set", "ting", "s", "页面", "的", "S", "LO", "配置"));
  assert.ok(times.every((t) => t != null), `unaligned: ${times}`);
  const two = alignWords("点 Open Settings 吧", heardZh("点", "Open", " Settings", "吧"));
  assert.ok(two.times.every((t) => t != null), `unaligned: ${two.times}`);
});

test("a Chinese character heard as one that sounds the same aligns by its pinyin", () => {
  // 设 heard as 社 (shè), with an extra 啊 that leaves the gaps unequal.
  const { times } = alignWords("点击设置按钮", heardZh("点击", "社", "啊", "置", "按钮"));
  assert.ok(times.every((t) => t != null), `unaligned: ${times}`);
  // 行 reads xíng or háng: either reading matches.
  const many = alignWords("银行的页面", heardZh("银", "航", "呃", "的", "页面"));
  assert.ok(many.times.every((t) => t != null), `unaligned: ${many.times}`);
});

test("a Chinese line's numbers are written out as they are read", () => {
  const { zhNumbers } = require("../skills/explaincast/scripts/lib/words");
  assert.strictEqual(zhNumbers("成功率要保持在99.9%以上"), "成功率要保持在百分之九十九点九以上");
  assert.strictEqual(zhNumbers("超过500毫秒，最近30天"), "超过五百毫秒，最近三十天");
  assert.strictEqual(zhNumbers("2026年的第2个版本"), "二零二六年的第二个版本");
  assert.deepStrictEqual(norm("2026年"), norm("二零二六年"));
});
