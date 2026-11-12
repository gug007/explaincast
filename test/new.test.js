const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { checkVideo } = require("../skills/explaincast/scripts/lib/lint");

const NEW = path.join(__dirname, "../skills/explaincast/scripts/new.js");

// Runs new.js in `root` (a fresh temp folder, removed after the test) and returns the video's folder.
function scaffold(t, args, root) {
  if (!root) {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-new-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  }
  const out = execFileSync(process.execPath, [NEW, ...args], { cwd: root, env: { ...process.env, EXPLAINCAST_DIR: root }, encoding: "utf8" });
  return { root, dir: out.trim().split("\n").pop(), out };
}

const load = (dir) => {
  const file = path.join(dir, "beats.js");
  delete require.cache[file];
  return { video: JSON.parse(fs.readFileSync(path.join(dir, "video.json"), "utf8")), beats: require(file) };
};

const IDEA = ["--file", "page.html", "--for", "me"];

test("an idea video starts from a page of screens, with the kit beside it, and is refused until its placeholders are gone", (t) => {
  const { dir, out } = scaffold(t, ["How <caching> works", ...IDEA]);
  const page = fs.readFileSync(path.join(dir, "page.html"), "utf8");
  assert.match(page, /<title>How &lt;caching&gt; works<\/title>/);
  assert.match(page, /idea\/stage\.js/);
  for (const f of ["stage.css", "stage.js", "LICENSE-lucide.txt"]) assert.ok(fs.existsSync(path.join(dir, "idea", f)), f);
  assert.match(page, /class="screen product"/);
  assert.match(out, /a starter page of screens/);
  const { video, beats } = load(dir);
  assert.deepStrictEqual(video.target, { type: "web", file: "page.html", cursor: false });
  assert.match(beats.first.toString(), /go\(s, "first"\)/);
  const { errors } = checkVideo(video, beats, { dir });
  assert.ok(errors.includes("the page page.html still has a TODO placeholder"), errors.join("\n"));
});

test("a page that is already there is left alone", (t) => {
  const { root, dir } = scaffold(t, ["How caching works", ...IDEA]);
  fs.writeFileSync(path.join(dir, "page.html"), "<p>mine</p>");
  fs.rmSync(path.join(dir, "idea"), { recursive: true });
  scaffold(t, ["How caching works", ...IDEA, "--force"], root);
  assert.strictEqual(fs.readFileSync(path.join(dir, "page.html"), "utf8"), "<p>mine</p>");
  assert.ok(!fs.existsSync(path.join(dir, "idea")));
});

test("a page that loads a missing local file is an error; a TODO outside the kit is the page's own business", (t) => {
  const { dir } = scaffold(t, ["How caching works", ...IDEA]);
  fs.writeFileSync(path.join(dir, "page.html"), '<link rel="stylesheet" href="idea/stage.css"><script src="lib/missing.js"></script><script src="https://cdn.example.com/x.js"></script><a href="#top">TODO board</a>');
  const { video, beats } = load(dir);
  const { errors } = checkVideo(video, beats, { dir });
  assert.ok(errors.includes("the page page.html loads lib/missing.js, which is not there"), errors.join("\n"));
  assert.ok(!errors.some((e) => /stage\.css|cdn\.example|#top|page\.html still has/.test(e)), errors.join("\n"));
});

test("a project's look reaches video.json with its files named from the project", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-new-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, ".explaincast.json"), JSON.stringify({ for: "client", look: { canvas: "#0e2a3c", ink: "#ffffff", font: "brand/Sans-Bold.woff2", logo: "brand/logo.svg" } }));
  const { dir } = scaffold(t, ["Checkout", "--url", "http://localhost:3000"], root);
  const { video } = load(dir);
  assert.strictEqual(video.for, "client");
  assert.deepStrictEqual(video.look, { canvas: "#0e2a3c", ink: "#ffffff", font: path.join(root, "brand/Sans-Bold.woff2"), logo: path.join(root, "brand/logo.svg") });
  fs.writeFileSync(path.join(root, ".explaincast.json"), JSON.stringify({ look: { font: "Avenir Next" } }));
  const named = scaffold(t, ["Checkout", "--url", "http://localhost:3000", "--force"], root);
  assert.deepStrictEqual(load(named.dir).video.look, { font: "Avenir Next" }, "an installed font's name is no path");
});

test("a web or app video gets no page", (t) => {
  const { dir } = scaffold(t, ["Checkout", "--url", "http://localhost:3000", "--for", "me"]);
  assert.ok(!fs.existsSync(path.join(dir, "idea")));
  assert.doesNotMatch(fs.readFileSync(path.join(dir, "beats.js"), "utf8"), /window\.go/);
});

test("a project's web clock and mock reach a video that names its own URL, with the mock's files named from the project", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-new-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mock = { "**/api/user": "fixtures/user.json", "**/api/plan": { name: "Team" } };
  fs.writeFileSync(path.join(root, ".explaincast.json"), JSON.stringify({ for: "me", target: { type: "web", url: "http://localhost:3000", clock: "2026-03-14T10:00", mock } }));
  const want = { clock: "2026-03-14T10:00", mock: { "**/api/user": path.join(root, "fixtures/user.json"), "**/api/plan": { name: "Team" } } };
  assert.deepStrictEqual(load(scaffold(t, ["Checkout"], root).dir).video.target, { type: "web", url: "http://localhost:3000", ...want });
  assert.deepStrictEqual(load(scaffold(t, ["Settings", "--url", "http://localhost:3000/settings"], root).dir).video.target, { type: "web", url: "http://localhost:3000/settings", ...want });
  assert.deepStrictEqual(load(scaffold(t, ["Notes", "--app", "Notes"], root).dir).video.target, { type: "window", app: "Notes" });
});
