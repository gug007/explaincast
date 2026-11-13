# Idea pages

An idea is shown, not diagrammed, and every idea video is drawn for its own subject. The page is a stage of scenes: each scene is one picture of the subject, drawn as the thing it really is, and the beats act out each step in it. There is no template to fill in and there are no boxes joined by arrows.

`new.js --file page.html` writes three things: a `treatment` to fill in in `video.json`, an empty stage, and the kit beside it in `idea/`. The kit is `stage.js` for the calls below, `stage.css` for the stage and its headline, and `windows.css`, an optional pack for scenes that are a product's screen. Lint refuses the video until the treatment is written, every scene it names is in the page, and every TODO is gone.

## The treatment

Write the treatment before the page. It decides what this video looks like, so two videos never share a picture by default.

```json
"treatment": {
  "subject": "A shop receipt, the days you wait, and the line that appears on your bank statement.",
  "look": "Paper and ink: a cream till receipt in a typewriter face on a dark counter, with the bank's blue for the statement.",
  "scenes": [
    { "id": "receipt", "shows": "The till receipt, with the returned item struck through and the amount owed back." },
    { "id": "wait", "shows": "A week of calendar days, crossed off one at a time while the bank holds the money." },
    { "id": "statement", "shows": "The bank statement, where the refund lands as a new line and the balance goes up." }
  ]
}
```

- **`subject`** lists the real things the viewer would recognise, in their words: the receipt, the calendar, the statement. Not "the payment service" or "the ledger".
- **`look`** says where the colours and type come from. Use the product's own when there is a product (read its source or its demo build), the project's `look` when it has one, and otherwise the subject's own world. Never guess a brand's colours.
- **`scenes`** has one entry per picture, three to five for most videos. Each `id` is a `<section class="scene" id="…">` in the page.

Pick each scene by what that part of the subject is:

| The line is about | Draw |
| --- | --- |
| Something the viewer uses | That screen, copied from the product (the windows pack) |
| Something that is made or kept | The thing itself: the document, the message, the file, the row in its table |
| An amount or a speed | The number, counting, or two bars or stopwatches side by side |
| Time passing or waiting | A calendar, a clock, a queue that shortens |
| A hand-off | The same object leaving one place and arriving in the next |
| Before and after | Both versions on the stage at once |

If the viewer would never see a part, show what it produces, not the part.

## The look

The page is a stage of 1100×620 points, and the video often plays it at phone size.

- **Every scene is the thing it really is.** A refund is a receipt and a statement, a deploy is a terminal and a live page, a schedule is a calendar. Draw each in the page's own `<style>`, with HTML, SVG or canvas.
- **Nothing is reused from another video.** The stage gives a headline and nothing else. Set `--bg`, `--ink`, `--accent` and `--sans` for this subject, and style every scene for it.
- **Walk through it as it happens.** Each line is one thing that is seen or done: what is typed, what is pressed, what arrives. Say how it works underneath over the scene that shows the result, and only when the request asks for the internals.
- **A headline per step.** `stage.headline()` states the step's point in one sentence ("The bank holds the money first"), not its topic ("Processing"). Keep it short enough to clear the chapter list.
- **Every line changes the picture.** Act each line out on its words: `stage.scene` to a new picture, `stage.draw` a mark, `stage.count` a number, `stage.move` an object, `stage.tap` a control, `stage.type` into a field, `stage.state` to what comes next. A line that leaves the stage as it was gets a warning.
- **Follow one object.** When something passes from scene to scene, keep its colour and its wording the same in each, so the viewer knows it again.
- **Keep a scene for a whole stretch.** Give its parts states for each moment instead of drawing the scene again.
- **Larger than life.** 15px text at least. Write labels in HTML, since the checks do not read SVG text. Leave out what has nothing to do with the step.
- **Values, not code.** Show values and plain names, such as `£34.00` and `Friday`. Use code only when code is the topic.
- **For a plan, mark what's new.** `class="new"` puts a dashed ring and a "New" tag on what a change adds, and everything else is today's. Mark only the change itself.
- **End where it started.** The recap returns to the scenes already shown, one point at a time.

## Markup

