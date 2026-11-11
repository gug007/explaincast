// The look the cards, the thumbnail and the canvas behind the window share.
// Without video.json "look" it is explaincast's own, for every audience,
// client videos included; with one, a brand's colours, face and logo:
//   "look": { "canvas": "#0e2a3c", "ink": "#ffffff", "font": "brand/Sans-Bold.woff2",
//             "logo": "brand/logo.svg", "pools": false }
// Every field is optional. Paths start at the video folder (new.js turns the
// ones in .explaincast.json into absolute paths).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { CANVAS, INK, SERIF, POOLS, poolsOf } = require("./overlay");

const FIELDS = ["canvas", "ink", "font", "logo", "pools"];
const SANS = `system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`;
const FONT_FILES = { ".woff2": ["font/woff2", "woff2"], ".woff": ["font/woff", "woff"], ".ttf": ["font/ttf", "truetype"], ".otf": ["font/otf", "opentype"] };
const LOGO_FILES = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
// The face a font file is loaded as, so no installed font can stand in for it.
const BRAND_FACE = "explaincast-brand";

// Only plain colour notations: they go into CSS as they are.
const COLOUR = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|rgba|hsl|hsla)\([\d\s.,%/+-]+\))$/i;
const FAMILY = /^[\p{L}\p{N} ._-]+$/u;

const isFontFile = (font) => Object.hasOwn(FONT_FILES, path.extname(font).toLowerCase());
const where = (file, dir) => (path.isAbsolute(file) || !dir ? file : path.resolve(dir, file));

// What is wrong with a "look", as messages; `dir` (the video folder) checks
// that its files are there.
function lookProblems(look, dir = null) {
  if (look == null) return [];
  if (typeof look !== "object" || Array.isArray(look)) return ['video.json "look" is an object: { canvas, ink, font, logo, pools }'];
  const problems = [];
  const unknown = Object.keys(look).filter((k) => !FIELDS.includes(k));
  if (unknown.length) problems.push(`video.json look: unknown ${unknown.join(", ")} (canvas, ink, font, logo or pools)`);
  for (const k of ["canvas", "ink"]) {
    if (look[k] != null && !(typeof look[k] === "string" && COLOUR.test(look[k].trim()))) problems.push(`video.json look: "${k}" is a colour such as "#0e2a3c", "rgb(14 42 60)" or "hsl(203 62% 15%)" (got ${JSON.stringify(look[k])})`);
  }
  const { font, logo, pools } = look;
  if (font != null) {
    if (typeof font !== "string" || !font.trim()) problems.push('video.json look: "font" is a font file (.woff2, .woff, .ttf or .otf) or the name of a font installed on this Mac');
    else if (isFontFile(font)) {
      if ((dir || path.isAbsolute(font)) && !fs.existsSync(where(font, dir))) problems.push(`video.json look: the font file "${font}" is not there (a relative path starts at the video folder)`);
    } else if (/\.\w{2,5}$/.test(font)) problems.push(`video.json look: "font" ${font} is not a font file it can load (.woff2, .woff, .ttf or .otf)`);
    else if (!FAMILY.test(font)) problems.push(`video.json look: "font" ${JSON.stringify(font)} is not a font name (letters, digits, spaces, dots and hyphens)`);
  }
  if (logo != null) {
    if (typeof logo !== "string" || !Object.hasOwn(LOGO_FILES, path.extname(logo).toLowerCase())) problems.push('video.json look: "logo" is an image file: .svg, .png, .jpg or .webp');
    else if ((dir || path.isAbsolute(logo)) && !fs.existsSync(where(logo, dir))) problems.push(`video.json look: the logo "${logo}" is not there (a relative path starts at the video folder)`);
  }
  if (pools != null && typeof pools !== "boolean") {
    const ok = Array.isArray(pools) && pools.length >= 1 && pools.length <= 3 && pools.every((c) => typeof c === "string" && COLOUR.test(c.trim()));
    if (!ok) problems.push('video.json look: "pools" is true, false, or one to three colours for the soft pools, as in ["#1d4d6b", "#24506e"]');
  }
  return problems;
}

const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;

// video.json "look" as the renderers use it: colours, a CSS font stack with
// the @font-face that loads a font file, the pools' gradient (null for a flat
// canvas) and the logo as a data URL. A brand's own canvas goes without the
// pools unless it asks for them, since explaincast's are tinted for its warm
// canvas. `key` changes whenever any of it does, so drawings made for an
// earlier look are never reused.
function lookOf(look, dir) {
  const problems = lookProblems(look, dir);
  if (problems.length) throw new Error(problems.join("\n"));
  const l = look || {};
  const canvas = l.canvas?.trim() || CANVAS;
  const ink = l.ink?.trim() || INK;
  let font = SERIF;
  let fontFace = "";
  if (l.font && isFontFile(l.font)) {
    const [type, format] = FONT_FILES[path.extname(l.font).toLowerCase()];
    fontFace = `@font-face { font-family: "${BRAND_FACE}"; src: url("${dataUrl(where(l.font, dir), type)}") format("${format}"); font-weight: 100 900; font-style: normal; }\n`;
    font = `"${BRAND_FACE}", ${SANS}`;
  } else if (l.font) {
    font = `"${l.font.trim()}", ${SANS}`;
  }
  const pools = Array.isArray(l.pools) ? poolsOf(l.pools.map((c) => c.trim())) : l.pools === false || (l.canvas && l.pools !== true) ? null : POOLS;
  const logo = l.logo ? dataUrl(where(l.logo, dir), LOGO_FILES[path.extname(l.logo).toLowerCase()]) : null;
  const key = crypto.createHash("sha1").update(JSON.stringify([canvas, ink, font, fontFace, pools, logo])).digest("hex").slice(0, 12);
  return { canvas, ink, font, fontFace, pools, logo, key, brand: !!look };
}

const DEFAULT_LOOK = lookOf(null);

module.exports = { lookOf, lookProblems, isFontFile, DEFAULT_LOOK };
