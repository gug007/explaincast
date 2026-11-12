// stage.js: the Map kit for explaincast idea pages. The parts sit on one stage
// and never move; each step changes the headline, the focus, what each part
// holds, and what travels between them. A Screens page shows a product's own UI
// instead, one screen at a time. Calls: reference/idea-pages.md.
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

  const SIDES = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
  const GAP = 2;
  const fmt = ([x, y]) => `${+x.toFixed(1)} ${+y.toFixed(1)}`;

  // The side of each box that faces the other one.
  function facing(a, b) {
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["right", "left"] : ["left", "right"];
    return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
  }

  function anchor(r, side, shift) {
    if (side === "left") return [r.x - GAP, r.y + r.h / 2 + shift];
    if (side === "right") return [r.x + r.w + GAP, r.y + r.h / 2 + shift];
    if (side === "top") return [r.x + r.w / 2 + shift, r.y - GAP];
    if (side === "bottom") return [r.x + r.w / 2 + shift, r.y + r.h + GAP];
    throw new Error(`stage: an edge side is left, right, top or bottom, not "${side}"`);
  }

  // A connector from box `a` to box `b` ({x, y, w, h}): out of the facing sides
  // unless `from`/`to` name them, `shift` moving each end along its side. Two
  // ends on the same side make a U that reaches `bend` past the further one.
  function edgePath(a, b, { from, to, shift = 0, bend } = {}) {
    const [fa, fb] = facing(a, b);
    from = from || fa;
    to = to || fb;
    const [s0, s1] = Array.isArray(shift) ? shift : [shift, shift];
    const p0 = anchor(a, from, s0), p1 = anchor(b, to, s1);
    const n0 = SIDES[from], n1 = SIDES[to];
    if (from === to) {
      const k = bend ?? 90;
      if (n0[0]) {
        const x = n0[0] > 0 ? Math.max(p0[0], p1[0]) + k : Math.min(p0[0], p1[0]) - k;
        return `M ${fmt(p0)} C ${fmt([x, p0[1]])}, ${fmt([x, p1[1]])}, ${fmt(p1)}`;
      }
      const y = n0[1] > 0 ? Math.max(p0[1], p1[1]) + k : Math.min(p0[1], p1[1]) - k;
      return `M ${fmt(p0)} C ${fmt([p0[0], y])}, ${fmt([p1[0], y])}, ${fmt(p1)}`;
    }
    const straight = (n0[0] && n1[0] && Math.abs(p0[1] - p1[1]) < 1) || (n0[1] && n1[1] && Math.abs(p0[0] - p1[0]) < 1);
    if (straight && bend == null) return `M ${fmt(p0)} L ${fmt(p1)}`;
    const k = bend ?? Math.min(120, Math.max(40, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 0.4));
    const c0 = [p0[0] + n0[0] * k, p0[1] + n0[1] * k], c1 = [p1[0] + n1[0] * k, p1[1] + n1[1] * k];
    return `M ${fmt(p0)} C ${fmt(c0)}, ${fmt(c1)}, ${fmt(p1)}`;
  }

  if (typeof module === "object" && module.exports) module.exports = { edgePath, facing, ICONS };
  if (typeof document === "undefined") return;

  const NS = "http://www.w3.org/2000/svg";
  const KINDS = ["amber", "indigo", "sky", "green", "red", "violet", "slate"];
  const SLOT_MIN = 72;
  const UI_BOX = ".ui-field, .ui-btn, .ui-item, .ui-tag, .ui-switch, .ui-card, .ui-bar, .ui-side, .ui-main, .sv";
  const SAMPLES = 40;
  const edges = new Map();
  const badges = new Map();
  const reported = new Set();
  const failures = [];
  let svg = null, built = false, emptyLines = 0;

  const el = (id) => {
    const found = document.getElementById(id);
    if (!found) throw new Error(`stage: there is no element with id "${id}"`);
    return found;
  };
  const edgeOf = (id) => {
    const e = edges.get(id);
    if (!e) throw new Error(`stage: there is no edge "${id}"`);
    return e;
  };
  const boxOf = (n) => ({ x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight });
  const isHidden = (n) => n.classList.contains("hidden");
  const isLive = (e) => e.path && !e.path.classList.contains("hidden");

  function icon(name) {
    if (!ICONS[name]) {
      failures.push(`there is no icon "${name}"; the kit has ${Object.keys(ICONS).join(", ")}`);
      return "";
    }
    return `<svg class="lucide" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  }

  // Wraps the [data-s] children of a part or card in a slot that shows one at a time.
  function makeSlot(host) {
    const states = [...host.children].filter((c) => c.dataset.s != null);
    if (!states.length) return;
    const slot = document.createElement("div");
    slot.className = "slot";
    states[0].before(slot);
    slot.append(...states);
    if (!states.some((s) => s.classList.contains("on"))) states[0].classList.add("on");
  }

  // A slot is as tall as its tallest state (SLOT_MIN at least in a part), so
  // switching states never moves anything. Reads first, then writes: one layout.
  function sizeSlots() {
    const slots = [...document.querySelectorAll(".slot")];
    slots.forEach((slot) => slot.classList.remove("sized"));
    const heights = slots.map((slot) => Math.max(slot.parentElement.classList.contains("node") ? SLOT_MIN : 0, ...[...slot.children].map((c) => c.scrollHeight)));
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
    document.querySelectorAll(".node").forEach((n) => {
      const head = document.createElement("div");
      head.className = "nh";
      head.innerHTML = `${n.dataset.icon ? `<span class="ic">${icon(n.dataset.icon)}</span>` : ""}<div><b></b><small></small></div>`;
      head.querySelector("b").textContent = n.dataset.title || "";
      if (n.dataset.sub) head.querySelector("small").textContent = n.dataset.sub;
      else head.querySelector("small").remove();
      n.prepend(head);
      makeSlot(n);
    });
    document.querySelectorAll(".card").forEach(makeSlot);
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
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "edges");
    document.body.prepend(svg);
    if (document.querySelector(".chapters")) chapter(0);
  }

  function draw(e) {
    e.d = edgePath(boxOf(el(e.from)), boxOf(el(e.to)), e.opts);
    if (!e.path) {
      e.path = document.createElementNS(NS, "path");
      e.path.id = e.id;
      e.path.setAttribute("class", "edge");
      svg.appendChild(e.path);
    }
    e.path.setAttribute("d", e.d);
    syncEdge(e);
  }

  // An edge shows once both its parts are on stage, unless it waits for show().
  function syncEdge(e) {
    if (!e.path) return;
    const ends = !isHidden(el(e.from)) && !isHidden(el(e.to));
    e.path.classList.toggle("hidden", !(ends && (e.shown || !e.opts.manual)));
  }

  function edge(id, from, to, opts = {}) {
    const e = { id, from, to, opts, shown: false };
    edges.set(id, e);
    if (svg) draw(e);
  }

  function setShown(on, ids) {
    ids.forEach((id) => {
      if (edges.has(id)) edges.get(id).shown = on;
      else el(id).classList.toggle("hidden", !on);
    });
    edges.forEach(syncEdge);
  }
  const show = (...ids) => setShown(true, ids);
  const hide = (...ids) => setShown(false, ids);

  // Keeps the named parts in full colour and dims the rest; focus() clears it.
  function focus(...ids) {
    document.querySelectorAll(".node").forEach((n) => n.classList.toggle("dim", ids.length > 0 && !ids.includes(n.id)));
    edges.forEach((e) => e.path && e.path.classList.toggle("dim", ids.length > 0 && !(ids.includes(e.from) && ids.includes(e.to))));
  }

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

  // A new chapter starts with no part lit, good or bad.
  function chapter(i) {
    const pills = [...document.querySelectorAll(".chapters span")];
    if (!pills[i]) throw new Error(`stage: there is no chapter ${i}; the header lists ${pills.length}`);
    document.querySelectorAll(".node").forEach((n) => n.classList.remove("lit", "good", "bad"));
    pills.forEach((p, k) => {
      p.classList.toggle("now", k === i);
      p.classList.toggle("done", k < i);
    });
    const eyebrow = document.querySelector(".eyebrow");
    if (eyebrow) eyebrow.textContent = pills[i].dataset.eyebrow || pills[i].textContent;
  }

  const kindOf = (node) => KINDS.find((k) => node.classList.contains(k)) || "slate";

  function flow(id, kind = "slate", ms = 1300) {
    const e = edgeOf(id);
    e.shown = true;
    syncEdge(e);
    e.path.classList.remove("dim", ...KINDS);
    e.path.classList.add("flow", kind);
    clearTimeout(e.timer);
    e.timer = setTimeout(() => e.path.classList.remove("flow", kind), ms);
  }

  // Moves a copy of a chip (an element id, or text for a new chip) along an
  // edge, and resolves when it arrives. `kind` adds classes: "sky" or "sky text".
  function travel(id, chip, { reverse = false, ms = 900, kind } = {}) {
    const e = edgeOf(id);
    const source = document.getElementById(chip);
    let p;
    if (source) {
      p = source.cloneNode(true);
      p.removeAttribute("id");
      p.querySelectorAll("[id]").forEach((c) => c.removeAttribute("id"));
      p.classList.remove("gone", "hidden");
    } else {
      p = document.createElement("span");
      p.className = "chip slate";
      p.textContent = chip;
    }
    if (kind) p.classList.add(...kind.split(/\s+/));
    p.classList.add("packet");
    p.style.offsetPath = `path("${e.d}")`;
    document.body.appendChild(p);
    flow(id, kindOf(p), ms + 400);
    const a = p.animate(
      [
        { offsetDistance: "0%", opacity: 0, transform: "scale(.8)" },
        { offsetDistance: "8%", opacity: 1, transform: "scale(1)", offset: 0.08 },
        { offsetDistance: "92%", opacity: 1, transform: "scale(1)", offset: 0.92 },
        { offsetDistance: "100%", opacity: 0, transform: "scale(.8)" },
      ],
      { duration: ms, easing: "cubic-bezier(.45, 0, .25, 1)", direction: reverse ? "reverse" : "normal", fill: "forwards" },
    );
    return a.finished.then(() => p.remove(), () => p.remove());
  }

  // Pins a badge above a part's top-left corner; badge(id, null) takes it away.
  function badge(id, text, kind = "slate") {
    let b = badges.get(id);
    if (text == null) {
      if (b) b.classList.add("hidden");
      return;
    }
    const { x, y } = boxOf(el(id));
    if (!b) {
      b = document.createElement("span");
      document.body.appendChild(b);
      badges.set(id, b);
    }
    b.className = `badge hidden ${kind}`;
    b.textContent = text;
    b.style.left = `${x + 20}px`;
    b.style.top = `${y - 14}px`;
    requestAnimationFrame(() => b.classList.remove("hidden"));
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

  // What a reviewer would flag on screen right now, each issue once per take.
  // The recorder calls it once at the end of every line.
  function lint() {
    const issues = failures.splice(0);
    const W = innerWidth, H = innerHeight;
    const shown = (n) => {
      for (let p = n; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.1 || p.classList.contains("hidden")) return false;
        if (p.matches(".slot > [data-s]") && !p.classList.contains("on")) return false;
      }
      return true;
    };
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
      const box = p.closest(".screen") && !p.closest(".newtag") && p.closest(UI_BOX);
      if (box) {
        range.selectNodeContents(t);
        const tr = range.getBoundingClientRect(), br = box.getBoundingClientRect();
        if (tr.right > br.right + 1 || tr.bottom > br.bottom + 1 || tr.left < br.left - 1) issues.push(`"${text.slice(0, 40)}" runs out of its ${box.classList[0]} in #${p.closest(".screen").id}; shorten it or give the box room`);
      }
    }
    const boxes = [...document.querySelectorAll(".node, .card, .screen")].filter(shown);
    for (const b of boxes) {
      const inner = b.querySelector(":scope > .sv") || b;
      if (inner.scrollWidth > inner.clientWidth + 2 || inner.scrollHeight > inner.clientHeight + 2) issues.push(`#${b.id || b.className} has more content than fits in it`);
    }
    const rects = boxes.map((b) => ({ b, r: b.getBoundingClientRect() }));
    const overlap = (r, s, pad = 4) => r.left + pad < s.right && s.left + pad < r.right && r.top + pad < s.bottom && s.top + pad < r.bottom;
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i].r, rects[j].r)) issues.push(`#${rects[i].b.id} and #${rects[j].b.id} overlap`);
    const head = document.querySelector(".headline span:not(.out)"), chaps = document.querySelector(".chapters");
    if (head && chaps && overlap(head.getBoundingClientRect(), chaps.getBoundingClientRect(), 0)) issues.push(`the headline "${head.textContent}" runs into the chapters; shorten it`);
    const top = [document.querySelector(".headline"), chaps].filter(Boolean).map((n) => n.getBoundingClientRect());
    for (const { b, r } of rects) {
      if (b.classList.contains("screen") && top.some((t) => overlap(r, t, 0))) issues.push(`#${b.id} runs into the headline; start it below ${Math.ceil(Math.max(...top.map((t) => t.bottom)))} points`);
    }
    const live = [...edges.values()].filter(isLive);
    for (const e of live) {
      const bb = e.path.getBBox();
      if (bb.x < 0 || bb.y < 0 || bb.x + bb.width > W || bb.y + bb.height > H) issues.push(`edge ${e.id} runs off the stage; give it a smaller bend or other sides`);
      const near = rects.filter(({ b, r }) => b.id !== e.from && b.id !== e.to && r.left < bb.x + bb.width && bb.x < r.right && r.top < bb.y + bb.height && bb.y < r.bottom);
      if (!near.length) continue;
      const len = e.path.getTotalLength();
      const pts = [];
      for (let k = 1; k < SAMPLES; k++) pts.push(e.path.getPointAtLength((len * k) / SAMPLES));
      for (const { b, r } of near) {
        if (pts.some((pt) => pt.x > r.left + 4 && pt.x < r.right - 4 && pt.y > r.top + 4 && pt.y < r.bottom - 4)) issues.push(`edge ${e.id} crosses #${b.id}; route it with from/to sides or move a part`);
      }
    }
    const content = [...rects.map((x) => x.r), ...live.map((e) => e.path.getBoundingClientRect())];
    if (content.length) {
      const bottom = Math.max(...content.map((r) => r.bottom)), right = Math.max(...content.map((r) => r.right));
      if (bottom < H * 0.62 || right < W * 0.62) emptyLines++;
      if (emptyLines === 2) issues.push(`most of the stage stays empty (content ends at ${Math.round(right)}×${Math.round(bottom)} of ${W}×${H}); spread the parts over the whole stage`);
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
        edges.forEach(draw);
        root.ready = true;
      }));
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  root.stage = { steps, edge, show, hide, focus, mark, state, headline, chapter, flow, travel, badge, type, sleep, open, close, tap, lint };
})(typeof window !== "undefined" ? window : globalThis);
