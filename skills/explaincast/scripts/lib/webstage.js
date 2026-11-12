// A web target: a page (a URL, or a local HTML file for an idea with nothing
// else to show) in headless Chromium, recorded through its own screencast, so a
// take touches neither the screen, the pointer nor the keyboard.
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium, CHROME } = require("./browser");
const fs = require("fs");
const { Stage, label, jerk, coversNamed } = require("./stage");
const { sleep } = require("./words");
const { ZOOM } = require("./layout");
const { OVERLAY_CSS, CURSOR_SVG, HOTSPOT, installStage } = require("./overlay");
const { mockRoutes } = require("./fixtures");

const KEY_NAMES = { cmd: "Meta", shift: "Shift", alt: "Alt", ctrl: "Control", return: "Enter", enter: "Enter", esc: "Escape", escape: "Escape", tab: "Tab", space: "Space", delete: "Backspace", down: "ArrowDown", up: "ArrowUp" };

class Screencast {
  latest = null;
  frames = 0;
  failed = null;

  constructor(page, size, onFrame) {
    this.page = page;
    this.size = size;
    this.onFrame = onFrame;
  }

  async start() {
    await this.page.screencast.start({
      size: this.size,
      quality: 92,
      onFrame: (f) => {
        this.latest = Buffer.from(f.data);
        this.frames++;
        this.onFrame(f);
      },
    });
    return this;
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    await this.page.screencast.stop();
  }
}

// In the page: the control under the drawn pointer's tip, with its name and
// size, or null when the pointer is hidden or on no control. The pointer,
// its ring and the card take no hits, so they never answer for what is under
// them.
function controlAt({ x, y }) {
  const cur = document.getElementById("explaincast-cursor");
  if (!cur || cur.style.visibility === "hidden" || getComputedStyle(cur).display === "none") return null;
  const hit = document.elementFromPoint(x, y);
  const control = hit?.closest("button, a[href], input, select, textarea, summary, label, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=radio], [role=switch], [role=option]");
  if (!control) return null;
  const r = control.getBoundingClientRect();
  const name = (control.getAttribute("aria-label") || control.innerText || control.value || control.getAttribute("title") || "").trim().replace(/\s+/g, " ");
  return { name, w: r.width, h: r.height };
}

class WebStage extends Stage {
  constructor(page, opts) {
    super(opts);
    this.page = page;
    this.pointer = { x: opts.origin.w * 0.56, y: opts.origin.h * 0.52 };
    this.cheapLookups = true;
    this.noCursor = opts.noCursor;
    this.pageChecks = opts.pageChecks;
    this.dir = opts.dir;
  }

  // An idea page built on the kit reports what it would flag on screen
  // (idea/stage.js lint); every page gets the pointer check.
  async endLine() {
    if (this.pageChecks) {
      for (const issue of await this.page.evaluate(() => window.stage?.lint?.() || [])) this.warn("page", issue);
    }
    await this.checkPointer();
  }

  // A pointer left on a small control hides it, and a line that names the
  // control is about it, so the take says so.
  async checkPointer() {
    if (this.noCursor || this.covered || !this.line?.text) return;
    const hit = await this.page.evaluate(controlAt, this.pointer).catch(() => null);
    if (!coversNamed(hit, this.line.text)) return;
    this.warn("pointer", `the pointer rests on "${hit.name}" as the line ends, and the line names it, so the pointer hides what it is about; move it beside, as in s.moveTo(sel, { at: [0.5, 1.6] })`);
  }

  async drawOverlay() {
    if (await this.page.evaluate(() => !!window.__lc)) return;
    await this.page.addStyleTag({ content: OVERLAY_CSS });
    await this.page.evaluate(installStage, { cursorSvg: CURSOR_SVG, hotspot: HOTSPOT, scale: this.origin.scale });
    await this.page.evaluate(({ x, y }) => window.__lc.place(x, y), this.pointer);
    if (this.noCursor) await this.page.addStyleTag({ content: "#explaincast-cursor, #explaincast-ring { display: none !important; }" });
  }

