// node preflight.js [<video folder>] [flags], run by take.sh before make.js.
// Sets up what it can (Chromium, the music bed, the native helpers) and lists
// the rest with the step that fixes it, exiting 1.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { DEFAULT_BED } = require("./mix");
const { parseCli, videoDir } = require("./cli");
const { lintDir } = require("./lint");
const { helper } = require("./helpers");
const { audienceOf } = require("./audience");
const { KEY_STEPS } = require("./voice");

const ROOT = process.env.EXPLAINCAST_DIR || path.join(os.homedir(), "Movies/explaincast");
let cli;
try {
  cli = parseCli(process.argv.slice(2), { script: "preflight.js", positional: "optional" });
} catch (e) {
  console.error(`preflight: ${e.message}`);
  process.exit(2);
}
const { o } = cli;
const dir = cli.video ? videoDir(cli.video, ROOT) : null;
const videoFile = dir && path.join(dir, "video.json");
const video = videoFile && fs.existsSync(videoFile) ? JSON.parse(fs.readFileSync(videoFile, "utf8")) : {};
const muxOnly = !!o["mux-only"];
const audio = !o["no-audio"];
const windowTake = !muxOnly && video.target?.type === "window";

const done = [];
const missing = [];
const notes = [];
const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: "utf8", ...opts });
const onPath = (bin) => run("/usr/bin/which", [bin]).status === 0;
const host = process.env.__CFBundleIdentifier || process.env.TERM_PROGRAM || "the terminal app";

function tools() {
  if (process.platform !== "darwin") missing.push("macOS: the capture and the checks use its screen and text recognition APIs");
  for (const bin of ["ffmpeg", "ffprobe"]) if (!onPath(bin)) missing.push(`${bin}: brew install ffmpeg`);
  if (onPath("ffmpeg") && !run("ffmpeg", ["-hide_banner", "-encoders"]).stdout.includes("libx264")) missing.push("ffmpeg without libx264: brew reinstall ffmpeg");
  if (run("xcode-select", ["-p"]).status !== 0) missing.push("Xcode Command Line Tools: xcode-select --install");
}

function chromium() {
  let browser;
  try {
    browser = require("./browser");
  } catch (e) {
    missing.push(e.message);
    return;
  }
  if (browser.CHROME && fs.existsSync(browser.CHROME)) return;
  const cliPath = path.join(browser.CORE, "cli.js");
  console.log("preflight: downloading Playwright's Chromium");
  if (run(process.execPath, [cliPath, "install", "chromium"], { stdio: "inherit" }).status === 0) done.push("installed Playwright's Chromium");
  else missing.push(`Playwright's Chromium: node "${cliPath}" install chromium`);
}

async function music() {
  if (!audio || !dir) return;
  const wants = video.music ?? (video.target ? audienceOf(video).music : false);
  if (wants === false) return;
  const file = typeof wants === "string" ? path.resolve(dir, wants) : DEFAULT_BED;
  if (fs.existsSync(file)) return;
  if (file !== DEFAULT_BED) return missing.push(`the music bed ${file} (or "music": false in video.json)`);
  const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(DEFAULT_BED), "tracks.json"), "utf8"));
  const track = manifest.tracks[path.basename(DEFAULT_BED)];
  try {
    const res = await fetch(track.url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(`${DEFAULT_BED}.part`, Buffer.from(await res.arrayBuffer()));
    fs.renameSync(`${DEFAULT_BED}.part`, DEFAULT_BED);
    done.push(`downloaded the music bed, "${track.title}" by ${track.artist} (Mixkit)`);
  } catch (e) {
    missing.push(`the music bed: download ${track.url} to ${DEFAULT_BED} (${e.message})`);
  }
}

function voice() {
  if (!audio || muxOnly || process.env.OPENAI_API_KEY) return;
  const has = run("security", ["find-generic-password", "-s", "explaincast", "-a", "openai"]).status === 0;
  if (!has) missing.push(`an OpenAI API key, for the voice:\n${KEY_STEPS}`);
}

function script() {
  if (!dir || muxOnly || o["speak-only"]) return;
  if (!fs.existsSync(videoFile)) return missing.push(videoFile);
  const { errors, warnings } = lintDir(dir);
  for (const e of errors) missing.push(`${path.basename(dir)}: ${e}`);
  for (const w of warnings) notes.push(`${path.basename(dir)}: ${w}`);
}

function helpers() {
  if (run("xcode-select", ["-p"]).status !== 0) return;
  for (const name of ["ocr", ...(windowTake ? ["appcap", "winat", "winplace", "ocrbox"] : [])]) {
    try {
      helper(name);
    } catch (e) {
      missing.push(e.message);
    }
  }
}

// Asking shows macOS's prompt and adds the app to the list in System Settings.
const PERMISSIONS = `import CoreGraphics
import ApplicationServices
let screen = CGPreflightScreenCaptureAccess()
let ax = AXIsProcessTrusted()
if !screen { _ = CGRequestScreenCaptureAccess() }
if !ax { _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary) }
let session = CGSessionCopyCurrentDictionary() as? [String: Any]
let locked = (session?["CGSSessionScreenIsLocked"] as? Bool) ?? false
print(screen, ax, locked)`;

function permissions() {
  if (!windowTake) return;
  if (!onPath("cliclick")) missing.push("cliclick, for the real pointer and typing: brew install cliclick");
  const settings = (pane) => `open "x-apple.systempreferences:com.apple.preference.security?${pane}"`;
  const [screen, ax, locked] = (run("swift", ["-e", PERMISSIONS], { timeout: 60000 }).stdout || "").trim().split(" ");
  if (locked === "true") missing.push("the screen is locked, and a locked screen records as black");
  if (screen === "false") missing.push(`Screen Recording for ${host}: ${settings("Privacy_ScreenCapture")}, then restart ${host}`);
  if (ax === "false") missing.push(`Accessibility for ${host}: ${settings("Privacy_Accessibility")}`);
  if (run("osascript", ["-e", 'tell application "System Events" to get name'], { timeout: 60000 }).status !== 0) {
    missing.push(`Automation for ${host} to control System Events: ${settings("Privacy_Automation")}`);
  }
}

async function main() {
  tools();
  chromium();
  await music();
  voice();
  script();
  helpers();
  permissions();
  for (const d of done) console.log(`preflight: ${d}`);
  for (const n of notes) console.log(`preflight: note: ${n}`);
  if (missing.length) {
    console.log("preflight: missing, fix these and run it again:");
    for (const m of missing) console.log(`  - ${m}`);
    process.exit(1);
  }
  console.log("preflight: ok");
}

main().catch((e) => {
  console.error(`preflight: ${e.stack || e}`);
  process.exit(1);
});
