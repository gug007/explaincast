// A web target: a page (a URL, or a local HTML file for an idea with nothing
// else to show) in headless Chromium, recorded through its own screencast, so a
// take touches neither the screen, the pointer nor the keyboard.
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium, CHROME } = require("./browser");
const { Stage, label } = require("./stage");
const { sleep } = require("./words");
const { ZOOM } = require("./layout");
const { OVERLAY_CSS, CURSOR_SVG, HOTSPOT, installStage } = require("./overlay");

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

class WebStage extends Stage {
  constructor(page, opts) {
    super(opts);
    this.page = page;
    this.pointer = { x: opts.origin.w * 0.56, y: opts.origin.h * 0.52 };
    this.noCursor = opts.noCursor;
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

  typeText(text) {
    return this.page.keyboard.type(text);
  }

  press(key) {
    return this.page.keyboard.press(key);
  }

  keys(combo) {
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
    ready: async () => {},
    capture: (onFrame) => new Screencast(page, size, onFrame).start(),
    stage: (opts) => new WebStage(page, { ...opts, origin, noCursor: t.cursor === false }),
    close: () => browser.close(),
  };
}

module.exports = { openWeb };
