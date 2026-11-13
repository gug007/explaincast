// stage.js: the runtime for explaincast idea pages. A page draws its own
// scenes; each step changes the headline and acts on the scene that is showing.
// Calls: reference/idea-pages.md.
// Icons are Lucide (ISC licence, idea/LICENSE-lucide.txt).
(function (root) {
  const ICONS = {
    bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/> <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    bot: '<path d="M12 8V4H8"/> <rect width="16" height="12" x="4" y="8" rx="2"/> <path d="M2 14h2"/> <path d="M20 14h2"/> <path d="M15 13v2"/> <path d="M9 13v2"/>',
    calendar: '<path d="M8 2v4"/> <path d="M16 2v4"/> <rect width="18" height="18" x="3" y="4" rx="2"/> <path d="M3 10h18"/>',
    "chart-line": '<path d="M3 3v16a2 2 0 0 0 2 2h16"/> <path d="m19 9-5 5-4-4-3 3"/>',
    clock: '<circle cx="12" cy="12" r="10"/> <polyline points="12 6 12 12 16 14"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/> <rect width="6" height="6" x="9" y="9" rx="1"/> <path d="M15 2v2"/> <path d="M15 20v2"/> <path d="M2 15h2"/> <path d="M2 9h2"/> <path d="M20 15h2"/> <path d="M20 9h2"/> <path d="M9 2v2"/> <path d="M9 20v2"/>',
    "credit-card": '<rect width="20" height="14" x="2" y="5" rx="2"/> <line x1="2" x2="22" y1="10" y2="10"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/> <path d="M3 5V19A9 3 0 0 0 21 19V5"/> <path d="M3 12A9 3 0 0 0 21 12"/>',
    "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/> <path d="M14 2v4a2 2 0 0 0 2 2h4"/> <path d="M10 9H8"/> <path d="M16 13H8"/> <path d="M16 17H8"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    "git-branch": '<line x1="6" x2="6" y1="3" y2="15"/> <circle cx="18" cy="6" r="3"/> <circle cx="6" cy="18" r="3"/> <path d="M18 9a9 9 0 0 1-9 9"/>',
    globe: '<circle cx="12" cy="12" r="10"/> <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/> <path d="M2 12h20"/>',
    "hard-drive": '<line x1="22" x2="2" y1="12" y2="12"/> <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/> <line x1="6" x2="6.01" y1="16" y2="16"/> <line x1="10" x2="10.01" y1="16" y2="16"/>',
    hash: '<line x1="4" x2="20" y1="9" y2="9"/> <line x1="4" x2="20" y1="15" y2="15"/> <line x1="10" x2="8" y1="3" y2="21"/> <line x1="16" x2="14" y1="3" y2="21"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/> <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    "key-round": '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/> <circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
    layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/> <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/> <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
    list: '<path d="M3 12h.01"/> <path d="M3 18h.01"/> <path d="M3 6h.01"/> <path d="M8 12h13"/> <path d="M8 18h13"/> <path d="M8 6h13"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/> <path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/> <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    "message-square": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/> <line x1="8" x2="16" y1="21" y2="21"/> <line x1="12" x2="12" y1="17" y2="21"/>',
    package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/> <path d="M12 22V12"/> <path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/> <path d="m7.5 4.27 9 5.15"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/> <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/> <path d="M12 17.5v-11"/>',
    search: '<circle cx="11" cy="11" r="8"/> <path d="m21 21-4.3-4.3"/>',
    send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/> <path d="m21.854 2.147-10.94 10.939"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/> <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/> <line x1="6" x2="6.01" y1="6" y2="6"/> <line x1="6" x2="6.01" y1="18" y2="18"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/> <circle cx="12" cy="12" r="3"/>',
    "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/> <path d="m9 12 2 2 4-4"/>',
    "shopping-cart": '<circle cx="8" cy="21" r="1"/> <circle cx="19" cy="21" r="1"/> <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/> <path d="M12 18h.01"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/> <line x1="12" x2="20" y1="19" y2="19"/>',
    timer: '<line x1="10" x2="14" y1="2" y2="2"/> <line x1="12" x2="15" y1="14" y2="11"/> <circle cx="12" cy="14" r="8"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/> <path d="M15 18H9"/> <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/> <circle cx="17" cy="18" r="2"/> <circle cx="7" cy="18" r="2"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/> <circle cx="12" cy="7" r="4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/> <circle cx="9" cy="7" r="4"/> <path d="M22 21v-2a4 4 0 0 0-3-3.87"/> <path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    webhook: '<path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/> <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/> <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>',
    workflow: '<rect width="8" height="8" x="3" y="3" rx="2"/> <path d="M7 11v4a2 2 0 0 0 2 2h4"/> <rect width="8" height="8" x="13" y="13" rx="2"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  };

  // What stage.count() shows on the way to `to`: `places` decimals, or as many as `to` has.
  function countText(value, to, { prefix = "", suffix = "", places = (String(to).split(".")[1] || "").length } = {}) {
    return prefix + value.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places }) + suffix;
  }

  if (typeof module === "object" && module.exports) module.exports = { ICONS, countText };
  if (typeof document === "undefined") return;

  const UI_BOX = ".ui-field, .ui-btn, .ui-item, .ui-tag, .ui-switch, .ui-card, .ui-bar, .ui-side, .ui-main, .sv";
  const reported = new Set();
  const failures = [];
  let built = false, emptyLines = 0, lastLook = null;

  const el = (id) => {
    const found = document.getElementById(id);
    if (!found) throw new Error(`stage: there is no element with id "${id}"`);
    return found;
  };

  function icon(name) {
    if (!ICONS[name]) {
      failures.push(`there is no icon "${name}"; the kit has ${Object.keys(ICONS).join(", ")}`);
      return "";
    }
    return `<svg class="lucide" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  }

  // Wraps the [data-s] children of a screen or a .states element in a slot that shows one at a time.
  function makeSlot(host) {
    const states = [...host.children].filter((c) => c.dataset.s != null);
    if (!states.length) return;
    const slot = document.createElement("div");
    slot.className = "slot";
    states[0].before(slot);
    slot.append(...states);
    if (!states.some((s) => s.classList.contains("on"))) states[0].classList.add("on");
  }

  // A slot is as tall as its tallest state, so switching states never moves
  // anything. Reads first, then writes: one layout.
  function sizeSlots() {
    const slots = [...document.querySelectorAll(".slot")];
    slots.forEach((slot) => slot.classList.remove("sized"));
    const heights = slots.map((slot) => Math.max(0, ...[...slot.children].map((c) => c.scrollHeight)));
    slots.forEach((slot, i) => {
      slot.style.minHeight = `${heights[i]}px`;
      slot.classList.add("sized");
    });
  }

  // A screen gets its window's chrome (a title bar, or a phone's status bar)
  // above a view that holds the page's markup for it.
  function buildScreen(s) {
    const view = document.createElement("div");
    view.className = "sv";
    view.append(...s.childNodes);
    const bar = document.createElement("div");
    bar.className = "tb";
    if (s.classList.contains("phone")) bar.innerHTML = "<span>9:41</span><em></em>";
    else {
      bar.innerHTML = "<i></i><i></i><i></i><span></span>";
      bar.querySelector("span").textContent = s.dataset.title || "";
    }
    s.append(bar, view);
    makeSlot(view);
  }

  function build() {
    if (built) return;
    built = true;
    document.querySelectorAll(".screen").forEach(buildScreen);
    document.querySelectorAll(".states").forEach(makeSlot);
    document.querySelectorAll(".ui-video").forEach((v) => {
      v.insertAdjacentHTML("beforeend", '<span class="vp"></span><span class="vbar"><i></i></span>');
      if (v.dataset.time) {
        const t = document.createElement("span");
        t.className = "vt";
        t.textContent = v.dataset.time;
        v.appendChild(t);
      }
    });
    document.querySelectorAll(".new").forEach((n) => {
      const tag = document.createElement("span");
      tag.className = "newtag";
      tag.textContent = n.dataset.new || "New";
      n.appendChild(tag);
    });
    document.querySelectorAll("i[data-icon]").forEach((i) => { i.outerHTML = icon(i.dataset.icon); });
    const h = document.querySelector(".headline");
    if (h && !h.querySelector("span")) {
      const s = document.createElement("span");
      s.textContent = h.textContent.trim();
      h.textContent = "";
      h.appendChild(s);
    }
    if (document.querySelector(".chapters")) chapter(0);
  }

  const setShown = (on, ids) => ids.forEach((id) => el(id).classList.toggle("hidden", !on));
  const show = (...ids) => setShown(true, ids);
  const hide = (...ids) => setShown(false, ids);

  const mark = (id, cls, on = true) => el(id).classList.toggle(cls, on);

  function state(id, name) {
    const slot = el(id).querySelector(":scope > .slot, :scope > .sv > .slot");
    if (!slot) throw new Error(`stage: #${id} has no [data-s] states`);
    const states = [...slot.children];
    if (!states.some((s) => s.dataset.s === name)) throw new Error(`stage: #${id} has no state "${name}"`);
    states.forEach((s) => s.classList.toggle("on", s.dataset.s === name));
  }

  function headline(text) {
    const box = document.querySelector(".headline");
    const old = box.querySelector("span:not(.out)");
    if (old && old.textContent === text) return;
    if (old) {
      old.classList.add("out");
      setTimeout(() => old.remove(), 450);
    }
    const s = document.createElement("span");
    s.className = "in";
    s.textContent = text;
    box.appendChild(s);
    requestAnimationFrame(() => requestAnimationFrame(() => s.classList.remove("in")));
  }

  function chapter(i) {
    const pills = [...document.querySelectorAll(".chapters span")];
    if (!pills[i]) throw new Error(`stage: there is no chapter ${i}; the header lists ${pills.length}`);
    pills.forEach((p, k) => {
      p.classList.toggle("now", k === i);
      p.classList.toggle("done", k < i);
    });
    const eyebrow = document.querySelector(".eyebrow");
    if (eyebrow) eyebrow.textContent = pills[i].dataset.eyebrow || pills[i].textContent;
  }

  function type(id, text, ms = 700) {
    const target = el(id);
    const typed = document.createTextNode("");
    const caret = document.createElement("span");
    caret.className = "caret";
    target.replaceChildren(typed, caret);
    return new Promise((done) => {
      let i = 0;
      const t = setInterval(() => {
        typed.data = text.slice(0, ++i);
        if (i >= text.length) {
          clearInterval(t);
          setTimeout(() => { target.textContent = text; done(); }, 300);
        }
      }, ms / Math.max(1, text.length));
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Shows one scene and takes the others away; resolves once it is in.
  function scene(id) {
    const next = el(id);
    if (!next.classList.contains("scene")) throw new Error(`stage: #${id} is not a .scene`);
    document.querySelectorAll(".scene.on").forEach((s) => s !== next && s.classList.remove("on"));
    next.classList.add("on");
    return sleep(550);
  }

  // Slides an element until its centre is on another element's centre or on
  // [x, y] in stage points; move(id) slides it home. Resolves on arrival.
  const moved = new WeakMap();
  function move(id, to, { ms = 700 } = {}) {
    const item = el(id);
    const from = moved.get(item) || [0, 0];
    let goal = [0, 0];
    if (to != null) {
      const r = item.getBoundingClientRect();
      const t = Array.isArray(to) ? { left: to[0], top: to[1], width: 0, height: 0 } : el(to).getBoundingClientRect();
      goal = [from[0] + t.left + t.width / 2 - (r.left + r.width / 2), from[1] + t.top + t.height / 2 - (r.top + r.height / 2)];
    }
    moved.set(item, goal);
    const at = (p) => `${p[0]}px ${p[1]}px`;
    const a = item.animate([{ translate: at(from) }, { translate: at(goal) }], { duration: ms, easing: "cubic-bezier(.45, 0, .25, 1)" });
    item.style.translate = at(goal);
    return a.finished.catch(() => {});
  }

  // Draws an SVG shape, or every shape inside an element, along its stroke.
  function draw(id, ms = 900) {
    const host = el(id);
    const shapes = typeof host.getTotalLength === "function" ? [host] : [...host.querySelectorAll("path, line, polyline, polygon, circle, ellipse, rect")];
    if (!shapes.length) throw new Error(`stage: #${id} has no SVG shape to draw`);
    host.classList.remove("hidden");
    return Promise.all(shapes.map((shape) => {
      const length = shape.getTotalLength();
      shape.style.strokeDasharray = length;
      const a = shape.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: ms, easing: "ease-in-out" });
      return a.finished.then(() => { shape.style.strokeDasharray = ""; }, () => {});
    }));
  }

  // Counts a number up or down to `to`, from `from` or the number already there.
  function count(id, to, { ms = 900, from, prefix, suffix, places } = {}) {
    const target = el(id);
    const start = from ?? (parseFloat(target.textContent.replace(/[^0-9.-]/g, "")) || 0);
    return new Promise((done) => {
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        target.textContent = countText(start + (to - start) * (1 - (1 - k) ** 3), to, { prefix, suffix, places });
        if (k < 1) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
  }

  const opened = new Set();
  const screenOf = (id) => {
    const s = el(id);
    if (!s.classList.contains("screen")) throw new Error(`stage: #${id} is not a .screen`);
    return s;
  };

  const RISE = [{ opacity: 0, transform: "translateY(18px) scale(.97)" }, { opacity: 1, transform: "none" }];

  // Opens screens; resolves once they are open.
  function open(...ids) {
    return Promise.all(ids.map((id) => {
      const s = screenOf(id);
      if (opened.has(id)) return null;
      opened.add(id);
      s.getAnimations().forEach((a) => a.cancel());
      s.classList.remove("hidden");
      s.classList.add("open");
      return s.animate(RISE, { duration: 600, easing: "cubic-bezier(.22, .8, .2, 1)" }).finished.catch(() => {});
    }));
  }

  // Closes screens; close() closes every open one.
  function close(...ids) {
    const which = (ids.length ? ids : [...opened]).filter((id) => screenOf(id) && opened.delete(id));
    return Promise.all(which.map((id) => {
      const s = el(id);
      const a = s.animate(RISE, { duration: 420, easing: "cubic-bezier(.45, 0, .25, 1)", direction: "reverse", fill: "forwards" });
      return a.finished.then(() => { s.classList.remove("open"); a.cancel(); }, () => {});
    }));
  }

  // A tap on a control: a ripple from its centre and a short press.
  function tap(id) {
    const target = el(id);
    const r = target.getBoundingClientRect();
    const dot = document.createElement("span");
    dot.className = "tap";
    dot.style.left = `${r.left + r.width / 2}px`;
    dot.style.top = `${r.top + r.height / 2}px`;
    document.body.appendChild(dot);
    target.classList.add("press");
    setTimeout(() => target.classList.remove("press"), 220);
    const a = dot.animate(
      [{ transform: "translate(-50%, -50%) scale(.35)", opacity: 0.9 }, { transform: "translate(-50%, -50%) scale(1.5)", opacity: 0 }],
      { duration: 620, easing: "cubic-bezier(.22, .8, .2, 1)" },
    );
    return a.finished.then(() => dot.remove(), () => dot.remove());
  }

  const shown = (n) => {
    for (let p = n; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.1 || p.classList.contains("hidden")) return false;
      if (p.matches(".slot > [data-s]") && !p.classList.contains("on")) return false;
      if (p.classList.contains("scene") && !p.classList.contains("on")) return false;
    }
    return true;
  };

  // Everything on the stage that a viewer could tell apart: what shows, where, and what it says.
  function look() {
    const parts = [];
    for (const n of document.body.querySelectorAll("*")) {
      if (n.closest("script, style, .tap") || !shown(n)) continue;
      const r = n.getBoundingClientRect();
      const own = [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data.trim()).join("");
      parts.push(`${n.getAttribute("class") || ""}|${n.getAttribute("style") || ""}|${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}|${own}`);
    }
    return parts.join("\n");
  }

  // What a reviewer would flag on screen right now, each issue once per take.
  // The recorder calls it once at the end of every line, with the line's id and
  // whether a card covers the page.
  function lint({ line = null, covered = false } = {}) {
    const issues = failures.splice(0);
    const W = innerWidth, H = innerHeight;
    const now = look();
    if (!covered && lastLook === now) issues.push(`nothing on the stage changed during ${line ? `"${line}"` : "this line"}; give it a step that shows what it says`);
    lastLook = now;
    const header = [document.querySelector(".headline"), document.querySelector(".chapters")].filter(Boolean).map((n) => n.getBoundingClientRect());
    const overlap = (r, s, pad = 4) => r.left + pad < s.right && s.left + pad < r.right && r.top + pad < s.bottom && s.top + pad < r.bottom;
    const range = document.createRange();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = t.textContent.trim();
      const p = t.parentElement;
      if (!text || !p || p.closest("svg, script, style, [data-lint-ok]") || !shown(p)) continue;
      const size = parseFloat(getComputedStyle(p).fontSize);
      if (size < 15) issues.push(`"${text.slice(0, 40)}" is ${size}px; stage text needs 15px or more to stay readable`);
      const r = p.getBoundingClientRect();
      if (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1) issues.push(`"${text.slice(0, 40)}" runs off the stage`);
      if (p.closest(".scene") && !p.closest(".screen") && header.some((h) => overlap(r, h, 0))) issues.push(`"${text.slice(0, 40)}" runs into the headline; start a scene's content below ${Math.ceil(Math.max(...header.map((h) => h.bottom)))} points`);
      const box = p.closest(".screen") && !p.closest(".newtag") && p.closest(UI_BOX);
      if (box) {
        range.selectNodeContents(t);
        const tr = range.getBoundingClientRect(), br = box.getBoundingClientRect();
        if (tr.right > br.right + 1 || tr.bottom > br.bottom + 1 || tr.left < br.left - 1) issues.push(`"${text.slice(0, 40)}" runs out of its ${box.classList[0]} in #${p.closest(".screen").id}; shorten it or give the box room`);
      }
    }
    const boxes = [...document.querySelectorAll(".screen")].filter(shown);
    for (const b of boxes) {
      const inner = b.querySelector(":scope > .sv") || b;
      if (inner.scrollWidth > inner.clientWidth + 2 || inner.scrollHeight > inner.clientHeight + 2) issues.push(`#${b.id || b.className} has more content than fits in it`);
    }
    const rects = boxes.map((b) => ({ b, r: b.getBoundingClientRect() }));
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i].r, rects[j].r)) issues.push(`#${rects[i].b.id} and #${rects[j].b.id} overlap`);
    const head = document.querySelector(".headline span:not(.out)"), chaps = document.querySelector(".chapters");
    if (head && chaps && overlap(head.getBoundingClientRect(), chaps.getBoundingClientRect(), 0)) issues.push(`the headline "${head.textContent}" runs into the chapters; shorten it`);
    for (const { b, r } of rects) {
      if (header.some((t) => overlap(r, t, 0))) issues.push(`#${b.id} runs into the headline; start it below ${Math.ceil(Math.max(...header.map((t) => t.bottom)))} points`);
    }
    const drawn = [...document.querySelectorAll(".scene.on > *")].filter((n) => !n.classList.contains("screen") && shown(n));
    const content = [...rects.map((x) => x.r), ...drawn.map((n) => n.getBoundingClientRect())];
    if (content.length) {
      const bottom = Math.max(...content.map((r) => r.bottom)), right = Math.max(...content.map((r) => r.right));
      if (bottom < H * 0.62 || right < W * 0.62) emptyLines++;
      if (emptyLines === 2) issues.push(`most of the stage stays empty (content ends at ${Math.round(right)}×${Math.round(bottom)} of ${W}×${H}); give the scene the whole stage under the headline`);
    }
    return issues.filter((m) => !reported.has(m) && reported.add(m));
  }

  // Registers the page's steps as window.go(name) and sets window.ready once laid out.
  function steps(map) {
    root.go = (name) => {
      const step = map[name];
      if (typeof step !== "function") throw new Error(`stage: there is no step "${name}"`);
      const r = step();
      if (r && typeof r.catch === "function") r.catch((e) => failures.push(`step "${name}" failed: ${e.message || e}`));
    };
    const start = () => {
      build();
      document.fonts.ready.then(() => requestAnimationFrame(() => {
        sizeSlots();
        lastLook = look();
        root.ready = true;
      }));
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  root.stage = { steps, scene, show, hide, mark, state, headline, chapter, type, move, draw, count, sleep, open, close, tap, lint };
})(typeof window !== "undefined" ? window : globalThis);
