const test = require("node:test");
const assert = require("node:assert");
const { buildCues, toSrt, wrap } = require("../skills/explaincast/scripts/lib/captions");
const { chapters } = require("../skills/explaincast/scripts/lib/chapters");

const words = (text, step = 280) => text.split(" ").map((word, i) => ({ word, start: (i * step) / 1000, end: (i * step + 240) / 1000 }));

const lines = [
  { id: "title", text: "Multiple Claude Code accounts in acme.", words: words("Multiple cloud code accounts in ACME."), ms: 2400 },
  {
    id: "limit",
    text: "Down in the sidebar, your main Claude login has already used almost all of its weekly limit, so add a second one.",
    words: words("Down in the sidebar, your main cloud login has already used almost all of its weekly limit, so add a second one."),
    ms: 6400,
  },
  { id: "outro", silent: true, ms: 3200 },
];
const timeline = {
  totalMs: 16000,
  lines: [
    { id: "title", startMs: 500, ms: 2400 },
    { id: "limit", startMs: 3400, ms: 6400 },
    { id: "outro", startMs: 12800, ms: 3200 },
  ],
};

test("captions carry the script's words, not what speech recognition heard", () => {
  const cues = buildCues(timeline, lines);
  const text = cues.map((c) => c.text).join(" ");
  assert.match(text, /Claude Code/);
  assert.match(text, /acme\./);
  assert.doesNotMatch(text, /cloud|LPM/);
});

test("cues are ordered, never overlap, and fit two 42-character lines", () => {
  const cues = buildCues(timeline, lines);
  cues.forEach((c, i) => {
    assert.ok(c.endMs > c.startMs);
    if (i) assert.ok(c.startMs >= cues[i - 1].endMs);
    for (const l of c.text.split("\n")) assert.ok(l.length <= 42, l);
    assert.ok(c.text.split("\n").length <= 2);
  });
  assert.strictEqual(cues[0].startMs, 500);
  assert.ok(cues.at(-1).endMs <= 12800);
});

test("SRT numbering and clock format", () => {
  const srt = toSrt([{ startMs: 500, endMs: 3661001, text: "a\nb" }]);
  assert.strictEqual(srt, "1\n00:00:00,500 --> 01:01:01,001\na\nb\n");
  assert.strictEqual(wrap("short"), "short");
});

test("chapters start at 0:00, come from cards and lines, and flag YouTube's limits", () => {
  const t = {
    totalMs: 90000,
    cards: [
      { title: "Video", startMs: 500, ms: 3000, first: true },
      { title: "Second part", startMs: 30000, ms: 2000 },
      { title: "example.com", startMs: 86000, ms: 3200, hold: true },
    ],
    lines: [
      { id: "a", startMs: 500, ms: 3000 },
      { id: "b", startMs: 30000, ms: 3000 },
      { id: "c", startMs: 60000, ms: 3000 },
      { id: "d", startMs: 84000, ms: 2000 },
      { id: "outro", startMs: 86000, ms: 3200 },
    ],
  };
  const video = { narration: [{ id: "a", text: "x" }, { id: "b", text: "x" }, { id: "c", text: "x", chapter: "Third part" }, { id: "d", text: "x", chapter: "Too short" }, { id: "outro" }] };
  const { list, problems } = chapters(t, video);
  assert.deepStrictEqual(list.map((c) => [c.ms, c.name]), [[0, "Intro"], [30000, "Second part"], [60000, "Third part"], [84000, "Too short"]]);
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /"Too short" lasts 2\.0 s/);
});

test("a Chinese video's unnamed opening chapter has a Chinese name", () => {
  const t = { totalMs: 40000, cards: [], lines: [{ id: "a", startMs: 500, ms: 3000 }, { id: "b", startMs: 20000, ms: 3000 }] };
  const video = { lang: "zh", narration: [{ id: "a", text: "x" }, { id: "b", text: "x", chapter: "看幻灯片" }] };
  assert.strictEqual(chapters(t, video).list[0].name, "开场");
});

