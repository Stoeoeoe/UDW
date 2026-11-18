# Design playground

`npm run playground` opens the local preview server on http://127.0.0.1:3109. No publishing service or account is required.

Choose a study in the sidebar. Paper & ink is the browser default; Terracotta remains available for comparison. The same content and timing appear in both. Compare shows matched portrait stills at frame 168. The preview starts paused at that frame; use its timeline, playback/fullscreen controls, restart button, or Introduce/Follow/Focus/Hold checkpoints.

Border selects an original SVG meander, laurel, wave, or no ornament. The motifs are inspired by the supplied Roman border references. Repeating bands sit above and below the content, with a narrow terracotta rule around the frame. No reference photograph is embedded in the project. Selection is included in copied references and links, and preserved while switching studies or palettes.

Copy reference places the study name, palette, border, frame, and current link on the clipboard. The link selects the study, palette, and border; the copied text records the exact frame. Feedback can simply name the part you want changed.

## Studies

01 Dependency; 02 Sequence; 03 State machine; 04 Data transformation; 05 Timeline; 06 Before/after; 07 Spatial overlay; 08 Type/colour; 09 Code/callout. Examples are illustrative design content. They do not assert that the sample Delivery class, quest states, or map exist in the game.

Each scene is rendered at 1080×1920, 30 FPS, for 270 frames. `src/playground/studies.ts` owns the catalogue/timing; StudyScene composes the shared components; DiagramStudy contains custom SVG explanations. The browser controls never appear in rendered output. All visible motion uses Remotion frames.

The Studio Playground folder registers every study/palette combination. For example:

```sh
npx remotion still src/index.ts Study-dependency-terracotta out/dependency.png --frame=168
npx remotion render src/index.ts Study-sequence-terracotta out/sequence.mp4
```

## Portrait review

Review at the phone-sized preview, not just enlarged screenshots. The house content rectangle reserves 160 px at the top, 168 px at the right, 340 px at the bottom, and 72 px at the left. Safe areas shows those margins, a control rail, and a caption reservation. This overlay is a design aid; actual app interfaces and caption placements vary and require final platform review. It is not included in the video.

Use vertical flows, short labels, stacked comparisons, and code excerpts that fit the narrow frame. SplitScreen automatically stacks its two regions for portrait compositions. Do not shrink a landscape scene to fit 9:16.
