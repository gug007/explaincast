const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { helper } = require("../skills/explaincast/scripts/lib/helpers");

// A PNG of `text` in a system Chinese font, drawn with AppKit.
function picture(text, file) {
  const draw = `import AppKit
let text = CommandLine.arguments[1] as NSString
let size = NSSize(width: 900, height: 120)
let image = NSImage(size: size)
image.lockFocus()
NSColor.white.setFill(); NSRect(origin: .zero, size: size).fill()
text.draw(at: NSPoint(x: 20, y: 40), withAttributes: [.font: NSFont(name: "STHeitiSC-Medium", size: 40)!, .foregroundColor: NSColor.black])
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))`;
  execFileSync("swift", ["-e", draw, text, file], { timeout: 120000 });
}

const mac = process.platform === "darwin" && spawnSync("xcode-select", ["-p"]).status === 0;

test("text recognition reads Chinese once its languages say so", { skip: !mac }, () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ocr-test-")), "zh.png");
  picture("订单管理 Settings 王小明的账户", file);
  const read = (env) => execFileSync(helper("ocr"), [file], { encoding: "utf8", env: { ...process.env, ...env } });
  assert.match(read({ EXPLAINCAST_OCR_LANGS: "zh-Hans,en-US" }), /订单管理 ?Settings ?王小明的账户/);
  const box = execFileSync(helper("ocrbox"), [file, "王小明"], { encoding: "utf8", env: { ...process.env, EXPLAINCAST_OCR_LANGS: "zh-Hans,en-US" } });
  const [x, , w] = box.trim().split(" ").map(Number);
  assert.ok(x > 0.3 && w > 0.05 && w < 0.4, box);
  assert.doesNotMatch(read({ EXPLAINCAST_OCR_LANGS: "" }), /王小明/, "English-only recognition misses Chinese (as before)");
});
