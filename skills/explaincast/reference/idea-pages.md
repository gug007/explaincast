# Idea pages

An idea, architecture or process is drawn as one page and driven from the beats. `new.js --file page.html` writes a starter page and copies the kit beside it in `idea/`: `stage.css` for the look and `stage.js` for the calls below. Build on the starter. It runs as it is, and lint refuses it until every TODO is gone.

## The look

The page is a stage of 1100×620 points, and the video often plays it at phone size.

- **One map for the whole video.** Place every part once, spread over the whole stage, and never move it. Chapters change what is lit and what each part holds, not where things are.
- **A headline per step.** `stage.headline()` states the step's point in one sentence ("Only its hash goes in the database"), not its topic ("Storage"). Keep it short enough to clear the chapter list.
- **One thing in full colour.** `stage.focus()` the parts the line is about, and the rest dim.
- **Data moves on its verb.** When the line says sends, saves or returns, `stage.travel()` a chip along that edge on that word.
- **A colour is a kind.** Give each sort of value one kind (amber for the token, indigo for its hash) and keep it for the whole video.
- **Each part shows what it holds.** A part's states show its value now: the form, the token, the stored row.
- **Values, not code.** Show values and plain names, such as `k7Qx…9fA2` and `until 14:30`, not `randomBytes(32)`. Use code only when code is the topic.
- **15px at least.** The kit's sizes already are. Keep what you add there too, and leave out uppercase micro-labels.
- **End on the same map.** The recap lights the parts again, one rule at a time.

## Markup

| Markup | What it is |
| --- | --- |
| `<div class="eyebrow">` | The current chapter's name, set by `stage.chapter()` |
| `<h1 class="headline">` | The headline the page opens on |
| `<nav class="chapters"><span>…</span></nav>` | Chapter progress. A span's `data-eyebrow` is what the eyebrow says in that chapter (`1 · Request`) |
| `<div class="node" id data-icon data-title data-sub>` | A part, 240 points wide. Place it with `left` and `top` in the page's `<style>`. Its `[data-s]` children are its states; the first shows until `stage.state()` picks another |
| `<div class="card" id>` | A detail panel on the stage, with an optional `<h5>` and its own states. Give it a size |
| `<span class="chip amber" id="token">` | A value. `text` sets it in the text face, `gone` strikes it out |
| `<span class="pill green">` | A short label or status; `lit` inverts it |
| `<div class="check" id>` | A checklist row, ticked by `stage.mark(id, "on")`; a `<small>` inside sits on the right |
| `.field`, `.btn`, `.url`, `.muted`, `.done-text`, `.row` | Small pieces: an input, a button (`press`), a URL with its highlighted part in `<i>`, quiet text, a done line, a row |
| `class="hidden"` | Starts off stage until `stage.show()` |
| `<i data-icon="key-round">` | An inline icon |

Kinds: `amber`, `indigo`, `sky`, `green`, `red`, `violet` and `slate`, the default. A kind on a chip, pill, badge or travelling copy colours it and the edge it travels.

Icons (Lucide): bell, bot, calendar, chart-line, clock, cloud, cpu, credit-card, database, file-text, folder, git-branch, globe, hard-drive, hash, inbox, key-round, layers, list, lock, mail, message-square, monitor, package, receipt, search, send, server, settings, shield-check, shopping-cart, smartphone, terminal, timer, truck, user, users, webhook, workflow, zap.

## stage.js

| Call | Notes |
| --- | --- |
| `stage.edge(id, from, to, { from, to, shift, bend, manual })` | Joins two parts by id, out of the sides that face each other unless `from`/`to` name them. Two ends on the same side make a U that reaches `bend` points (90) past the further one; route an edge that way when it would cross a part. `shift` moves the ends along their sides (a number, or `[from, to]`), for two edges between the same parts. An edge shows once both its parts are on stage; with `manual: true` it waits for `stage.show(id)` |
| `stage.steps({ name: fn })` | Registers `window.go(name)` and sets `window.ready` once the page is laid out. A step may be async: it keeps running, and the beat does not wait for it |
| `stage.headline(text)` | Crossfades to a new headline |
| `stage.chapter(i)` | Lights chapter `i` (from 0), sets the eyebrow, and clears `lit`, `good` and `bad` from every part |
| `stage.show(...ids)`, `stage.hide(...ids)` | Parts, cards and edges |
| `stage.focus(...ids)` | Dims every part not named, and every edge not between two named parts. `stage.focus()` lights everything again |
| `stage.state(id, name)` | Shows a part's or card's `[data-s="name"]` state |
| `stage.mark(id, cls, on)` | Toggles a class: `lit`, `good` or `bad` on a part, `on` on a check, `lit` on a pill, `gone` on a chip, `press` on a button |
| `stage.travel(edge, chip, { reverse, ms, kind })` | Moves a copy of a chip (its id, or text for a new chip) along an edge in `ms` (900). `kind` adds classes, such as `"sky text"`. It resolves on arrival, so `await` it before the part that receives it changes state |
| `stage.flow(edge, kind)` | Lights an edge without a chip |
| `stage.badge(id, text, kind)` | Pins a badge above a part; `stage.badge(id, null)` takes it away |
| `stage.type(id, text, ms)` | Types text into an element |
| `stage.sleep(ms)` | Waits, inside an async step |
| `stage.lint()` | What the take reports at the end of every line |

```js
stage.edge("send", "browser", "server");
stage.edge("back", "email", "browser", { from: "bottom", to: "bottom" });
stage.steps({
  hash: async () => {
    stage.headline("Only its hash goes in the database");
    stage.focus("server", "db");
    await stage.travel("store", "hashChip");
    stage.state("db", "row");
  },
});
```

## Beats

`new.js` puts `go()` at the top of beats.js. A beat waits for each cue word and runs that word's step:

```js
async make(s) {
  await s.at("random token");
  await go(s, "mint");
  await s.at("only its hash");
  await go(s, "hash");
},
```

The take waits for `window.ready` before it starts. At the end of every line, it holds until the line has settled, so `frames/` shows the line's end, then runs `stage.lint()`. What that finds goes into the dry run and the report as warnings:

- text under 15px;
- text off the stage, or more than a part or card holds;
- parts that overlap;
- a headline that runs into the chapters;
- an edge off the stage or through a part;
- a step that threw;
- a stage left mostly empty.

Fix each one.

## Layout

The headline takes the top 110 points. The starter places four parts over the rest: two in the middle row (`top: 228`) and two stacked at the right (`top: 116` and `360`), with a card under the centre part and a U-shaped edge along the bottom. Move them to fit the subject, and keep the map reaching the stage's edges. Five or six parts fit at 240 points wide, and more fit with `style="width: 200px"`.
