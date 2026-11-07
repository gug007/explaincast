// The flags make.js and preflight.js read, parsed strictly: a mistyped flag
// stops the run instead of being ignored.
const path = require("path");
const { parseArgs } = require("util");

const FLAGS = {
  "speak-only": "voice the narration and print its real length, without a take",
  "no-audio": "dry run: no voice, no render; frames/ shows each line's end",
  "mux-only": "render the last take again without recording, after a music or zooms change",
  respeak: "voice every line again, even where its text is unchanged",
};

const usage = (script) => `usage: ${script} <video folder or slug> [flags]\n${Object.entries(FLAGS).map(([k, v]) => `  --${k.padEnd(11)} ${v}`).join("\n")}`;

// `positional: "optional"` lets preflight run without a video.
function parseCli(argv, { script, positional = "required" } = {}) {
  const options = Object.fromEntries(Object.keys(FLAGS).map((k) => [k, { type: "boolean" }]));
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options, strict: true, allowPositionals: true });
  } catch (e) {
    throw new Error(`${e.message}\n${usage(script)}`);
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) throw new Error(`one video at a time (got ${positionals.join(", ")})\n${usage(script)}`);
  if (!positionals.length && positional === "required") throw new Error(usage(script));
  return { o: values, video: positionals[0] || null };
}

// A path (anything with a slash) is used as it is; a bare slug is looked up
// under `root`.
const videoDir = (arg, root) => (arg.includes("/") ? path.resolve(arg) : path.join(root, arg));

module.exports = { parseCli, videoDir };