test("captions never break inside a name or a label, and a short tail joins the cue before", () => {
  assert.strictEqual(wrap("But on cellular, or on another Wi-Fi, the app can't reach it."), "But on cellular, or on another Wi-Fi,\nthe app can't reach it.");
  assert.doesNotMatch(wrap("Now the iPhone. Open the app and tap Set up Built-in Tailscale."), /(the|Set|Built-in)\n/);
  const text = "Your Mac shows up under On this Wi-Fi, so tap it.";
  const cues = buildCues({ totalMs: 6000, lines: [{ id: "pick", startMs: 0, ms: 4000 }] }, [{ id: "pick", text, words: words(text), ms: 4000 }]);
  assert.strictEqual(cues.length, 1);
});

test("a chapter starts on the second nearer its line, never on the tail of the line before", () => {
  const t = {
    totalMs: 120000,
    cards: [],
    lines: [
      { id: "a", startMs: 500, ms: 3000 },
      { id: "b", startMs: 60000, ms: 14200 },
      { id: "c", startMs: 74998, ms: 3000 },
      { id: "d", startMs: 100300, ms: 3000 },
    ],
  };
  const video = { narration: [{ id: "a", text: "x" }, { id: "b", text: "x", chapter: "B" }, { id: "c", text: "x", chapter: "C" }, { id: "d", text: "x", chapter: "D" }] };
  assert.deepStrictEqual(chapters(t, video).list.map((c) => c.ms), [0, 60000, 75000, 100000]);
});

// Whisper's Chinese words, a character each (an English word whole).
const heardZh = (text, step = 220) => (text.match(/\p{Script=Han}|[A-Za-z0-9.]+/gu) || []).map((word, i) => ({ word, start: (i * step) / 1000, end: (i * step + 180) / 1000 }));
const width = (s) => [...s].reduce((n, c) => n + (/[\p{Script=Han}　-〿＀-￯]/u.test(c) ? 2 : 1), 0);
const zhCues = (text) => {
  const w = heardZh(text);
  const ms = w.length * 220 + 300;
  return buildCues({ totalMs: ms + 1000, lines: [{ id: "a", startMs: 0, ms }] }, [{ id: "a", text, words: w, ms }]);
};

test("Chinese captions are the script as written, with no spaces added or lost", () => {
  const text = "打开 Settings 页面，找到电商的 SLO 配置。最近30天的成功率是99.9%。";
  const cues = zhCues(text);
  assert.strictEqual(cues.map((c) => c.text.replace(/\n/g, "")).join(""), text.replace(/(?<=[。，]) /g, ""));
  assert.match(cues[0].text, /打开 Settings 页面/);
});

test("a Chinese cue ends on its sentence and fits two lines of 21 characters", () => {
  // The first sentence fits a cue's 6 s; a longer one would split at a comma.
  const text = "先点击右上角的设置按钮，然后在菜单里找到订单管理。这里能看到最近三十天的全部订单和它们的成功率。";
  const cues = zhCues(text);
  assert.ok(cues.length >= 2);
  assert.ok(cues[0].text.replace(/\n/g, "").endsWith("。"), cues[0].text);
  for (const c of cues) {
    assert.ok(c.text.split("\n").length <= 2, c.text);
    for (const l of c.text.split("\n")) assert.ok(width(l) <= 42, `${width(l)}: ${l}`);
  }
});

test("a Chinese caption line breaks after its punctuation, never before it or inside an English word", () => {
  assert.strictEqual(wrap("先点击右上角的设置按钮，在弹出的菜单里找到订单管理"), "先点击右上角的设置按钮，\n在弹出的菜单里找到订单管理");
  assert.doesNotMatch(wrap("然后打开它。这里能看到最近三十天的全部订单和它们的成功率。"), /三十\n天/);
  for (const t of ["在左边的导航栏里找到 Notifications 设置然后打开它的详细选项", "这一页显示的是最近三十天所有订单的成功率和平均延迟数据"]) {
    const lines = wrap(t).split("\n");
    assert.strictEqual(lines.length, 2, t);
    assert.ok(lines.every((l) => width(l) <= 42 && !/^[，。、；：！？]/.test(l)), lines.join(" / "));
    assert.ok(!/[A-Za-z]$/.test(lines[0]) || !/^[A-Za-z]/.test(lines[1]), lines.join(" / "));
  }
});