  // The drawn cursor lives in the page, so a new page gets it again where the
  // stage last had it.
  async install() {
    await this.drawOverlay();
    await this.page.mouse.move(this.pointer.x, this.pointer.y);
    this.page.on("domcontentloaded", () => this.drawOverlay().catch((e) => this.log(`overlay: ${e.message}`)));
  }

  async nudge(n) {
    await this.page.evaluate((n) => (document.getElementById("explaincast-tick").style.background = n % 2 ? "#000" : "#fff"), n);
  }

  async locate(sel) {
    const el = this.page.locator(sel).first();
    if (!(await el.isVisible().catch(() => false))) return null;
    const b = await el.boundingBox().catch(() => null);
    return b && { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  inView(r) {
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    return c.x >= 0 && c.y >= 0 && c.x <= this.origin.w && c.y <= this.origin.h;
  }

  async rectOf(sel) {
    const r = await this.waitFor(sel);
    if (this.inView(r)) return r;
    await this.scrollTo(sel);
    return this.waitFor(sel);
  }

  // On camera, centred, and done once the target has stopped moving.
  async scrollTo(sel) {
    await this.page.locator(sel).first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    let was = null;
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      await sleep(120);
      const now = JSON.stringify(await this.locate(sel));
      if (now === was) return;
      was = now;
    }
    this.log(`${label(sel)} was still moving after the scroll`);
  }

  async glide(x, y, ms) {
    await this.page.evaluate(([x, y, ms]) => window.__lc?.moveTo(x, y, ms), [x, y, ms]).catch(() => {});
    this.pointer = { x, y };
    await this.page.mouse.move(x, y);
  }

  async pressAt(p) {
    await this.page.evaluate(() => window.__lc?.tap());
    await this.page.mouse.down();
    await sleep(90);
    await this.page.mouse.up();
    this.pointer = p;
  }

  async pressDown(p) {
    await this.page.evaluate(() => window.__lc?.tap());
    await this.page.mouse.down();
    this.pointer = p;
  }

  // The real mouse moves in steps with the drawn pointer, so whatever the page
  // drags along stays under it.
  async dragGlide(x, y, ms) {
    const from = this.pointer;
    const start = Date.now();
    for (let t = 0; t < 1; await sleep(16)) {
      t = Math.min(1, (Date.now() - start) / ms);
      const s = jerk(t);
      const p = [from.x + (x - from.x) * s, from.y + (y - from.y) * s];
      await this.page.mouse.move(p[0], p[1]);
      await this.page.evaluate(([px, py]) => window.__lc?.place(px, py), p).catch(() => {});
    }
    this.pointer = { x, y };
  }

  async release(p) {
    await this.page.mouse.up();
    this.pointer = p;
  }

  // Clicks the control that opens the file picker and picks `files` (paths
  // from the video folder) in it. A headless take never draws the picker, so
  // the file is simply there after the click. `verify` waits for what the page
  // shows once it has the file.
  async upload(sel, files, opts = {}) {
    const list = [].concat(files).map((f) => path.resolve(this.dir || ".", f));
    for (const f of list) if (!fs.existsSync(f)) throw new Error(`upload: ${f} is not there (a relative path starts at the video folder)`);
    const chooser = this.page.waitForEvent("filechooser", { timeout: opts.timeout ?? 5000 });
    chooser.catch(() => {});
    await this.click(sel, { ...opts, verify: undefined });
    let picker;
    try {
      picker = await chooser;
    } catch {
      throw new Error(`upload: clicking ${label(sel)} opened no file picker; aim it at the button or drop zone that opens one`);
    }
    await picker.setFiles(list);
    this.log(`upload ${list.map((f) => path.basename(f)).join(", ")}`);
    if (typeof opts.verify === "function") await this.until(opts.verify, { timeout: opts.verifyMs ?? 8000, label: "the upload" });
    else if (opts.verify) await this.waitFor(opts.verify, opts.verifyMs ?? 8000);
  }

  typeText(text) {
    return this.page.keyboard.type(text);
  }

  sendKey(key) {
    return this.page.keyboard.press(key);
  }

  sendKeys(combo) {
    return this.page.keyboard.press(combo.split("+").map((k) => KEY_NAMES[k.toLowerCase()] || (k.length === 1 ? k.toUpperCase() : k)).join("+"));
  }

  hideCursor() {
    return this.page.evaluate(() => window.__lc?.hideCursor());
  }

  showCursor() {
    return this.page.evaluate(() => window.__lc?.showCursor());
  }
}

// The window's size includes the browser's own chrome; the page's has to be
// exactly the frame.
async function fitWindow(context, page, frame) {
  const cdp = await context.newCDPSession(page);
  const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget");
  const inner = () => page.evaluate(() => [window.innerWidth, window.innerHeight]);
  const [w, h] = await inner();
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: bounds.width + frame.width - w, height: bounds.height + frame.height - h } });
  const end = Date.now() + 2000;
  for (;;) {
    const now = await inner();
    if (now[0] === frame.width && now[1] === frame.height) break;
    if (Date.now() >= end) throw new Error(`the page stayed ${now.join("x")}, not ${frame.width}x${frame.height}`);
    await sleep(50);
  }
  await cdp.detach();
}

