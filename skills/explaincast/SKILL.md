---
name: explaincast
description: Makes a narrated explainer video of anything on screen, from a website or web app to an idea drawn as an HTML page or a desktop app. Title in; MP4 out, with an AI voice, clicks that land on the spoken words, zooms, captions and chapters. Use when the user wants a tutorial, walkthrough, demo, screencast or "show how it works" video, whether for the public, for a client, or to understand something themselves.
argument-hint: '<what to explain> [--url <url> | --file <page.html> | --app <name>] [--for public|client|me]'
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/new.js *) Bash(${CLAUDE_SKILL_DIR}/scripts/take.sh *)
---

# explaincast

A video is a folder in `~/Movies/explaincast/<slug>/` (`EXPLAINCAST_DIR` moves it) holding two files you write: `video.json`, the narration, target and audience, and `beats.js`, what happens on each line. Every line is voiced first and the take is recorded to the real clip lengths, so each action lands on its word.

`${CLAUDE_SKILL_DIR}` below is this skill's folder, the one holding this SKILL.md. If it still reads as a variable, put that folder's absolute path in its place. Run the scripts from the user's project folder, not this one, since `new.js` looks there for `.explaincast.json`.

macOS only. `take.sh` checks the machine before every run and names whatever is missing. If the OpenAI key is missing, give the user the steps it prints and wait for them to finish. Never ask for the key in the chat or run the Keychain command for them, since it prompts for the key.

## Workflow

1. Turn the request into a short, clean title. Use the target and audience it names; otherwise pick the target that fits the subject (see Target) and default to `public`, asking only when the subject leaves the target unclear. Then run `${CLAUDE_SKILL_DIR}/scripts/new.js "<title>" <target flag> [--for <audience>] [--brand "<closing card>"] [--card "<short title>"] [--slug <slug>]`. It prints the video's folder.
2. Learn the subject from its source or by using it, then write `video.json` and `beats.js`. [reference/beats.md](reference/beats.md) has every field and call.
3. Run `${CLAUDE_SKILL_DIR}/scripts/take.sh <folder> --speak-only`. It voices the lines and prints the video's real length. Every later run reuses each clip whose text is unchanged.
4. Run `${CLAUDE_SKILL_DIR}/scripts/take.sh <folder> --no-audio`, a free dry run that proves every beat on the real timing. `frames/` shows the window at each line's end, without cards or zooms.
5. Run `${CLAUDE_SKILL_DIR}/scripts/take.sh <folder>` in the foreground to record and render. It records in real time and then renders, so give the command a timeout well past the length step 3 printed.
6. Fix every warning, read `qa/report.json`, and look at `qa/sheet.jpg`, which has a tile for each line, card and zoom, and at `thumbnail.jpg`, whose moment the report's `thumbnail` names. A FAIL means the video isn't ready. A pass covers only what the report lists, so judge the tiles yourself.
7. End the reply with the MP4's absolute path, and say that captions are in the `.srt` beside it, not burned in.

Any change to the narration or the beats needs a new take. `--mux-only` renders the last take again without recording, after changing `music` or a recorded zoom (`zooms`). `--respeak` voices every line again, for a clip that came out wrong.

## Target

| Subject | Flag | Know that |
| --- | --- | --- |
| Website, web app | `--url <url>` | Headless, so the Mac stays free. Start any server first, and log in from `setup`. |
| Idea, architecture, process | `--file <page.html>` | Write a self-contained page and drive it from the beats ("Idea pages" in the reference). |
| Desktop app, terminal, editor | `--app "<name>"` | Experimental. Takes over the real pointer and keyboard: tell the user first and have them leave the Mac alone. |

When a desktop app also has a web build or a demo mode, record that with `--url`: the same UI on sample data, headless.

## Audience

| `--for` | Cards | Music | Extras | Privacy hits |
| --- | --- | --- | --- | --- |
| `public` (default) | yes | yes | chapter list, thumbnail, `youtube.txt` | FAIL |
| `client` | yes | no | chapter list | FAIL |
| `me` | no | no | tighter pacing | WARN |

A project can set defaults in `.explaincast.json` at its root: `target`, `for`, `brand`, `hide`, `pronounce`, `heard`, `voice`, `style`.

## Rules

- Say a control's name, then click it on that word (`cue`). A beat that runs past its word warns, and a late click reads as a mistake.
- Rest the pointer beside what a line is about, never on it. A pointer on a small target hides it, and no check can tell.
- Check every claim the narration makes against the real product. Sample data or a demo build can behave differently.
- Keep each video standalone: no teasers, and no YAML, config or CLI detail unless that is the topic.
- The checks flag the user's own details, any email address and `hide` terms, but know no other names, and nothing is blurred. For client work, record demo or staging data and list the client's sensitive terms in `hide`.
- Narration goes to OpenAI. Check before voicing anything confidential.
- `setup` runs off camera. Read credentials from the environment there, never from `video.json` or `beats.js`.
