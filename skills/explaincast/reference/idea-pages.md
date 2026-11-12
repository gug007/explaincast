# Idea pages

An idea is drawn as one page and driven from the beats, in one of two styles:

- **Map**, for how something works: an architecture, a process, an idea. One map of the parts, with data moving between them. `new.js --file page.html` writes its starter.
- **[Screens](#screens)**, for a change to a product: a feature, an integration, a redesign, a plan. Only the product's own UI with the change in it, one screen at a time, and no map. `new.js --file page.html --screens` writes its starter.

`new.js` copies the kit beside the page in `idea/`: `stage.css` for the look and `stage.js` for the calls below. Build on the starter. It runs as it is, and lint refuses it until every TODO is gone.

## The Map look

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

## Map markup

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
| `stage.show(...ids)`, `stage.hide(...ids)` | Parts, cards, edges, and anything that starts `hidden` |
| `stage.focus(...ids)` | Dims every part not named, and every edge not between two named parts. `stage.focus()` lights everything again |
| `stage.state(id, name)` | Shows the `[data-s="name"]` state of a part, a card, a screen or a `.states` element |
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

## Screens

A Screens page explains a change to a product with the product itself: its own window, drawn with the change in place, one screen at a time. The headline states each step's point, and the screen shows it.

- **Draw the product's own UI.** Read its source, or open its web or demo build, and copy its layout, colours, font and the labels around the change. Set the colours as `--ui-*` variables in a class of the page's own (`.screen.product` in the starter). Fill it with sample data, never the user's.
- **Walk through it as the user would.** Each line is one thing the user sees or does: the new control, what it opens, what comes back. Say how it works underneath over the screen that results, not with a diagram.
- **Larger than life.** 15px text at least, as if the app were zoomed to about 125%. Keep a sidebar or a toolbar where it shows where the change sits, and leave out what has nothing to do with it.
- **Mark what's new.** `class="new"` puts a dashed ring and a "New" tag on what the change adds, and everything else is today's UI. Mark only the change itself. When a whole sheet is new, ring the sheet, not every row in it.
- **Act it out on the words.** `stage.tap` the control the line names, `stage.type` into a field, flip a switch with `stage.mark(id, "on")`, and show what happens with `stage.state`. A small control the line names gets a zoom from the beat: `s.zoom("#videoToggle", { cue: "Video switch" })`.
- **One window at a time.** It fills the stage under the headline. When the line moves to a phone, `stage.mark("app", "beside")` slides the window over and the phone opens next to it. Close a window as the next one opens.
- **Keep a window for a whole stretch.** Give it states for each moment (the question, the run, the answer) instead of drawing it again. A sheet or a viewer over it is a `.ui-scrim` that starts `hidden` and comes in with `stage.show`.
- **End on the pieces to build.** A plan can close on small screens side by side, one per piece, in the order to build them, with the order in each title (`data-title="1 · Now: the automation"`).

| Markup | What it is |
| --- | --- |
| `<div class="screen" id data-title>` | A desktop window with a title bar. Place it with `left`, `top`, `width` and `height`; it starts closed. Its children fill the window under the title bar, top to bottom, and its `[data-s]` children are its states. A class that changes its place or size animates it |
| `class="screen phone"` | A phone with a status bar |
| `class="screen dark"` | Dark `--ui-*` defaults |
| `--ui-bg`, `--ui-panel`, `--ui-ink`, `--ui-muted`, `--ui-line`, `--ui-accent`, `--ui-on-accent`, `--ui-font`, `--ui-mono`, `--ui-radius` | The product's look, set on the screen |
| `.ui-split` with `.ui-side` and `.ui-main` | A sidebar beside the main area |
| `.ui-bar`, `.ui-row`, `.ui-col`, `.ui-grow` | A toolbar, a row, a column, a spacer |
| `.ui-item` (`on`) | A sidebar or list row |
| `.ui-btn` (`primary`, `wide`) | A button |
| `.ui-field` | An input or a composer; `.ui-muted` text in it reads as a placeholder |
| `.ui-switch` (`on`) | A toggle switch; its text is the label |
| `.ui-tag` (a kind) | A small label or status |
| `.ui-card` | A panel in the window: a question, a message, a result |
| `.ui-scrim` | Dims the window behind a sheet or a viewer; put a `.ui-card` in it |
| `.ui-term` | Terminal or log output, line by line as written |
| `.ui-video` `data-time` (`playing`) | A video player with a play button, a progress bar and the length; text inside is its poster. `playing` plays it. A `.ui-cc` inside is a caption line |
| `.ui-muted`, `.ui-link` | Quiet text, a link |
| `<div class="states" id>` | Any element whose `[data-s]` children `stage.state()` switches |
| `class="new"`, `data-new` | Rings what the change adds and tags it "New", or `data-new`'s text. The ring sits 4 points outside the element and the tag above its corner, so leave them room; a `.ui-video` clips its own, so ring what holds it |

| Call | Notes |
| --- | --- |
| `stage.open(...ids)` | Opens screens. It resolves once they are in, so `await` it before a tap |
| `stage.close(...ids)` | Closes screens; `stage.close()` closes every open one. Call it without `await` to open the next screen as this one goes |
| `stage.tap(id)` | A tap on a control: a ripple from its centre and a short press. It resolves after the ripple |

```html
<style>
.screen.lpm { --ui-bg: #262626; --ui-panel: #1e1e1e; --ui-ink: #e5e5e5; --ui-muted: #a3a3a3; --ui-line: #3a3a3a; --ui-accent: #60a5fa; }
#tab { left: 44px; top: 116px; width: 1012px; height: 480px; }
</style>
<div class="screen lpm" id="tab" data-title="docs-site">
  <div class="ui-main">
    <div class="ui-term ui-grow">● Fixed the hook. Tests pass.</div>
    <div class="ui-card">
      <div class="ui-field">Why does the hook fail?</div>
      <div class="ui-row"><span class="ui-grow"></span><span class="ui-switch new" id="videoToggle">Video</span><span class="ui-btn primary">Send</span></div>
    </div>
  </div>
</div>
```

```js
toggle: async () => {
  stage.headline("A Video switch beside Send");
  await stage.open("tab");
  await stage.tap("videoToggle");
  stage.mark("videoToggle", "on");
},
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
- a headline that runs into the chapters, or a screen that runs into the headline;
- text that runs out of its button, field, tag or card in a screen;
- an edge off the stage or through a part;
- a step that threw;
- a stage left mostly empty.

Fix each one.

## Layout

The headline takes the top 110 points. The Map starter places four parts over the rest: two in the middle row (`top: 228`) and two stacked at the right (`top: 116` and `360`), with a card under the centre part and a U-shaped edge along the bottom. Move them to fit the subject, and keep the map reaching the stage's edges. Five or six parts fit at 240 points wide, and more fit with `style="width: 200px"`.

On a Screens page, a window takes `left: 44px; top: 116px; width: 1012px; height: 480px`. Beside a phone it takes `width: 716px`, with the phone at `left: 806px; top: 116px; width: 240px; height: 480px`. Three small screens side by side take `width: 320px` each, `26px` apart.
