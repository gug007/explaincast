// Keyframed values as ffmpeg expressions over a frame counter, used by the
// landscape zoom (compose.js).
// Keys are { f, d } (start frame, length in frames), sorted by f.

const ease = (p) => (1 - Math.cos(Math.PI * p)) / 2;

// Where each keyframe's transition starts: wherever the previous one had got
// to at that frame, so a move that interrupts another never jumps.
function starts(keys, initial, pick) {
  const out = [];
  keys.forEach((k, i) => {
    if (i === 0) return out.push(initial);
    const prev = keys[i - 1];
    const from = out[i - 1];
    const to = pick(prev);
    out.push(k.f >= prev.f + prev.d ? to : from + (to - from) * ease((k.f - prev.f) / prev.d));
  });
  return out;
}

// Held between keyframes, eased (cosine) over each keyframe's transition.
function track(keys, initial, pick, n = "in") {
  const from0 = starts(keys, initial, pick);
  let expr = String(initial);
  keys.forEach((k, i) => {
    const from = from0[i];
    const to = pick(k);
    const p = `((${n}-${k.f})/${k.d})`;
    const eased = `(${from.toFixed(4)}+(${(to - from).toFixed(4)})*(1-cos(PI*${p}))/2)`;
    expr = `if(lt(${n},${k.f}),${expr},if(lt(${n},${k.f + k.d}),${eased},${to.toFixed(4)}))`;
  });
  return expr;
}

// Timeline keys in ms → frame keys, sorted.
const toFrames = (keys, fps) =>
  keys
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
    .map((k) => ({ ...k, f: Math.round((k.startMs / 1000) * fps), d: Math.max(1, Math.round((k.ms / 1000) * fps)) }));

module.exports = { track, toFrames };