| Markup | What it is |
| --- | --- |
| `<h1 class="headline">` | The headline the page opens on |
| `<div class="eyebrow">` | The current chapter's name, set by `stage.chapter()` |
| `<nav class="chapters"><span>…</span></nav>` | Chapter progress. A span's `data-eyebrow` is what the eyebrow says in that chapter (`1 · Return`) |
| `<section class="scene" id>` | One picture of the subject. It covers the whole stage, so place what is in it in stage points, below the headline's 110. It starts out of sight until `stage.scene()` |
| `<div class="states" id>` | Any element whose `[data-s]` children `stage.state()` switches; the first shows at the start |
| `class="hidden"` | Starts out of sight until `stage.show()` or `stage.draw()` |
| `class="new"`, `data-new` | Rings what a change adds and tags it "New", or `data-new`'s text. The ring sits 4 points outside the element and the tag above its corner, so leave them room |
| `<i data-icon="search">` | An inline icon |
| `--bg`, `--ink`, `--muted`, `--line`, `--card`, `--accent`, `--sans`, `--mono` | The stage's colours and type, set on `:root` in the page |

Icons (Lucide): bell, bot, calendar, chart-line, clock, cloud, cpu, credit-card, database, file-text, folder, git-branch, globe, hard-drive, hash, inbox, key-round, layers, list, lock, mail, message-square, monitor, package, receipt, search, send, server, settings, shield-check, shopping-cart, smartphone, terminal, timer, truck, user, users, webhook, workflow, zap.

## stage.js

| Call | Notes |
| --- | --- |
| `stage.steps({ name: fn })` | Registers `window.go(name)` and sets `window.ready` once the page is laid out. A step may be async: it keeps running, and the beat does not wait for it |
| `stage.headline(text)` | Crossfades to a new headline |
| `stage.chapter(i)` | Lights chapter `i` (from 0) and sets the eyebrow |
| `stage.scene(id)` | Shows that scene and takes the others away. It resolves once the scene is in, so `await` it before acting in it |
| `stage.show(...ids)`, `stage.hide(...ids)` | Anything that starts `hidden` |
| `stage.state(id, name)` | Shows the `[data-s="name"]` state of a `.states` element or a screen |
| `stage.mark(id, cls, on)` | Toggles a class of the page's own on an element, such as `in` on a row that has arrived |
| `stage.draw(id, ms)` | Draws an SVG shape along its stroke, or every shape inside the element, in `ms` (900): a strike-through, a tick, a line on a chart. Start it `hidden` |
| `stage.count(id, to, { ms, from, prefix, suffix, places })` | Counts the number in an element up or down to `to`: `stage.count("balance", 446.6, { prefix: "£", places: 2 })` |
| `stage.move(id, to, { ms })` | Slides an element until its centre is on another element's centre (`to` is its id) or on `[x, y]` in stage points. `stage.move(id)` slides it home. It resolves on arrival |
| `stage.tap(id)` | A tap on a control: a ripple from its centre and a short press. It resolves after the ripple |
| `stage.type(id, text, ms)` | Types text into an element |
| `stage.sleep(ms)` | Waits, inside an async step |
| `stage.open(...ids)`, `stage.close(...ids)` | Opens and closes screens of the windows pack |
| `stage.lint()` | What the take reports at the end of every line |

The receipt scene of the treatment above, and the steps that act it out:

```html
<style>
:root { --bg: #20242b; --ink: #f4efe4; --accent: #e9b44c; --type: "American Typewriter", "Courier New", monospace; }
.paper { position: absolute; left: 330px; top: 124px; width: 440px; height: 470px; padding: 26px 30px; background: #f6f0e1; color: #2a2620; font: 500 19px/1.5 var(--type); rotate: -1.5deg; }
.item { position: relative; display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #b8ae98; }
.item svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.item path { fill: none; stroke: #b3261e; stroke-width: 3; }
</style>
<section class="scene" id="receipt">
  <div class="paper">
    <div class="item"><span>Tea towels</span><span>£9.00</span></div>
    <div class="item"><span>Kettle</span><span>£34.00</span><svg class="hidden" id="strike" viewBox="0 0 100 20" preserveAspectRatio="none"><path d="M0 11 C 30 6, 70 15, 100 9"/></svg></div>
    <div class="item hidden" id="owed"><span>Owed back to you</span><span id="amount">£0.00</span></div>
  </div>
</section>
```

```js
strike: async () => {
  stage.headline("The shop takes the kettle off your receipt");
  await stage.scene("receipt");
  await stage.draw("strike", 600);
},
owed: async () => {
  stage.show("owed");
  await stage.count("amount", 34, { prefix: "£", places: 2 });
},
```

## Other subjects, other pictures

These are treatments to learn from, not to copy. A new subject gets its own.

