# Visual language, v0

The demo should read as a technical notebook: dark slate surfaces, warm light text, a green dependency signal, and sparse amber accents. The colours are provisional. Edit src/shared/theme/tokens.ts to change semantic canvas, surface, raised, ink, muted, accent, signal, and border values centrally. SVG components consume those tokens; CSS variables expose the same values to Tailwind, and mantine-theme.ts derives its theme from them. The local demonstration SVG is a static illustration, with its own recorded palette; regenerate it deliberately if the illustration needs restyling.

Use Inter regular/bold for explanations and JetBrains Mono regular for code and labels. Both are bundled WOFF2 fonts, loaded through @remotion/fonts before a frame is ready. At 1080p, the baseline is 112 px titles, 60 px headings, 30 px prose, 26 px code, and 22 px labels. Keep code examples short enough to read without scaling the whole composition down. Aim for one idea per scene. Use line emphasis to direct attention; dim other lines only after the viewer has seen the complete snippet.

Safe margins are 96 px. Spacing steps are 8, 16, 24, 40, and 64 px. Use SplitScreen for comparisons, labelled Node objects with explicit anchors for diagrams, and MediaFrame for screenshots or footage. Callout carries one short consequence, not a paragraph. Node labels remain readable at their native SVG size.

## Mantine + Tailwind

Presentation provides a shared MantineProvider with forceColorScheme="dark". There are no system preference or persisted theme decisions in a render. Mantine provides Paper, Badge, Button and suitable future presentation primitives; it does not replace Remotion Studio.

styles.css declares layer order before imports:

```css
@layer theme, base, mantine, components, utilities;
```

Tailwind's theme and reset enter their first two layers, Mantine's styles.layer.css enters mantine, our panel/eyebrow rules enter components, and Tailwind utilities enter utilities. Import only the layered Mantine stylesheet. This allows utilities to override normal Mantine classes, while Mantine restores component styling after the reset. A component's inline style still wins over normal utilities: avoid conflicting inline visual values when a utility override is intended.

Showcase's bottom Badge and Button deliberately override Mantine backgrounds, colours, and borders using utilities. Inspect these together with Callout's Paper after CSS changes. Do not introduce CSS motion, hover-dependent state, or animated Mantine transitions in rendered scenes.
