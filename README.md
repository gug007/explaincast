# explaincast

Give your coding agent a title and get a narrated explainer video back: an AI voice, clicks that land on the spoken words, zooms, captions and chapters.

Use it for walkthroughs, product demos, tutorials or explaining an idea, without recording your screen or your own voice. It records a website or web app, or an idea drawn as an HTML page. It can also record a desktop app, which is experimental for now.

[![How explaincast works, a 2-minute video made with explaincast](docs/how-it-works.jpg)](https://youtu.be/inHJLU1rwVw)

*How explaincast works, made with explaincast itself. Click the image to watch it on YouTube.*

Another example: [lpm in 3 minutes](https://youtu.be/hM9ArXSLITo), a tour of dev servers, Claude Code and Codex in one window.

## Install

explaincast is an [Agent Skill](https://agentskills.io), so it works in Claude Code, Codex, Gemini CLI, Cursor, GitHub Copilot, OpenCode and other agents that read `SKILL.md` skills.

In Claude Code, install it as a plugin:

```
/plugin marketplace add gug007/explaincast
/plugin install explaincast@explaincast
```

In any other agent, install it with the [skills CLI](https://github.com/vercel-labs/skills). It finds the agents on your Mac and asks which ones to add it to:

```
npx skills add gug007/explaincast -g
```

`-g` installs it for all your projects. Leave it out to install it only in the current project, or add `-a codex` (or `gemini-cli`, `cursor`, `github-copilot`, `opencode`) to choose the agent. To install by hand instead, clone this repo and link `skills/explaincast` into your agent's skills folder, such as `~/.agents/skills/` for Codex or `~/.gemini/skills/` for Gemini CLI.

You also need:

| Requirement | How to get it |
| --- | --- |
| macOS | Capture and the checks use its screen and text recognition APIs |
| Node.js | Tested on 24 |
| ffmpeg | `brew install ffmpeg` |
| Xcode Command Line Tools | `xcode-select --install` |
| Playwright | `npm install -g @playwright/cli` (tested on 0.1.17). Its Chromium downloads on the first run |
| An OpenAI API key, for the voice | See [Set up your OpenAI key](#set-up-your-openai-key) below |

Every run checks the machine first and tells you what is missing.

### Set up your OpenAI key

The voice and the word timing come from OpenAI, so explaincast needs your own API key. You do this once.

1. **Get a key.** Sign in at [platform.openai.com/api-keys](https://platform.openai.com/api-keys), click **Create new secret key** and copy it. It starts with `sk-`. The API is billed per use, so the account needs a payment method or credits under [Billing](https://platform.openai.com/settings/organization/billing).
2. **Save it in your Mac's Keychain.** Open Terminal, run this, paste the key when it says `Key:` and press Return. Nothing shows as you paste:

   ```
   printf 'Key: '; read -rs k; echo; security add-generic-password -s explaincast -a openai -U -w "$k"; unset k
   ```

   Don't use `security add-generic-password ... -w` on its own and paste at its prompt: that prompt keeps only the first 128 characters, and OpenAI keys are longer, so the saved key is cut short and OpenAI rejects it.

3. **Check it worked.** This prints `saved` without showing the key:

   ```
   security find-generic-password -s explaincast -a openai >/dev/null && echo saved
   ```

Run step 2 again to replace the key, or remove it with `security delete-generic-password -s explaincast -a openai`.

If you'd rather use an environment variable, add `export OPENAI_API_KEY=sk-...` to your `~/.zshrc` and open a new terminal. When it is set, it is used instead of the Keychain.

Never paste the key into your agent's chat.

## Use

In Claude Code:

```
/explaincast How checkout works
```

In Codex, type `$explaincast How checkout works`. In other agents, ask for it by name: "Use explaincast to make a video of how checkout works."

Say what to explain. The agent picks how to record it, writes the script, proves every click in a free dry run, records the take and reviews it. Each video gets a folder in `~/Movies/explaincast/` (set `EXPLAINCAST_DIR` to move it), holding the MP4, its `.srt` and `.vtt` captions and a `transcript.txt` of the script. Captions are not burned in.

To change something, ask the agent. It records again and voices only the lines you changed.

| You want a video of | Flag | What happens |
| --- | --- | --- |
| A website or web app | `--url <url>` | Runs headless, so you can keep using your Mac |
| An idea, architecture or process | `--file page.html` | The agent draws it as one map of the parts, with the data moving between them, and drives it, also headless |
| A planned feature, integration or redesign | `--file page.html --screens` | The agent draws the product's own screens with the change in them and walks through them, also headless |
| A desktop app, terminal or editor | `--app "<name>"` | Experimental. Takes over your real pointer and keyboard, so leave the Mac alone. Needs `brew install cliclick` and Screen Recording and Accessibility permissions |

To choose for yourself, add a flag from these tables, as in `/explaincast How checkout works --url http://localhost:3000 --for client`. In Claude Code, if another skill is also called `explaincast`, use the full name, `/explaincast:explaincast`.

Pick who it is for with `--for`:

| `--for` | Title cards | Music | Extras |
| --- | --- | --- | --- |
| `public` (default) | Yes | Yes | Chapter list, thumbnail, `youtube.txt` |
| `client` | Yes | No | Chapter list |
| `me` | No | No | Tighter pacing |

Every video, client ones included, uses explaincast's own look by default: a warm canvas and a serif title. That is fine for client work as it is. To use a client's brand instead, add a `look` to `.explaincast.json` at the project's root (or to one video's `video.json`):

```json
{
  "for": "client",
  "look": { "canvas": "#0e2a3c", "ink": "#ffffff", "font": "brand/Sans-Bold.woff2", "logo": "brand/logo.svg" }
}
```

`canvas` and `ink` set the cards' background and words, `font` takes a font file or the name of an installed font, and `logo` goes on the closing card. Every field is optional, so you can change only the colours. The full list is in [reference/beats.md](skills/explaincast/reference/beats.md).

## Good to know

- **Your narration goes to OpenAI**, for speech and transcription, on your own key. The recording stays on your Mac. Check before narrating anything confidential.
- **Nothing is blurred.** The checks flag your own account details, email addresses and any terms you list in `hide`, but they know no other names. For client work, record demo or staging data, or have a web video answer the app's requests with saved data (`mock` in [reference/beats.md](skills/explaincast/reference/beats.md)).
- **Music:** public videos use "Vastness" by Andrew Ev from [Mixkit](https://mixkit.co/license/#musicFree), free for use in videos. Mixkit's terms forbid redistributing the file, so it isn't in this repo: the first public video downloads it. Set `"music": false` in `video.json` to go without.

## Development

```
node --test test/*.test.js
```

Every `video.json` field and beat call is in [reference/beats.md](skills/explaincast/reference/beats.md), and the idea-page kit in [reference/idea-pages.md](skills/explaincast/reference/idea-pages.md).

## License

[MIT](LICENSE)
