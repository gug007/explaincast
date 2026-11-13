// Checks a video's script before anything is spoken or launched: every line
// has a beat and every cue word is in its line. A mistake here would otherwise
// surface minutes into a take.
const fs = require("fs");
const path = require("path");
const { norm, findPhrase } = require("./words");
const { audienceOf } = require("./audience");
const { lookProblems } = require("./look");
const { fixtureProblems } = require("./fixtures");

const MAX_FRAME = { w: 1200, h: 680 };

const TEASER = /\b(next (video|video|episode)|in the next (one|part)|coming up next|see you (next|in the next)|stay tuned)\b/i;
const CUE = /\b(cue|until)\s*:\s*(["'`])((?:(?!\2)[^\\\n])+)\2/g;
const CUE_MS = /\b(?:cueMs|at)\(\s*(["'`])((?:(?!\1)[^\\\n])+)\1/g;

function cuesIn(fn) {
  const src = fn.toString();
  const out = [];
  for (const m of src.matchAll(CUE)) out.push({ phrase: m[3], at: m.index });
  for (const m of src.matchAll(CUE_MS)) out.push({ phrase: m[2], at: m.index });
  return out.filter((c) => !c.phrase.includes("${")).sort((a, b) => a.at - b.at);
}

const sentences = (text) => (text.match(/[^.!?]+[.!?]*/g) || []).map((x) => x.trim()).filter(Boolean);

const LOCAL_REF = /\b(?:src|href)\s*=\s*["']([^"'#?]+)/g;

// A page target: every local file it loads is there and, on the idea kit, the starter's placeholders are gone.
function checkPage(html, name, base, errors) {
  if (html.includes("idea/stage.js") && /\bTODO\b/.test(html)) errors.push(`the page ${name} still has a TODO placeholder`);
  for (const [, ref] of html.matchAll(LOCAL_REF)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref) || ref.includes("${")) continue;
    if (!fs.existsSync(path.resolve(base, decodeURI(ref)))) errors.push(`the page ${name} loads ${ref}, which is not there`);
  }
}

const SCENE_TAG = /<[a-z][^>]*\bclass\s*=\s*["'](?:[^"']*\s)?scene(?:\s[^"']*)?["'][^>]*>/gi;
const scenesIn = (html) => [...html.matchAll(SCENE_TAG)].map(([tag]) => tag.match(/\bid\s*=\s*["']([^"']+)/)?.[1]).filter(Boolean);

// video.json "treatment": what an idea video is made of, written before its
// page. Every scene it names is drawn in the page, and the page draws no other.
function checkTreatment(video, errors, warnings, dir) {
  const t = video.treatment;
  const text = (v) => typeof v === "string" && v.trim();
  if (!t || typeof t !== "object" || Array.isArray(t)) return errors.push('video.json "treatment" is { "subject", "look", "scenes" }');
  if (/\bTODO\b/.test(JSON.stringify(t))) return errors.push('video.json "treatment" still has a TODO placeholder; write it before the page');
  if (!text(t.subject)) errors.push('video.json treatment has no "subject": the real things this video shows');
  if (!text(t.look)) errors.push('video.json treatment has no "look": where its colours and type come from');
  const scenes = Array.isArray(t.scenes) ? t.scenes : [];
  if (!scenes.length) return errors.push('video.json treatment has no "scenes": [{ "id", "shows" }]');
  const ids = new Set();
  for (const s of scenes) {
    if (!text(s?.id) || !text(s?.shows)) errors.push(`video.json treatment: a scene needs an "id" and what it "shows" (${JSON.stringify(s).slice(0, 60)})`);
    else if (ids.has(s.id)) errors.push(`video.json treatment: scene "${s.id}" is listed twice`);
    else ids.add(s.id);
  }
  const page = dir && video.target?.file && path.resolve(dir, video.target.file);
  if (!page || !fs.existsSync(page)) return;
  const drawn = new Set(scenesIn(fs.readFileSync(page, "utf8")));
  for (const id of ids) if (!drawn.has(id)) errors.push(`treatment scene "${id}" is not in the page; draw it as <section class="scene" id="${id}">`);
  for (const id of drawn) if (!ids.has(id)) warnings.push(`the page has a scene "${id}" that the treatment does not list`);
}

function checkTarget(t, errors, dir) {
  if (!t || !["web", "window"].includes(t.type)) return errors.push('video.json "target" needs a "type": "web" or "window"');
  if (t.type === "web" && !t.url && !t.file) errors.push('a web target needs "url" or "file"');
  if (t.file && dir) {
    const page = path.resolve(dir, t.file);
    if (!fs.existsSync(page)) errors.push(`the target file ${t.file} is not there (a relative path starts at the video folder)`);
    else checkPage(fs.readFileSync(page, "utf8"), t.file, path.dirname(page), errors);
  }
  if (t.type === "window" && !t.app && !t.launch) errors.push('a window target needs "app" or "launch"');
  if ((t.width || 0) > MAX_FRAME.w || (t.height || 0) > MAX_FRAME.h) errors.push(`the target is at most ${MAX_FRAME.w}x${MAX_FRAME.h} points, or it runs off the canvas`);
  errors.push(...fixtureProblems(t, dir));
}

// Whether video.json "youtube" still holds new.js's placeholders.
const youtubeTodo = (video) => /\bTODO\b/.test(JSON.stringify(video.youtube || {}));

// `dir` (the video folder) checks the files video.json names.
function checkVideo(video, beats, { dir = null } = {}) {
  const errors = [];
  const warnings = [];
  if (!video.title) errors.push("video.json has no title");
  checkTarget(video.target, errors, dir);
  if (video.treatment !== undefined) checkTreatment(video, errors, warnings, dir);
  let audience;
  try {
    audience = audienceOf(video);
  } catch (e) {
    errors.push(e.message);
    return { errors, warnings };
  }
  const narration = Array.isArray(video.narration) ? video.narration : [];
  if (!narration.length) errors.push("video.json has no narration lines");
  const seen = new Set();
  for (const line of narration) {
    if (!line.id) errors.push(`a narration line has no id: ${JSON.stringify(line).slice(0, 60)}`);
    else if (seen.has(line.id)) errors.push(`narration id "${line.id}" is used twice`);
    seen.add(line.id);
    if (line.id === "setup") errors.push('a narration line is called "setup", the name of the hook that runs before the take; rename it');
    if (!line.text && line.ms == null) warnings.push(`line "${line.id}" has neither text nor ms; it will be a 3 s pause`);
    if (/\bTODO\b/.test(`${line.text || ""} ${line.chapter || ""}`)) errors.push(`line "${line.id}" still has a TODO placeholder`);
  }
  for (const line of narration) {
    const beat = beats[line.id];
    if (typeof beat !== "function") {
      errors.push(`no beat for narration line "${line.id}"`);
      continue;
    }
    if (/\bTODO\b/.test(beat.toString())) errors.push(`beat "${line.id}" still has a TODO placeholder`);
    const all = norm(line.text || "");
    let last = -1;
    for (const { phrase } of cuesIn(beat)) {
      const want = norm(phrase);
      const at = findPhrase(all, want);
      if (!line.text) {
        errors.push(`beat "${line.id}" waits for "${phrase}", but its line is silent`);
        continue;
      }
      if (at < 0) {
        errors.push(`beat "${line.id}": cue "${phrase}" is not in its line ("${line.text}")`);
        continue;
      }
      if (findPhrase(all, want, at + 1) >= 0) warnings.push(`beat "${line.id}": cue "${phrase}" occurs more than once in its line; the first one is used`);
      if (at < last) warnings.push(`beat "${line.id}": cue "${phrase}" comes earlier in the line than the cue before it, so it fires at once`);
      last = Math.max(last, at);
    }
  }
  for (const [id, fn] of Object.entries(beats)) {
    if (id !== "setup" && typeof fn === "function" && !seen.has(id)) warnings.push(`beat "${id}" has no narration line and never runs`);
  }
  for (const line of narration) {
    if (!line.text) continue;
    if (TEASER.test(line.text)) errors.push(`line "${line.id}" points at another video ("${line.text.match(TEASER)[0]}"); each video stands alone`);
    const parts = sentences(line.text);
    const lastSentence = parts.at(-1) || "";
    if (parts.length > 1 && norm(lastSentence).length <= 2) {
      warnings.push(`line "${line.id}" ends on a very short sentence ("${lastSentence}"); the voice tends to drop those, fold it into the one before`);
    }
  }
  if (audience.cards && narration.length) {
    const first = beats[narration[0].id];
    if (typeof first === "function" && !/\.card\(/.test(first.toString())) warnings.push(`the first beat ("${narration[0].id}") shows no title card; open on s.card("<title>")`);
    const end = narration.at(-1);
    const endBeat = beats[end.id];
    if (video.brand && (end.text || (typeof endBeat === "function" && !/card\([^)]*hold/.test(endBeat.toString())))) {
      warnings.push(`the last line should be silent ({ "id": "outro", "ms": 3200 }) with s.card(${JSON.stringify(video.brand)}, { hold: true })`);
    }
  }
  if (youtubeTodo(video)) warnings.push('video.json "youtube" still has TODO placeholders');
  for (const [id, edit] of Object.entries(video.zooms || {})) {
    const bad = Object.keys(edit).filter((k) => !["scale", "at", "ms", "drop"].includes(k));
    if (!/^[^#]+#\d+$/.test(id)) errors.push(`video.json zooms: "${id}" is not a zoom id (<line>#<n>, see the mux log)`);
    if (bad.length) errors.push(`video.json zooms["${id}"]: unknown ${bad.join(", ")} (scale, at, ms or drop)`);
  }
  checkEdit(video, seen, errors, warnings, dir);
  errors.push(...lookProblems(video.look, dir));
  return { errors, warnings };
}

// video.json "speedUpWaits" and "cover" (edit.js, cover.js).
function checkEdit(video, ids, errors, warnings, dir) {
  if (video.speedUpWaits != null && typeof video.speedUpWaits !== "boolean") errors.push('video.json "speedUpWaits" is true or false');
  if (video.keys != null && typeof video.keys !== "boolean") errors.push('video.json "keys" is true or false (false leaves out the key badges)');
  const cover = video.cover;
  if (typeof cover === "string") {
    if (cover !== "card") errors.push(`video.json cover is "card", { "image" } or { "words", "line", ... } (got "${cover}")`);
  } else if (cover?.image) {
    if (dir && !fs.existsSync(path.resolve(dir, cover.image))) errors.push(`video.json cover: the image "${cover.image}" is not in the video folder`);
  } else if (cover) {
    if (!cover.words) errors.push('video.json cover has no "words" (two to four, bigger than the title card\'s)');
    else if (cover.words.split(/\s+/).length > 5) warnings.push(`the cover's words ("${cover.words}") are many for a thumbnail; two to four read at feed size`);
    if (!ids.has(cover.line)) errors.push(`video.json cover: "line" names "${cover.line}", which is not a narration line`);
    if (cover.style && !["window", "closeup"].includes(cover.style)) errors.push(`video.json cover: style "${cover.style}" is "window" or "closeup"`);
    if (cover.crop && !(Array.isArray(cover.crop) && cover.crop.length === 4 && cover.crop.every((v) => typeof v === "number" && v >= 0))) {
      errors.push('video.json cover: "crop" is [x, y, width, height] in the window\'s points');
    }
  }
}

// Loads the video folder's video.json and beats.js and checks them.
function lintDir(dir) {
  const video = JSON.parse(fs.readFileSync(path.join(dir, "video.json"), "utf8"));
  let beats;
  try {
    beats = require(path.join(dir, "beats.js"));
  } catch (e) {
    return { errors: [`beats.js does not load: ${e.message.split("\n")[0]}`], warnings: [] };
  }
  return checkVideo(video, beats, { dir });
}

module.exports = { checkVideo, lintDir, youtubeTodo };
