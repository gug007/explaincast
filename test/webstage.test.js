const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const { openWeb } = require("../skills/explaincast/scripts/lib/webstage");

// The second page's stylesheet comes late: until it does, a spacer pushes the
// button far below the view, the way an unstyled page lays out.
function serve() {
  const pages = {
    "/": `<a id="go" href="/b">go</a>`,
    "/b": `<div id="spacer" style="height:2000px"></div><button id="btn">Theme</button>`,
  };
  const server = http.createServer((req, res) => {
    if (req.url === "/late.css") return setTimeout(() => res.writeHead(200, { "content-type": "text/css" }).end("#spacer{display:none}"), 800);
    const head = req.url === "/b" ? `<link rel="stylesheet" href="/late.css">` : "";
    res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><head>${head}</head><body style="margin:0">${pages[req.url] || ""}</body>`);
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

test("after a navigation, a target is placed by the loaded page, not the unstyled one", async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const web = await openWeb({ video: { target: { type: "web", url } }, dir: "/tmp", frame: { width: 800, height: 400 }, log: () => {} });
  try {
    const s = web.stage({ log: () => {} });
    await web.hooks.page.evaluate(() => (location.href = "/b"));
    await s.waitFor("#btn");
    const r = await s.rectOf("#btn");
    assert.ok(r.y < 100, `button placed at y=${r.y}`);
    assert.strictEqual(await web.hooks.page.evaluate(() => scrollY), 0);
  } finally {
    await web.close();
    server.close();
  }
});

test("a Chinese card title keeps punctuation with its word, so none opens a line", async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const web = await openWeb({ video: { target: { type: "web", url } }, dir: "/tmp", frame: { width: 800, height: 400 }, log: () => {} });
  try {
    const s = web.stage({ log: () => {} });
    await s.drawOverlay();
    const words = (title) =>
      web.hooks.page.evaluate((t) => {
        window.__lc.card(t, 100, true);
        return [...document.querySelectorAll("#explaincast-card span")].map((x) => x.textContent);
      }, title);
    assert.deepStrictEqual(await words("Cloud Shelf · 个人内容站"), ["Cloud", "Shelf ·", "个人", "内容", "站"]);
    const spans = await words("电商大促，「保障」方案");
    assert.strictEqual(spans.join(""), "电商大促，「保障」方案");
    assert.ok(!spans.some((w) => /^[，」]/.test(w) || /「$/.test(w)), `spans: ${spans}`);
  } finally {
    await web.close();
    server.close();
  }
});
