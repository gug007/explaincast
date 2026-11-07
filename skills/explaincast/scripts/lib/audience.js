// Who a video is for sets what it carries. video.json may still override
// `music`; a `cover` always draws a thumbnail.
const AUDIENCES = {
  public: { cards: true, music: true, thumbnail: true, chapters: true, privacy: "FAIL", pace: {} },
  client: { cards: true, music: false, thumbnail: false, chapters: true, privacy: "FAIL", pace: {} },
  me: { cards: false, music: false, thumbnail: false, chapters: false, privacy: "WARN", pace: { gapMs: 250, leadMs: 300, tailMs: 900 } },
};

function audienceOf(video) {
  const name = video.for || "public";
  if (!AUDIENCES[name]) throw new Error(`video.json "for" is ${Object.keys(AUDIENCES).join(", ")} (got "${name}")`);
  return { name, ...AUDIENCES[name] };
}

module.exports = { AUDIENCES, audienceOf };
