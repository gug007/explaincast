const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { mockRoutes, mockFrom, fixtureProblems } = require("../skills/explaincast/scripts/lib/fixtures");

const web = (more) => ({ type: "web", url: "http://localhost:3000", ...more });

test("mock routes are added last to first, so the first pattern listed wins; a string is a file, anything else JSON", () => {
  const routes = mockRoutes({ "**/api/user/1": "fixtures/one.json", "**/api/user/*": { name: "Ada" }, "**/api/off": false, "**/abs": "/tmp/x.json" }, "/videos/demo");
  assert.deepStrictEqual(routes, [
    ["**/abs", { path: "/tmp/x.json" }],
    ["**/api/off", { json: false }],
    ["**/api/user/*", { json: { name: "Ada" } }],
    ["**/api/user/1", { path: "/videos/demo/fixtures/one.json" }],
  ]);
  assert.deepStrictEqual(mockRoutes(undefined, "/videos/demo"), []);
});

test("a project's mock files are named from the project's folder; JSON and absolute paths stay as they are", () => {
  assert.deepStrictEqual(mockFrom({ "**/a": "fixtures/a.json", "**/b": { ok: true }, "**/c": "/srv/c.json" }, "/work/app"), {
    "**/a": "/work/app/fixtures/a.json",
    "**/b": { ok: true },
    "**/c": "/srv/c.json",
  });
  assert.strictEqual(mockFrom(undefined, "/work/app"), undefined);
});

test("clock and mock are checked: a web target only, a real date, a map of patterns, files that are there", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explaincast-fixtures-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "fixtures"));
  fs.writeFileSync(path.join(dir, "fixtures/user.json"), "{}");

  assert.deepStrictEqual(fixtureProblems(web(), dir), []);
  assert.deepStrictEqual(fixtureProblems(web({ clock: "2026-03-14T10:00", mock: { "**/api/user": "fixtures/user.json", "**/api/plan": { name: "Team" } } }), dir), []);
  assert.deepStrictEqual(fixtureProblems(web({ clock: 1773482400000 }), dir), []);
  assert.deepStrictEqual(fixtureProblems({ type: "window", app: "Notes", clock: "2026-03-14" }), ['"clock" and "mock" work on a web target only']);
  assert.match(fixtureProblems(web({ clock: "next tuesday" }))[0], /"clock" is a date and time/);
  assert.match(fixtureProblems(web({ clock: true }))[0], /"clock" is a date and time/);
  assert.match(fixtureProblems(web({ mock: ["**/api"] }))[0], /maps URL patterns/);
  assert.deepStrictEqual(fixtureProblems(web({ mock: { "**/api/team": "fixtures/team.json" } }), dir), ['mock "**/api/team": the file fixtures/team.json is not there (a relative path starts at the video folder)']);
  assert.deepStrictEqual(fixtureProblems(web({ mock: { "**/api/team": " " } }), dir), ['mock "**/api/team": the file name is empty']);
  assert.deepStrictEqual(fixtureProblems(web({ mock: { "**/api/team": "fixtures/team.json" } })), [], "without the folder the files are not looked for");
});
