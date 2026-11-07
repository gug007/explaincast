// The path of a small native helper (the `<name>.swift` beside this file), compiling it into the user's cache the
// first time and again whenever its source changes.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const CACHE = path.join(os.homedir(), "Library", "Caches", "explaincast");

function helper(name) {
  const src = path.join(__dirname, `${name}.swift`);
  const bin = path.join(CACHE, `explaincast-${name}`);
  if (fs.existsSync(bin) && fs.statSync(bin).mtimeMs >= fs.statSync(src).mtimeMs) return bin;
  fs.mkdirSync(CACHE, { recursive: true });
  const r = spawnSync("swiftc", ["-O", src, "-o", bin], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`could not build ${name} (swiftc): ${(r.stderr || "").slice(-400)}`);
  return bin;
}

module.exports = { helper };
