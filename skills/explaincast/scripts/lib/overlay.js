// Browser-side stage overlay shared by every recording target: the drawn
// cursor and its tap ring, the topic card, and a small locator. `installStage`
// is serialised into the page, so it must stay self-contained.

// The warm canvas the cards and the app window share, and its three pale pools
// of peach, sand and sage (drifting on a card, still and fainter behind the app).
const CANVAS = "#ebe5d9";
const POOLS =
  "radial-gradient(40% 50% at 20% 30%, #f2d6c2, transparent 70%), radial-gradient(45% 55% at 80% 70%, #e9dcb6, transparent 70%), radial-gradient(35% 45% at 60% 20%, #d7e0cd, transparent 70%)";
const POOLS_AT_REST = "translate(-4%, -3%) rotate(0) scale(1)";

const OVERLAY_CSS = `
#explaincast-card { position: fixed; inset: 0; z-index: 2147483640; isolation: isolate; display: flex; align-items: center; justify-content: center; padding: 0 240px; background: ${CANVAS}; color: #141414; font: 600 150px/1.12 "Iowan Old Style", "Palatino", Georgia, serif; letter-spacing: -0.02em; text-align: center; text-wrap: balance; opacity: 0; pointer-events: none; }
#explaincast-card > div { position: relative; z-index: 1; }
#explaincast-card.cover { justify-content: flex-start; padding: 0 0 0 128px; text-align: left; font-size: 190px; line-height: 1.02; letter-spacing: -0.025em; }
#explaincast-card.cover > div { max-width: 880px; }
#explaincast-card::before { content: ""; position: absolute; inset: -20%; z-index: 0; filter: blur(60px); background: ${POOLS}; animation: explaincast-drift 26s ease-in-out infinite alternate; }
@keyframes explaincast-drift { from { transform: ${POOLS_AT_REST}; } to { transform: translate(4%, 3%) rotate(6deg) scale(1.08); } }
#explaincast-tick { position: fixed; left: 0; top: 0; width: 1px; height: 1px; pointer-events: none; z-index: 2147483647; opacity: 0.02; animation: explaincast-tick 1s linear infinite; }
@keyframes explaincast-tick { from { transform: translateX(0); } to { transform: translateX(1px); } }
#explaincast-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 40px; height: 40px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.65)); will-change: transform; }
#explaincast-ring { position: fixed; left: 0; top: 0; z-index: 2147483646; pointer-events: none; width: 76px; height: 76px; margin: -38px 0 0 -38px; border-radius: 50%; border: 5px solid rgba(255,255,255,.92); opacity: 0; }
`;

const CARD_FADE_MS = 300;
// The opening card hands over in one move: its words lift away over `titleMs`
// from `titleLeadMs` before the card's end, so they are gone before the window
// shows through; from `leadMs` before the end the card fades over `fadeMs` (its
// clip runs on past the end to cover it) while the window glides from beside
// the title into its place over `riseMs` (compose.js COVER).
const OPEN_LIFT = { titleLeadMs: 500, titleMs: 450, leadMs: 300, fadeMs: 700, riseMs: 900 };

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.5 3.2v16.3l4.3-4 2.6 5.9 2.9-1.3-2.6-5.8h5.9z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const HOTSPOT = { x: 9, y: 5 };

