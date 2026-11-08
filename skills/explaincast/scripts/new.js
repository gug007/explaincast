#!/usr/bin/env node
// new.js "<title>" (--url <url> | --file <page.html> | --app <name>) [--for public|client|me]
//        [--slug <slug>] [--card "<short title>"] [--brand "<closing card>"] [--lang en|zh] [--tts openai|qwen] [--force]
// Starts ~/Movies/explaincast/<slug>/ (EXPLAINCAST_DIR) with video.json and
// beats.js. The nearest .explaincast.json up from the current folder supplies
// the project's defaults: target, for, brand, hide, pronounce, heard, voice, style, tts, lang.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseArgs } = require("util");
const { AUDIENCES } = require("./lib/audience");

const USAGE = 'usage: new.js "<title>" (--url <url> | --file <page.html> | --app <name>) [--for public|client|me] [--slug <slug>] [--card "<short title>"] [--brand "<closing card>"] [--lang en|zh] [--tts openai|qwen] [--force]';
const DEFAULT_KEYS = ["target", "for", "brand", "hide", "pronounce", "heard", "voice", "style", "tts", "lang"];
const MAX_SLUG = 60;

function fail(message) {
  console.error(message);
  process.exit(2);
}

function projectDefaults(from = process.cwd()) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const file = path.join(dir, ".explaincast.json");
    if (fs.existsSync(file)) {
      const all = JSON.parse(fs.readFileSync(file, "utf8"));
      console.log(`defaults from ${file}`);
      return Object.fromEntries(DEFAULT_KEYS.filter((k) => k in all).map((k) => [k, all[k]]));
    }
    if (dir === path.dirname(dir)) return {};
  }
}

// A Chinese title's slug is its pinyin: 订单管理 → ding-dan-guan-li.
function slugOf(title) {
  if (/\p{Script=Han}/u.test(title)) title = require("pinyin-pro").pinyin(title, { toneType: "none", nonZh: "consecutive" });
  const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-") || "video";
  return slug.length <= MAX_SLUG ? slug : slug.slice(0, Math.max(slug.lastIndexOf("-", MAX_SLUG), 1));
}

const { values: o, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: { for: { type: "string" }, url: { type: "string" }, file: { type: "string" }, app: { type: "string" }, slug: { type: "string" }, card: { type: "string" }, brand: { type: "string" }, lang: { type: "string" }, tts: { type: "string" }, force: { type: "boolean" } },
  allowPositionals: true,
});
const title = positionals[0];
if (!title) fail(USAGE);
const defaults = projectDefaults();
const target = o.url ? { type: "web", url: o.url } : o.file ? { type: "web", file: o.file } : o.app ? { type: "window", app: o.app } : defaults.target;
if (!target) fail(`what does the video show?\n${USAGE}`);
const audience = o.for || defaults.for || "public";
if (!AUDIENCES[audience]) fail(`--for is ${Object.keys(AUDIENCES).join(", ")}`);

const ROOT = process.env.EXPLAINCAST_DIR || path.join(os.homedir(), "Movies/explaincast");
const dir = path.join(ROOT, o.slug || slugOf(title));
if (fs.existsSync(dir) && !o.force) fail(`${dir} exists; pass --force to rewrite its video.json and beats.js`);

const { cards } = AUDIENCES[audience];
const brand = o.brand || defaults.brand;
const idea = !!target.file;
const lang = o.lang || defaults.lang;
const tts = o.tts || defaults.tts;
const TODO = {
  en: { title: `${title}. TODO: one sentence on what this video shows.`, idea: "TODO: the first step of the idea.", first: "TODO: the first step, naming the control before the click lands on it.", wrap: "TODO: what the viewer can do now.", hook: ["TODO: what the video shows.", "TODO: who it is for."] },
  zh: { title: `${title}。TODO：一句话说明这个视频展示什么。`, idea: "TODO：这个想法的第一步。", first: "TODO：第一步，先说出控件的名字，点击再落到它上面。", wrap: "TODO：看完之后观众能做什么。", hook: ["TODO：视频展示什么。", "TODO：适合谁看。"] },
}[lang === "zh" ? "zh" : "en"];
const narration = [
  ...(cards ? [{ id: "title", text: TODO.title }] : []),
  { id: "first", text: idea ? TODO.idea : TODO.first },
  ...(cards ? [{ id: "wrap", text: TODO.wrap }] : []),
  ...(cards && brand ? [{ id: "outro", ms: 3200 }] : []),
];
const video = {
  ...defaults,
  title,
  for: audience,
  target,
  ...(brand && { brand }),
  ...(lang && { lang }),
  ...(tts && { tts }),
  narration,
  ...(audience === "public" && { youtube: { hook: TODO.hook, learn: ["TODO"], tags: ["TODO"] } }),
};
const beat = (id, body) => `  async ${id}(s) {\n    ${body}\n  },\n`;
const beats = [
  `// ${title}. Every call a beat can make: the skill's reference/beats.md.\n`,
  "module.exports = {\n",
  ...(cards ? [beat("title", `await s.card(${JSON.stringify(o.card || title)});`)] : []),
  beat("first", idea ? 'await s.at("TODO word");\n    await s.page.evaluate(() => {});' : 'await s.click("TODO selector", { cue: "TODO word" });'),
  ...(cards ? [beat("wrap", "await s.hold(0);")] : []),
  ...(cards && brand ? [beat("outro", `await s.card(${JSON.stringify(brand)}, { hold: true });`)] : []),
  "};\n",
].join("");

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "video.json"), `${JSON.stringify(video, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "beats.js"), beats);
console.log(dir);
