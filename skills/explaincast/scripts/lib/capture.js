// Screen capture of one rectangle (physical pixels), delivered as JPEG frames
// with their arrival time so the Recorder can lay them on a constant-rate
// timeline. Only the given app's windows are captured (appcap.swift,
// ScreenCaptureKit), so another app's window, a notification or a system dialog
// over it never reaches the video.
const { spawn } = require("child_process");
const { helper } = require("./helpers");

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

// The JPEG half of the capture: frames in, JPEG frames out on stdout.
const JPEG_OUT = ["-fps_mode", "passthrough", "-c:v", "mjpeg", "-q:v", "2", "-f", "image2pipe", "pipe:1"];

class Capture {
  constructor({ rect, fps = 30, onFrame, pid, scale = 2, cursor = false }) {
    this.rect = rect;
    this.onFrame = onFrame;
    this.latest = null;
    this.frames = 0;
    this.err = "";
    const pt = (v) => (v / scale).toFixed(2);
    this.source = spawn(helper("appcap"), [pid, pt(rect.x), pt(rect.y), pt(rect.w), pt(rect.h), rect.w, rect.h, fps, cursor ? 1 : 0].map(String), { stdio: ["ignore", "pipe", "pipe"] });
    this.source.stderr.on("data", (d) => (this.err += d));
    // The pixels arrive as sRGB; the take is read as full-range BT.709.
    this.ffmpeg = spawn(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-nostats",
        "-f", "rawvideo", "-pixel_format", "bgra", "-video_size", `${rect.w}x${rect.h}`, "-framerate", String(fps),
        "-i", "pipe:0",
        "-vf", "scale=out_color_matrix=bt709:out_range=pc,format=yuvj444p", ...JPEG_OUT,
      ],
      { stdio: [this.source.stdout, "pipe", "pipe"] },
    );
    this.source.on("close", (code) => {
      if (code && this.ffmpeg.exitCode == null) this.ffmpeg.kill("SIGINT");
    });
    this.ffmpeg.stderr.on("data", (d) => (this.err += d));
    let buf = Buffer.alloc(0);
    this.ffmpeg.stdout.on("data", (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      let start;
      while ((start = buf.indexOf(SOI)) >= 0) {
        const end = buf.indexOf(EOI, start + 2);
        if (end < 0) break;
        const frame = buf.subarray(start, end + 2);
        buf = buf.subarray(end + 2);
        this.latest = frame;
        this.frames++;
        this.onFrame({ data: frame, timestamp: Date.now() });
      }
    });
    this.exited = new Promise((r) => this.ffmpeg.on("close", r));
  }

  // Why the capture can no longer be used, once it can't.
  get failed() {
    const ended = this.ffmpeg.exitCode ?? this.ffmpeg.signalCode;
    return ended != null ? `the screen capture stopped (ffmpeg ${ended}): ${this.err.slice(-300)}` : null;
  }

  async stop() {
    if (this.source && this.source.exitCode == null) this.source.kill("SIGTERM");
    if (this.ffmpeg.exitCode == null) this.ffmpeg.kill("SIGINT");
    await Promise.race([this.exited, new Promise((r) => setTimeout(r, 3000))]);
    if (this.ffmpeg.exitCode == null) this.ffmpeg.kill("SIGKILL");
    if (!this.frames) throw new Error(`screen capture produced no frames: ${this.err.slice(-600)}`);
  }
}

module.exports = { Capture };