function installStage({ cursorSvg, hotspot, scale }) {
  const cur = document.createElement("div");
  cur.id = "explaincast-cursor";
  cur.innerHTML = cursorSvg;
  const ring = document.createElement("div");
  ring.id = "explaincast-ring";
  const card = document.createElement("div");
  card.id = "explaincast-card";
  const tick = document.createElement("div");
  tick.id = "explaincast-tick";
  document.body.append(card, ring, cur, tick);
  if (scale && scale !== 1) {
    cur.style.width = `${40 / scale}px`;
    cur.style.height = `${40 / scale}px`;
    ring.style.width = `${76 / scale}px`;
    ring.style.height = `${76 / scale}px`;
    ring.style.margin = `${-38 / scale}px 0 0 ${-38 / scale}px`;
    ring.style.borderWidth = `${5 / scale}px`;
    cur.style.filter = `drop-shadow(0 ${1 / scale}px ${1.5 / scale}px rgba(0,0,0,.65))`;
  }
  const hs = { x: hotspot.x / (scale || 1), y: hotspot.y / (scale || 1) };
  const state = { x: 0, y: 0 };
  const place = (x, y) => {
    state.x = x;
    state.y = y;
    cur.style.transform = `translate(${x - hs.x}px, ${y - hs.y}px)`;
  };
  const jerk = (t) => t * t * t * (10 + t * (-15 + 6 * t));
  let covered = false;
  // Inline !important beats the stray animation-level override that has been
  // seen zeroing the card's opacity; it is dropped to a plain value only while
  // a fade runs, then restored and the fade cancelled.
  const setOpacity = (v) => card.style.setProperty("opacity", String(v), "important");
  const fadeCard = (from, to, easing) => {
    card.style.setProperty("opacity", String(from));
    const a = card.animate([{ opacity: from }, { opacity: to }], { duration: 300, easing, fill: "forwards" });
    return a.finished.then(() => {
      setOpacity(to);
      a.cancel();
    });
  };
  setOpacity(0);

  window.__lc = {
    place,
    hideCursor: () => (cur.style.visibility = "hidden"),
    showCursor: () => (cur.style.visibility = ""),
    // Blank card canvas up before the first frame, so a video opens on it.
    cover() {
      card.replaceChildren();
      setOpacity(1);
      cur.style.visibility = "hidden";
      covered = true;
    },
    isCovered: () => covered,
    reveal() {
      if (!covered) return Promise.resolve();
      return fadeCard(1, 0, "ease-in").then(() => {
        cur.style.visibility = "";
        covered = false;
      });
    },
    // A topic card: the canvas fades in, the words rise and sharpen one after
    // another, the card holds, then fades out. `hold` leaves it up.
    card(title, ms, hold = false) {
      const fade = 300;
      const perWord = 110;
      const wordMs = 640;
      const inner = document.createElement("div");
      const words = title.split(/\s+/);
      words.forEach((w, i) => {
        const span = document.createElement("span");
        span.textContent = w;
        span.style.cssText = "display:inline-block; opacity:0; will-change:transform,filter,opacity";
        inner.append(span);
        if (i < words.length - 1) inner.append(document.createTextNode(" "));
      });
      card.replaceChildren(inner);
      // A long word or title shrinks to its column instead of running under
      // the window beside it.
      const widest = Math.max(...[...inner.children].map((s) => s.getBoundingClientRect().width));
      const fit = Math.min(1, inner.clientWidth / widest, (innerHeight * 0.8) / inner.getBoundingClientRect().height);
      if (fit < 1) inner.style.fontSize = `${parseFloat(getComputedStyle(inner).fontSize) * fit}px`;
      cur.style.visibility = "hidden";
      const shownAt = covered ? Promise.resolve() : fadeCard(0, 1, "ease-out");
      covered = true;
      const reveals = [...inner.children].map((span, i) =>
        span.animate(
          [
            { opacity: 0, transform: "translateY(0.35em)", filter: "blur(12px)" },
            { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
          ],
          { duration: wordMs, delay: 140 + i * perWord, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
        ),
      );
      const up = Math.max(140 + (words.length - 1) * perWord + wordMs, ms - 2 * fade);
      const shown = shownAt.then(() => new Promise((r) => setTimeout(r, up - fade)));
      if (hold) return shown;
      return shown
        .then(() => fadeCard(1, 0, "ease-in"))
        .then(() => {
          reveals.forEach((a) => a.cancel());
          card.replaceChildren();
          cur.style.visibility = "";
          covered = false;
        });
    },
    // The opening card's hand-over to the app: the words rise and blur away
    // while the mux fades the card and lifts the window into place.
    lift(ms) {
      const spans = [...card.querySelectorAll("span")];
      spans.forEach((span, i) =>
        span.animate(
          [
            { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
            { opacity: 0, transform: "translateY(-0.5em)", filter: "blur(12px)" },
          ],
          { duration: ms, delay: i * 30, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
        ),
      );
    },
    moveTo(x, y, ms) {
      const from = { ...state };
      const dx = x - from.x;
      const dy = y - from.y;
      const dist = Math.hypot(dx, dy);
      const bow = Math.min(0.12, 18 / Math.max(dist, 1)) * dist;
      const nx = dist ? -dy / dist : 0;
      const ny = dist ? dx / dist : 0;
      const frames = [];
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        const s = jerk(t);
        const b = Math.sin(Math.PI * t) * bow;
        const px = from.x + dx * s + nx * b;
        const py = from.y + dy * s + ny * b;
        frames.push({ transform: `translate(${px - hs.x}px, ${py - hs.y}px)` });
      }
      const anim = cur.animate(frames, { duration: ms, easing: "linear", fill: "forwards" });
      return anim.finished.then(() => {
        anim.commitStyles();
        anim.cancel();
        place(x, y);
      });
    },
    tap() {
      ring.style.left = `${state.x}px`;
      ring.style.top = `${state.y}px`;
      ring.animate(
        [
          { transform: "scale(.35)", opacity: 0.95 },
          { transform: "scale(1.1)", opacity: 0 },
        ],
        { duration: 460, easing: "cubic-bezier(.2,.7,.3,1)" },
      );
      cur.animate(
        [{ transform: `${cur.style.transform} scale(1)` }, { transform: `${cur.style.transform} scale(.86)` }, { transform: `${cur.style.transform} scale(1)` }],
        { duration: 180, easing: "ease-out" },
      );
    },
  };
}

module.exports = { CANVAS, POOLS, POOLS_AT_REST, OVERLAY_CSS, CURSOR_SVG, HOTSPOT, CARD_FADE_MS, OPEN_LIFT, installStage };
