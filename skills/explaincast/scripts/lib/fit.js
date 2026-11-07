// Whether the narration as it stands still fits a recorded take: a re-cut lays
// each clip at the start the take recorded for its line, so a line spoken
// again (a different length) is fine while it ends before the next one starts.
const ROOM_MS = 50;
const SAME_MS = 20;

function fitLines(timeline, lines) {
  const errors = [];
  const notes = [];
  const byId = new Map(lines.map((l) => [l.id, l]));
  const recorded = new Set(timeline.lines.map((t) => t.id));
  for (const t of timeline.lines) {
    if (!byId.has(t.id)) errors.push(`line "${t.id}" is in the take but no longer in video.json; put it back or record a new take`);
  }
  for (const l of lines) {
    if (!recorded.has(l.id)) errors.push(`line "${l.id}" is not in the take; record a new take to add it`);
  }
  timeline.lines.forEach((t, i) => {
    const line = byId.get(t.id);
    if (!line || line.silent || line.ms == null) return;
    if (Math.abs(line.ms - t.ms) <= SAME_MS) return;
    const next = timeline.lines[i + 1];
    const room = (next ? next.startMs : timeline.totalMs) - t.startMs;
    const s = (ms) => `${(ms / 1000).toFixed(2)} s`;
    if (line.ms > room - ROOM_MS) {
      errors.push(`line "${t.id}" is now ${s(line.ms)} but the take left ${s(room)} before the next line; record a new take or shorten it`);
    } else {
      notes.push(`line "${t.id}" changed (${s(t.ms)} -> ${s(line.ms)}) and fits its ${s(room)} slot`);
    }
  });
  return { errors, notes };
}

module.exports = { fitLines };
