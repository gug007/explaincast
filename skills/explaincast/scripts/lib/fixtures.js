// A web target's fixed state, the same in every take: "clock", where the
// page's time starts (it runs on from there), and "mock", URL patterns
// answered with saved data instead of the real server:
//   "target": { "type": "web", "url": "http://localhost:3000",
//               "clock": "2026-03-14T10:00",
//               "mock": { "**/api/user": "fixtures/user.json", "**/api/plan": { "name": "Team" } } }
// webstage.js applies both before the page opens.
const fs = require("fs");
const path = require("path");

const isMap = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// "mock" as [pattern, reply] in the order to add them: Playwright tries the
// newest route first, so the first pattern listed wins. A string is a file
// (from the video folder); any other value goes as JSON.
function mockRoutes(mock, dir) {
  return Object.entries(mock || {})
    .reverse()
    .map(([glob, reply]) => [glob, typeof reply === "string" ? { path: path.resolve(dir, reply) } : { json: reply }]);
}

// .explaincast.json names a mock's files from the project's folder, and the
// video folder is elsewhere, so new.js writes them as absolute paths.
function mockFrom(mock, dir) {
  if (!isMap(mock)) return mock;
  return Object.fromEntries(Object.entries(mock).map(([glob, reply]) => [glob, typeof reply === "string" && reply.trim() && !path.isAbsolute(reply) ? path.resolve(dir, reply) : reply]));
}

// What is wrong with a target's "clock" and "mock", as messages; `dir` (the
// video folder) checks that the mock's files are there.
function fixtureProblems(t, dir = null) {
  const problems = [];
  if (t.clock == null && t.mock == null) return problems;
  if (t.type !== "web") return ['"clock" and "mock" work on a web target only'];
  if (t.clock != null && !((typeof t.clock === "string" || typeof t.clock === "number") && Number.isFinite(new Date(t.clock).getTime()))) {
    problems.push(`the target's "clock" is a date and time on this Mac's clock, as in "2026-03-14T10:00" (got ${JSON.stringify(t.clock)})`);
  }
  if (t.mock != null && !isMap(t.mock)) {
    problems.push('the target\'s "mock" maps URL patterns to a file or JSON, as in { "**/api/user": "fixtures/user.json" }');
  } else if (t.mock) {
    for (const [glob, reply] of Object.entries(t.mock)) {
      if (typeof reply !== "string") continue;
      if (!reply.trim()) problems.push(`mock "${glob}": the file name is empty`);
      else if (dir && !fs.existsSync(path.resolve(dir, reply))) problems.push(`mock "${glob}": the file ${reply} is not there (a relative path starts at the video folder)`);
    }
  }
  return problems;
}

module.exports = { mockRoutes, mockFrom, fixtureProblems };