async function openWeb({ video, dir, frame, log }) {
  const t = video.target;
  const size = { width: frame.width * ZOOM, height: frame.height * ZOOM };
  // Only a browser-wide scale reaches the screencast in device pixels; a
  // context's deviceScaleFactor leaves its frames at half the size.
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [`--force-device-scale-factor=${ZOOM}`, `--window-size=${frame.width},${frame.height + 100}`] });
  const context = await browser.newContext({
    viewport: null,
    // A strict CSP would refuse the drawn cursor's styles.
    bypassCSP: true,
    colorScheme: t.colorScheme || "light",
  });
  // The same page in every take (fixtures.js): its time starts at "clock" and
  // runs on, timers and animations at their real pace, and "mock" answers its
  // requests with saved data.
  if (t.clock != null) {
    await context.clock.install({ time: t.clock });
    log(`clock: the page's time starts at ${t.clock}`);
  }
  const routes = mockRoutes(t.mock, dir);
  for (const [glob, reply] of routes) await context.route(glob, (route) => route.fulfill(reply));
  if (routes.length) log(`mock: ${routes.length} URL pattern(s) answered from video.json`);
  const page = await context.newPage();
  await fitWindow(context, page, frame);
  const url = t.file ? pathToFileURL(path.resolve(dir, t.file)).href : t.url;
  try {
    await page.goto(url, { waitUntil: "load" });
  } catch (e) {
    await browser.close();
    throw new Error(`could not open ${url}: ${e.message.split("\n")[0]}`);
  }
  log(`opened ${url}`);
  const origin = { x: 0, y: 0, w: frame.width, h: frame.height, scale: ZOOM };
  return {
    hooks: { page, context },
    // A page on the idea kit lays itself out first and says so with window.ready.
    ready: async () => {
      if (!t.file) return;
      await page.waitForFunction(() => !window.stage || window.ready === true, null, { timeout: 15000 }).catch(() => {
        throw new Error(`${t.file} loads the idea kit but never set window.ready; check that it calls stage.steps()`);
      });
    },
    capture: (onFrame) => new Screencast(page, size, onFrame).start(),
    stage: (opts) => new WebStage(page, { ...opts, origin, noCursor: t.cursor === false, pageChecks: !!t.file }),
    close: () => browser.close(),
  };
}

module.exports = { openWeb };
