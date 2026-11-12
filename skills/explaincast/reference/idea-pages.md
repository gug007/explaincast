# Idea pages

An idea is shown, not diagrammed. The page draws the product's own screens, and the beats act out each step in them: how something works, an architecture, a process, or a change that is still a plan. There are no boxes joined by arrows.

`new.js --file page.html` writes the starter and copies the kit beside it in `idea/`: `stage.css` for the look and `stage.js` for the calls below. Build on the starter. It runs as it is, and lint refuses it until every TODO is gone.

## The look

The page is a stage of 1100×620 points, and the video often plays it at phone size.

- **Every part is the window it really is.** A step that happens in a terminal is drawn as that terminal, a server's work as its log, stored data as the table or the file listing that holds it, an email as the inbox. If the viewer would never see a part, show what it produces: the file it writes, the row it saves, the response that comes back.
- **Draw the product's own UI.** Read its source, or open its web or demo build, and copy its layout, colours, font and labels. Set the colours as `--ui-*` variables in a class of the page's own (`.screen.product` in the starter). Fill it with sample data, never the user's.
- **Walk through it as it happens.** Each line is one thing that is seen or done: what is typed, what is pressed, what comes back. Say how it works underneath over the screen that shows the result.
- **A headline per step.** `stage.headline()` states the step's point in one sentence ("Every line is voiced first"), not its topic ("Voice"). Keep it short enough to clear the chapter list.
- **Act it out on the words.** `stage.tap` the control the line names, `stage.type` into a field, flip a switch with `stage.mark(id, "on")`, and show what happens with `stage.state`. A small control the line names gets a zoom from the beat: `s.zoom("#videoToggle", { cue: "Video switch" })`.
- **One window at a time.** It fills the stage under the headline. When the line moves to a second window or a phone, `stage.mark("app", "beside")` slides the first over and the other opens next to it. Close a window as the next one opens.
- **Keep a window for a whole stretch.** Give it states for each moment (the question, the run, the answer) instead of drawing it again. A sheet or a viewer over it is a `.ui-scrim` that starts `hidden` and comes in with `stage.show`.
- **Larger than life.** 15px text at least, as if the app were zoomed to about 125%. Keep a sidebar or a toolbar where it shows where things sit, and leave out what has nothing to do with the step.
- **Values, not code.** Show values and plain names, such as `k7Qx…9fA2` and `until 14:30`. Use code only when code is the topic.
- **For a plan, mark what's new.** `class="new"` puts a dashed ring and a "New" tag on what a change adds, and everything else is today's UI. Mark only the change itself. When a whole sheet is new, ring the sheet, not every row in it. A plan can close on small screens side by side, one per piece, in the order to build them, with the order in each title (`data-title="1 · Now: the automation"`).
- **End where it started.** The recap returns to the screens already shown, one point at a time.

## Markup

| Markup | What it is |
| --- | --- |
| `<h1 class="headline">` | The headline the page opens on |
| `<div class="eyebrow">` | The current chapter's name, set by `stage.chapter()` |
| `<nav class="chapters"><span>…</span></nav>` | Chapter progress. A span's `data-eyebrow` is what the eyebrow says in that chapter (`1 · Request`) |
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
| `<div class="states" id>` | Any element whose `[data-s]` children `stage.state()` switches |
| `class="hidden"` | Starts out of sight until `stage.show()` |
| `class="new"`, `data-new` | Rings what a change adds and tags it "New", or `data-new`'s text. The ring sits 4 points outside the element and the tag above its corner, so leave them room; a `.ui-video` clips its own, so ring what holds it |
| `<i data-icon="search">` | An inline icon |

Icons (Lucide): bell, bot, calendar, chart-line, clock, cloud, cpu, credit-card, database, file-text, folder, git-branch, globe, hard-drive, hash, inbox, key-round, layers, list, lock, mail, message-square, monitor, package, receipt, search, send, server, settings, shield-check, shopping-cart, smartphone, terminal, timer, truck, user, users, webhook, workflow, zap.

What the kit lacks, the page draws itself in its own `<style>`: a waveform, a table of rows, a file listing. Keep those at 15px or more too.

## stage.js

| Call | Notes |
| --- | --- |
| `stage.steps({ name: fn })` | Registers `window.go(name)` and sets `window.ready` once the page is laid out. A step may be async: it keeps running, and the beat does not wait for it |
| `stage.headline(text)` | Crossfades to a new headline |
| `stage.chapter(i)` | Lights chapter `i` (from 0) and sets the eyebrow |
| `stage.open(...ids)` | Opens screens. It resolves once they are in, so `await` it before a tap |
| `stage.close(...ids)` | Closes screens; `stage.close()` closes every open one. Call it without `await` to open the next screen as this one goes |
| `stage.tap(id)` | A tap on a control: a ripple from its centre and a short press. It resolves after the ripple |
| `stage.state(id, name)` | Shows the `[data-s="name"]` state of a screen or a `.states` element |
| `stage.show(...ids)`, `stage.hide(...ids)` | Anything that starts `hidden` |
| `stage.mark(id, cls, on)` | Toggles a class: `on` on a switch or a list row, `lit` to ring a control in the accent colour, `playing` on a video, `beside` or another class of the page's own on a screen |
| `stage.type(id, text, ms)` | Types text into an element |
| `stage.sleep(ms)` | Waits, inside an async step |
| `stage.lint()` | What the take reports at the end of every line |

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
async ask(s) {
  await s.at("types their question");
  await go(s, "type");
  await s.at("Send");
  await go(s, "send");
},
```

The take waits for `window.ready` before it starts. At the end of every line, it holds until the line has settled, so `frames/` shows the line's end, then runs `stage.lint()`. What that finds goes into the dry run and the report as warnings:

- text under 15px;
- text off the stage, or more than a screen holds;
- screens that overlap;
- a headline that runs into the chapters, or a screen that runs into the headline;
- text that runs out of its button, field, tag or card in a screen;
- a step that threw;
- a stage left mostly empty.

Fix each one.

## Layout

The headline takes the top 110 points. A window takes `left: 44px; top: 116px; width: 1012px; height: 480px`. Beside a phone it takes `width: 716px`, with the phone at `left: 806px; top: 116px; width: 240px; height: 480px`. Two windows side by side take `width: 496px` each, `20px` apart. Three small screens side by side take `width: 320px` each, `26px` apart.
