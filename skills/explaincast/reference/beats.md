# video.json and beats.js

## video.json

| Field | Meaning |
| --- | --- |
| `title` | The video's title |
| `for` | `public`, `client` or `me` |
| `target` | `{ type: "web", url \| file, cursor, colorScheme, clock, mock }` or `{ type: "window", app \| launch }`; both take `width`, `height` (default 1100×620 points, at most 1200×680). `file` is relative to the folder. `cursor: false` hides the drawn pointer. `launch` is `[command, ...args]`: a copy of its own, ended after the take, where `app` uses the running app's largest window. `clock` (web) is when the page's time starts, as in `"2026-03-14T10:00"` on this Mac's clock; it runs on from there, the same in every take. `mock` (web) answers requests instead of the server: `{ "**/api/user": "fixtures/user.json", "https://api.example.com/plan": { "name": "Team" } }`, a file from the folder or the JSON itself, and the first pattern that matches wins |
| `narration` | `[{ id, text, chapter? }]`, one beat per id, in order. A line without `text` is a silent pause of `ms`. `chapter` names a chapter from that line on |
| `brand` | The closing card's words; the end is `{ "id": "outro", "ms": 3200 }` with `s.card(brand, { hold: true })` |
| `look` | A brand's look for the cards, the thumbnail and the canvas behind the window: `{ canvas, ink, font, logo, pools }`, every field optional. Without it, explaincast's own (warm canvas, serif, pools) for every audience, client videos included. `canvas` and `ink` are colours (`"#0e2a3c"`, `rgb()`, `hsl()`); `font` is a `.woff2`, `.woff`, `.ttf` or `.otf` file, or the name of a font installed on the Mac; `logo` is an `.svg`, `.png`, `.jpg` or `.webp` set above the words of a held card, the closing one; `pools` is `true`, `false` or one to three colours, and a brand's own `canvas` is flat unless it asks for them. Paths start at the video folder. `--mux-only` applies a change |
| `hide` | Terms the checks flag on screen |
| `pronounce` | `{ "nginx": "engine x" }`: how the voice says a word; captions keep the written one |
| `heard` | `{ "sas": "sass", "super base": "supabase" }`: how the transcript spells a word or phrase the voice says right. A voice NOTE in `qa/report.json` gives the entry to add |
| `voice`, `style` | TTS voice (`marin`) and style prompt |
| `music` | `true`, `false` or a file, overriding the audience |
| `zooms` | Changes to recorded zooms, by the id the render log prints, applied with `--mux-only`: `{ "line#1": { scale, at, ms, drop } }` |
| `cover` | `{ words, line, at, crop, style: "window" \| "closeup" }` or `{ image }`: the thumbnail. Without one, a public video's thumbnail is the opening card's words beside the window at the take's best still: a settled moment of a main view, full of content, with nothing the checks flag. The render log and `qa/report.json` give it as a `cover` to pin or change. `"card"` keeps the words alone |
| `speedUpWaits` | `false` keeps waits real time. By default a silence over 2.5 s between lines plays faster under a badge |
| `keys` | `false` leaves out the badges that show the keys `s.keys` and `s.press` pressed. `--mux-only` applies a change |
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
| `s.drag(from, to, { at, dropAt, cue, ms, dragMs, hold, settle })` | Presses on `from`, carries it to `to` and lets go. `at` aims inside `from`, `dropAt` inside `to`; `cue` lands the pick-up on its word. The real pointer moves in steps, so drag-and-drop code sees a drag |
| `s.type(text, { words, after })` | `words: true` types in bursts, for long text |
| `s.press("Enter", { cue, badge })`, `s.keys("cmd+k", { cue, badge })` | Each press shows its keys as a badge under the window for a moment (`⌘ K`); `badge: false` leaves one out, video.json `"keys": false` all of them. `cue` presses on that word |
| `s.zoom(sel, { scale, at, ms, cue })`, `s.zoomOut({ ms, cue })` | 1.6–2 for a small control; stays until zoomed out, and a second zoom pans from the first. The crop stops at the canvas, so a target near an edge sits off-centre. A web take aims where the target is once the zoom lands, so it can zoom on something still sliding in. Use a few per video |
| `s.card(title, { hold, until, ms })` | Title left; the window's left 58% live at its right, so whatever a beat does behind a card shows there. `until: "<cue>"` ends it on that word |
| `s.hideCursor()`, `s.showCursor()` | A card shows the cursor again when it ends |
| `s.waitFor(sel, timeout)`, `s.waitGone(sel, timeout)`, `s.until(fn, { timeout, label })` | `until` warns instead of stopping when it times out |
| `s.at("phrase")`, `s.hold(ms)`, `s.holdUntil(msIntoLine)`, `s.cueMs("phrase")` | The narration clock. `at` waits for a word, and warns when the beat is already past it |
| `s.warn(kind, message)`, `s.frame(name)`, `s.log(m)` | Warnings reach the checks; `frame` writes an extra image to `frames/` |

Web only: `s.page` is the Playwright page and `s.scrollTo(sel)` scrolls on camera. A target outside the view scrolls in by itself before a click or zoom. `s.upload(sel, files, { verify, ...click })` clicks the control that opens the file picker and picks `files` (paths from the video folder); a headless take draws no picker, so the file is simply there.

At the end of every line, a web take warns when the pointer rests on a small control the line names, since it hides what the line is about.

## Idea pages

`new.js --file page.html` writes a starter page of the product's own screens, with its kit in `idea/`, and a beats.js whose `go()` runs a step of the page. Each beat calls a step on its word, and the take checks the page itself at the end of every line. [idea-pages.md](idea-pages.md) has the look, the markup and every `stage` call.

```js
async send(s) {
  await s.at("Send");
  await go(s, "send");
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
