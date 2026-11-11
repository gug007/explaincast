// Browser-side stage overlay shared by every recording target: the drawn
// cursor and its tap ring, the topic card, and a small locator. `installStage`
// is serialised into the page, so it must stay self-contained.

// explaincast's own look, the default for every audience: the warm canvas the
// cards and the app window share, its three pale pools of peach, sand and sage
// (drifting on a card, still and fainter behind the app) and a serif. video.json
// "look" swaps in a brand's (look.js).
const CANVAS = "#ebe5d9";
const INK = "#141414";
const SERIF = `"Iowan Old Style", "Palatino", Georgia, serif`;
// Where each pool sits; a brand's pool colours take these places in order.
const POOL_SHAPES = ["40% 50% at 20% 30%", "45% 55% at 80% 70%", "35% 45% at 60% 20%"];
const poolsOf = (colours) => colours.map((c, i) => `radial-gradient(${POOL_SHAPES[i]}, ${c}, transparent 70%)`).join(", ");
const POOLS = poolsOf(["#f2d6c2", "#e9dcb6", "#d7e0cd"]);
const POOLS_AT_REST = "translate(-4%, -3%) rotate(0) scale(1)";

// The card in a look's colours and face; `pools: null` leaves the canvas flat.
// A brand's logo sits at the top of the title column, on the closing card.
function overlayCss({ canvas = CANVAS, ink = INK, font = SERIF, pools = POOLS } = {}) {
  return `
#explaincast-card { position: fixed; inset: 0; z-index: 2147483640; isolation: isolate; display: flex; align-items: center; justify-content: center; padding: 0 240px; background: ${canvas}; color: ${ink}; font: 600 150px/1.12 ${font}; letter-spacing: -0.02em; text-align: center; text-wrap: balance; opacity: 0; pointer-events: none; }
#explaincast-card > div { position: relative; z-index: 1; }
#explaincast-card.cover { justify-content: flex-start; padding: 0 0 0 128px; text-align: left; font-size: 190px; line-height: 1.02; letter-spacing: -0.025em; }
#explaincast-card.cover > div { max-width: 880px; }
${pools ? `#explaincast-card::before { content: ""; position: absolute; inset: -20%; z-index: 0; filter: blur(60px); background: ${pools}; animation: explaincast-drift 26s ease-in-out infinite alternate; }` : ""}
@keyframes explaincast-drift { from { transform: ${POOLS_AT_REST}; } to { transform: translate(4%, 3%) rotate(6deg) scale(1.08); } }
#explaincast-logo { position: absolute; left: 128px; top: 112px; z-index: 1; height: 120px; max-width: 640px; object-fit: contain; object-position: left center; opacity: 0; }
#explaincast-tick { position: fixed; left: 0; top: 0; width: 1px; height: 1px; pointer-events: none; z-index: 2147483647; opacity: 0.02; animation: explaincast-tick 1s linear infinite; }
@keyframes explaincast-tick { from { transform: translateX(0); } to { transform: translateX(1px); } }
#explaincast-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 40px; height: 40px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.65)); will-change: transform; }
#explaincast-ring { position: fixed; left: 0; top: 0; z-index: 2147483646; pointer-events: none; width: 76px; height: 76px; margin: -38px 0 0 -38px; border-radius: 50%; border: 5px solid rgba(255,255,255,.92); opacity: 0; }
`;
}

const OVERLAY_CSS = overlayCss();

const CARD_FADE_MS = 300;
// The opening card hands over in one move: its words lift away over `titleMs`
// from `titleLeadMs` before the card's end, so they are gone before the window
// shows through; from `leadMs` before the end the card fades over `fadeMs` (its
// clip runs on past the end to cover it) while the window glides from beside
// the title into its place over `riseMs` (compose.js COVER).
const OPEN_LIFT = { titleLeadMs: 500, titleMs: 450, leadMs: 300, fadeMs: 700, riseMs: 900 };

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.5 3.2v16.3l4.3-4 2.6 5.9 2.9-1.3-2.6-5.8h5.9z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const HOTSPOT = { x: 9, y: 5 };

// `logo` (a data URL) is the brand's mark, shown on the cards that ask for it.
function installStage({ cursorSvg, hotspot, scale, logo }) {
  const cur = document.createElement("div");
  cur.id = "explaincast-cursor";
  cur.innerHTML = cursorSvg;
  let mark = null;
  if (logo) {
    mark = document.createElement("img");
    mark.id = "explaincast-logo";
    mark.alt = "";
    mark.src = logo;
  }
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
    logoReady: () => (mark ? mark.decode().catch(() => {}) : Promise.resolve()),
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
    // another, the card holds, then fades out. `hold` leaves it up. `withLogo`
    // puts the brand's logo above the words (the closing card), rising first.
    card(title, ms, hold = false, withLogo = false) {
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
      const logoShown = withLogo && mark ? [mark] : [];
      card.replaceChildren(...logoShown, inner);
      // A long word or title shrinks to its column instead of running under
      // the window beside it, and below the logo when there is one.
      const widest = Math.max(...[...inner.children].map((s) => s.getBoundingClientRect().width));
      const room = logoShown.length ? 0.6 : 0.8;
      const fit = Math.min(1, inner.clientWidth / widest, (innerHeight * room) / inner.getBoundingClientRect().height);
      if (fit < 1) inner.style.fontSize = `${parseFloat(getComputedStyle(inner).fontSize) * fit}px`;
      cur.style.visibility = "hidden";
      const shownAt = covered ? Promise.resolve() : fadeCard(0, 1, "ease-out");
      covered = true;
      const reveals = [...logoShown, ...inner.children].map((span, i) =>
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

module.exports = { CANVAS, INK, SERIF, POOLS, POOLS_AT_REST, poolsOf, overlayCss, OVERLAY_CSS, CURSOR_SVG, HOTSPOT, CARD_FADE_MS, OPEN_LIFT, installStage };