| Subject | Scenes | Look |
| --- | --- | --- |
| Why a saved copy makes a page fast (an idea) | Two stopwatches, one per visit, running side by side; the shelf the saved copy sits on; the page arriving from the shelf | The site's own colours, with large stopwatch digits |
| What happens when you save a note (an architecture) | The note as you typed it; the same note as a line in the app's activity list; the same note as a row in a table of notes | The notes app's paper yellow, one handwriting face |
| How an expense gets paid (a process) | The claim form; the manager's inbox with the claim in it; the payslip with the amount added | Office stationery: carbon-copy pink and blue, a stamp for "Approved" |
| A Video switch beside Send (a planned feature) | The app's own window, with the switch ringed as new; the answer playing as a video | Copied from the app's source |

## The windows pack

When a scene is a product's screen, link `idea/windows.css` after `stage.css` and draw the screen with it. Use it for that scene only: a subject that is not a screen is not drawn in a window.

- **Draw the product's own UI.** Copy its layout, colours, font and labels. Set the colours as `--ui-*` variables in a class of the page's own. Fill it with sample data, never the user's.
- **One window at a time.** It fills the stage under the headline. When the line moves to a second window or a phone, a class of the page's own slides the first over (`stage.mark("app", "beside")`) and the other opens next to it.
- **A sheet or a viewer** over a window is a `.ui-scrim` that starts `hidden` and comes in with `stage.show`.
- A small control the line names gets a zoom from the beat: `s.zoom("#videoToggle", { cue: "Video switch" })`.

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
| `.ui-tag` (a kind) | A small label or status. Kinds: `amber`, `indigo`, `sky`, `green`, `red`, `violet`; keep one kind for one sort of thing through the video |
| `.ui-card` | A panel in the window: a question, a message, a result |
| `.ui-scrim` | Dims the window behind a sheet or a viewer; put a `.ui-card` in it |
| `.ui-term` | Terminal or log output, line by line as written |
| `.ui-video` `data-time` (`playing`) | A video player with a play button, a progress bar and the length; text inside is its poster. `playing` plays it. A `.ui-cc` inside is a caption line |
| `.ui-muted`, `.ui-link` | Quiet text, a link |

`stage.mark` toggles the pack's classes too: `on` on a switch or a list row, `lit` to ring a control in the accent colour, `playing` on a video.

```html
<link rel="stylesheet" href="idea/windows.css">
<style>
.screen.lpm { --ui-bg: #262626; --ui-panel: #1e1e1e; --ui-ink: #e5e5e5; --ui-muted: #a3a3a3; --ui-line: #3a3a3a; --ui-accent: #60a5fa; }
#tab { left: 44px; top: 116px; width: 1012px; height: 480px; }
</style>
<section class="scene" id="chat">
<div class="screen lpm" id="tab" data-title="docs-site">
  <div class="ui-main">
    <div class="ui-term ui-grow">● Fixed the hook. Tests pass.</div>
    <div class="ui-card">
      <div class="ui-field">Why does the hook fail?</div>
      <div class="ui-row"><span class="ui-grow"></span><span class="ui-switch new" id="videoToggle">Video</span><span class="ui-btn primary">Send</span></div>
    </div>
  </div>
</div>
</section>
```

```js
toggle: async () => {
  stage.headline("A Video switch beside Send");
  await stage.scene("chat");
  await stage.open("tab");
  await stage.tap("videoToggle");
  stage.mark("videoToggle", "on");
},
```

A window takes `left: 44px; top: 116px; width: 1012px; height: 480px`. Beside a phone it takes `width: 716px`, with the phone at `left: 806px; top: 116px; width: 240px; height: 480px`. Two windows side by side take `width: 496px` each, `20px` apart.

## Beats

`new.js` puts `go()` at the top of beats.js. A beat waits for each cue word and runs that word's step:

```js
async returned(s) {
  await s.at("strikes it off");
  await go(s, "strike");
  await s.at("thirty four pounds");
  await go(s, "owed");
},
```

The take waits for `window.ready` before it starts. At the end of every line, it holds until the line has settled, so `frames/` shows the line's end, then runs `stage.lint()`. What that finds goes into the dry run and the report as warnings:

- a line that changed nothing on the stage (a line under a card is exempt);
- text under 15px;
- text off the stage, or run into the headline;
- a headline that runs into the chapters;
- a step that threw;
- a stage left mostly empty;
- in a window: more than it holds, text that runs out of its button, field, tag or card, windows that overlap, or one that runs into the headline.

Fix each one, then look at `frames/`: the checks cannot tell whether a scene looks like its subject.
