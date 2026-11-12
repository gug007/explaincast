#!/usr/bin/env node
// new.js "<title>" (--url <url> | --file <page.html> | --app <name>) [--for public|client|me]
//        [--slug <slug>] [--card "<short title>"] [--brand "<closing card>"] [--force]
// Starts ~/Movies/explaincast/<slug>/ (EXPLAINCAST_DIR) with video.json and
// beats.js, and for an idea a starter page of the product's own screens, with
// the kit beside it in idea/.
// The nearest .explaincast.json up from the current folder supplies the
// project's defaults: target, for, brand, look, hide, pronounce, heard, voice,
// style.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseArgs } = require("util");
const { AUDIENCES } = require("./lib/audience");
const { isFontFile } = require("./lib/look");
const { mockFrom } = require("./lib/fixtures");

const USAGE = 'usage: new.js "<title>" (--url <url> | --file <page.html> | --app <name>) [--for public|client|me] [--slug <slug>] [--card "<short title>"] [--brand "<closing card>"] [--force]';
const DEFAULT_KEYS = ["target", "for", "brand", "look", "hide", "pronounce", "heard", "voice", "style"];
const MAX_SLUG = 60;
const KIT = path.join(__dirname, "..", "idea");
const KIT_FILES = ["stage.css", "stage.js", "LICENSE-lucide.txt"];

function fail(message) {
  console.error(message);
  process.exit(2);
}

// The look's font and logo are named from the project's folder, and the video
// folder is elsewhere, so they are written into video.json as absolute paths.
function lookFrom(look, dir) {
  if (!look || typeof look !== "object" || Array.isArray(look)) return look;
  const files = { ...look };
  const local = (v) => typeof v === "string" && v.trim() && !path.isAbsolute(v);
  if (local(files.font) && isFontFile(files.font)) files.font = path.resolve(dir, files.font);
  if (local(files.logo)) files.logo = path.resolve(dir, files.logo);
  return files;
}

function projectDefaults(from = process.cwd()) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const file = path.join(dir, ".explaincast.json");
    if (fs.existsSync(file)) {
      const all = JSON.parse(fs.readFileSync(file, "utf8"));
      console.log(`defaults from ${file}`);
      const picked = Object.fromEntries(DEFAULT_KEYS.filter((k) => k in all).map((k) => [k, all[k]]));
      if (picked.look) picked.look = lookFrom(picked.look, dir);
      if (picked.target?.mock) picked.target = { ...picked.target, mock: mockFrom(picked.target.mock, dir) };
      return picked;
    }
    if (dir === path.dirname(dir)) return {};
  }
}

function slugOf(title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-") || "video";
  return slug.length <= MAX_SLUG ? slug : slug.slice(0, Math.max(slug.lastIndexOf("-", MAX_SLUG), 1));
}

const { values: o, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: { for: { type: "string" }, url: { type: "string" }, file: { type: "string" }, app: { type: "string" }, slug: { type: "string" }, card: { type: "string" }, brand: { type: "string" }, force: { type: "boolean" } },
  allowPositionals: true,
});
const title = positionals[0];
if (!title) fail(USAGE);
const defaults = projectDefaults();
// A project's web "clock" and "mock" stay with a video that names its own URL.
const fixed = ({ type, clock, mock } = {}) => (type === "web" ? { ...(clock != null && { clock }), ...(mock != null && { mock }) } : {});
const target = o.url ? { type: "web", url: o.url, ...fixed(defaults.target) } : o.file ? { type: "web", file: o.file, cursor: false } : o.app ? { type: "window", app: o.app } : defaults.target;
if (!target) fail(`what does the video show?\n${USAGE}`);
const audience = o.for || defaults.for || "public";
if (!AUDIENCES[audience]) fail(`--for is ${Object.keys(AUDIENCES).join(", ")}`);

const ROOT = process.env.EXPLAINCAST_DIR || path.join(os.homedir(), "Movies/explaincast");
const dir = path.join(ROOT, o.slug || slugOf(title));
if (fs.existsSync(dir) && !o.force) fail(`${dir} exists; pass --force to rewrite its video.json and beats.js`);

const { cards } = AUDIENCES[audience];
const brand = o.brand || defaults.brand;
const idea = !!target.file;
const narration = [
  ...(cards ? [{ id: "title", text: `${title}. TODO: one sentence on what this video shows.` }] : []),
  { id: "first", text: idea ? "TODO: the first step of the idea." : "TODO: the first step, naming the control before the click lands on it." },
  ...(cards ? [{ id: "wrap", text: "TODO: what the viewer can do now." }] : []),
  ...(cards && brand ? [{ id: "outro", ms: 3200 }] : []),
];
const video = {
  ...defaults,
  title,
  for: audience,
  target,
  ...(brand && { brand }),
  narration,
  ...(audience === "public" && { youtube: { hook: ["TODO: what the video shows.", "TODO: who it is for."], learn: ["TODO"], tags: ["TODO"] } }),
};
const beat = (id, body) => `  async ${id}(s) {\n    ${body}\n  },\n`;
const beats = [
  `// ${title}. Every call a beat can make: the skill's reference/beats.md${idea ? "; the page's: reference/idea-pages.md" : ""}.\n`,
  ...(idea ? ["// go() runs a step of the page; the take checks the page itself at the end of every line.\nconst go = (s, step) => s.page.evaluate((k) => window.go(k), step);\n"] : []),
  "module.exports = {\n",
  ...(cards ? [beat("title", `await s.card(${JSON.stringify(o.card || title)});`)] : []),
  beat("first", idea ? 'await s.at("TODO word");\n    await go(s, "first");' : 'await s.click("TODO selector", { cue: "TODO word" });'),
  ...(cards ? [beat("wrap", "await s.hold(0);")] : []),
  ...(cards && brand ? [beat("outro", `await s.card(${JSON.stringify(brand)}, { hold: true });`)] : []),
  "};\n",
].join("");

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "video.json"), `${JSON.stringify(video, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "beats.js"), beats);
// A page that is already there is the user's: only a new one gets the starter and the kit.
const page = idea && path.resolve(dir, target.file);
if (page && !fs.existsSync(page)) {
  const kit = path.join(path.dirname(page), "idea");
  fs.mkdirSync(kit, { recursive: true });
  for (const f of KIT_FILES) fs.copyFileSync(path.join(KIT, f), path.join(kit, f));
  const html = fs.readFileSync(path.join(KIT, "page.html"), "utf8").replaceAll("{{title}}", title.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]));
  fs.writeFileSync(page, html);
  console.log(`page ${page}: a starter page of screens; build on it (reference/idea-pages.md)`);
}
console.log(dir);
