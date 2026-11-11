const ZOOM = 2;
const OUT = { width: 2560, height: 1440 };

// The window floats on the cards' canvas (look.js) with rounded corners and a
// soft shadow. `radius` is at least a macOS window's own corner: a smaller mask
// lets the capture's black outside that corner through.
const FRAME = { width: 1100, height: 620, radius: 20 };

const frameFor = (video) => ({ ...FRAME, width: video.target?.width || FRAME.width, height: video.target?.height || FRAME.height });

module.exports = { ZOOM, OUT, FRAME, frameFor };
