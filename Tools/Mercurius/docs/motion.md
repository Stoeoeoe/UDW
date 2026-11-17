# Motion

All visible state is a pure consequence of the current Remotion frame and authored props. Use useCurrentFrame, useVideoConfig, spring, and interpolate. The shared entrance uses a damped spring and 24 px translation; line/path reveals use clamped interpolation. Presets live in theme/motion.ts: a 24-frame entrance, 6-frame line stagger, and 18-frame scene transition at the demo's 30 FPS.

Episode timelines store named composition-absolute scene starts/durations and cues. Inside a Sequence or TransitionSeries.Sequence, useCurrentFrame is sequence-local. Subtract that scene's start when applying an absolute cue. The demo's title/explanation and explanation/proof overlap by the same transition preset used in its TransitionSeries. Keep metadata duration equal to the end of the final scene when editing.

Reveal a diagram connection between explicit anchors; reveal the arrowhead only when the path is complete. Preserve time to read after the reveal. Do not use timers, Date.now, Math.random, CSS keyframes/transitions, or effect-triggered animation counters. React effects here are only for asynchronous syntax preparation. CodePanel blocks rendering with useDelayRender, cancels on highlighting errors, and computes emphasis/reveal entirely from frames. Local font loading also gates rendering and fails clearly on errors.

When checking determinism, seek beyond a cue, seek backwards before it, and return to the same selected frame. State must match a direct render of that frame. Pixel-compare repeated stills on the same renderer/environment; encoding the MP4 twice is not a useful byte-level image comparison. Font rendering may differ across Chromium versions, so keep the lockfile and environment when comparing.
