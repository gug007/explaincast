# video.json and beats.js

## video.json

| Field | Meaning |
| --- | --- |
| `title` | The video's title |
| `for` | `public`, `client` or `me` |
| `target` | `{ type: "web", url \| file, cursor, colorScheme }` or `{ type: "window", app \| launch }`; both take `width`, `height` (default 1100×620 points, at most 1200×680). `file` is relative to the folder. `cursor: false` hides the drawn pointer. `launch` is `[command, ...args]`: a copy of its own, ended after the take, where `app` uses the running app's largest window |
| `narration` | `[{ id, text, chapter? }]`, one beat per id, in order. A line without `text` is a silent pause of `ms`. `chapter` names a chapter from that line on |
| `brand` | The closing card's words; the end is `{ "id": "outro", "ms": 3200 }` with `s.card(brand, { hold: true })` |
| `hide` | Terms the checks flag on screen |
| `pronounce` | `{ "nginx": "engine x" }`: how the voice says a word; captions keep the written one |
| `heard` | `{ "sas": "sass" }`: how the transcript spells a word the voice says right |
| `voice`, `style` | TTS voice (`marin`) and style prompt |
| `music` | `true`, `false` or a file, overriding the audience |
| `zooms` | Changes to recorded zooms, by the id the render log prints, applied with `--mux-only`: `{ "line#1": { scale, at, ms, drop } }` |
| `cover` | `{ words, line, at, crop, style: "window" \| "closeup" }` or `{ image }`: the thumbnail. Without one, a public video's thumbnail is the opening card's words beside the window at the take's best still: a settled moment of a main view, full of content, with nothing the checks flag. The render log and `qa/report.json` give it as a `cover` to pin or change. `"card"` keeps the words alone |
| `speedUpWaits` | `false` keeps waits real time. By default a silence over 2.5 s between lines plays faster under a badge |
| `youtube` | `{ hook: [], learn: [], tags: [] }` for `youtube.txt` |

## beats.js

```js
module.exports = {
  async setup({ page, context, video, dir, log }) {}, // off camera; a window target gets { pid, video, dir, log }
  async title(s, line) { await s.card("Short title"); }, // one per narration id
};
```

The runner waits for each line's clip plus a short gap before the next beat. A beat that outlasts its line delays the next one, and the checks call that dead air.

## The stage (`s`)

| Call | Notes |
| --- | --- |
| `s.click(sel, { at, ms, cue, settle, verify, verifyMs })` | Glides, then presses where the target is now. `verify` (a selector that must become visible, or an async fn) must pass or the press repeats, twice at most, then the take stops. Use it wherever a missed click would ruin the rest |
| `s.moveTo(sel, { at, ms, cue, after })` | `at` is `[x, y]` in the target, 0–1 inside it; outside that range rests the pointer beside it (`[0.5, 1.4]` sits just below). `cue` finishes the glide on that word |
| `s.type(text, { words, after })`, `s.press("Enter")`, `s.keys("cmd+k")` | `words: true` types in bursts, for long text |
| `s.zoom(sel, { scale, at, ms, cue })`, `s.zoomOut({ ms, cue })` | 1.6–2 for a small control; stays until zoomed out, and a second zoom pans from the first. The crop stops at the canvas, so a target near an edge sits off-centre. Use a few per video |
| `s.card(title, { hold, until, ms })` | Title left; the window's left 58% live at its right, so whatever a beat does behind a card shows there. `until: "<cue>"` ends it on that word |
| `s.hideCursor()`, `s.showCursor()` | A card shows the cursor again when it ends |
| `s.waitFor(sel, timeout)`, `s.waitGone(sel, timeout)`, `s.until(fn, { timeout, label })` | `until` warns instead of stopping when it times out |
| `s.at("phrase")`, `s.hold(ms)`, `s.holdUntil(msIntoLine)`, `s.cueMs("phrase")` | The narration clock. `at` waits for a word, and warns when the beat is already past it |
| `s.warn(kind, message)`, `s.frame(name)`, `s.log(m)` | Warnings reach the checks; `frame` writes an extra image to `frames/` |

Web only: `s.page` is the Playwright page and `s.scrollTo(sel)` scrolls on camera. A target outside the view scrolls in by itself before a click or zoom.

## Idea pages

Build the page with its states ahead of time, expose a function per step, and call each on its word. Set `"cursor": false`.

```js
async edge(s) {
  await s.at("next door");
  await s.page.evaluate(() => show("edge"));
},
```

## Selectors

Web takes Playwright selectors: `role=button[name="Save"]`, `text=Reports`, `#id`. A role's name matches part of the label, so `[name="Start"]` also finds "Restart"; `[name="Start"s]` matches exactly. An element without an accessible name needs CSS and its text instead, such as `div[role=button]:has-text("Settings")`. Check that a selector finds one visible element before the take.

Window takes `"text=<words on screen>"`, read with Vision from the current frame, or `[x, y]` as fractions of the window; read coordinates off a dry run's frames.

## Length

A video runs for its lines, plus about 0.5 s per line, 0.5 s up front, and 1.8 s at the end, or a held end card's `ms` instead.

## Traps

- A cue near a line's start can't finish a 750 ms glide: shorten `ms` or put words before it.
- A web take is one window with no browser chrome.
- A window take shows the app's real content and the machine's real names. In a terminal, set a plain prompt before the take.
