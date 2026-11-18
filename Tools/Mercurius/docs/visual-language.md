# Visual language

The current direction uses limestone paper and dark ink with terracotta, teal supporting information, and restrained gold values. Paper & ink is the playground default; Terracotta remains as a dark comparison. Purple has been removed following visual review. Both palettes use identical geometry and typography.

RomanOrnament supplies original repeating meander, laurel, and wave bands inspired by the user's reference board. Decoration frames the top/bottom and stays outside the content rectangle. Do not replace this with generic circles or diagonal stripes, and do not fill the diagram's working area with a decorative pattern.

Gideon Roman regular carries headings and body text. Cinzel is reserved for occasional uppercase chapter labels and the Roemer wordmark. Noto Sans Mono carries code, IDs, and production controls. All three are bundled locally as WOFF2 with their OFL notices. Do not synthesize bold Gideon Roman; contrast comes from scale, colour, and composition.

Main video: 1080×1920 at 30 FPS. The video-safe class applies the house margins from theme/format.ts: top 160, right 168, bottom 340, left 72. These reserve space for caption and interface review, not guaranteed app safe areas. Diagrams flow vertically; comparisons stack. Check phone-size legibility and the optional overlay in the playground.

Regular text is 44 px, code 36 px, labels 32 px. Study titles use 120 px Gideon Roman. Active nodes become solid terracotta; supporting results use teal. Borders and arrows must remain visible at phone size. Code highlighting derives from the selected palette, including terracotta keywords, teal names, and gold constants. Avoid dense snippets and generic explanatory slogans.

Palettes live in theme/tokens.ts and directions.ts. Presentation scopes CSS variables and Mantine variables to each scene so side-by-side palettes stay independent. Shared SVG components use the same variables; Shiki uses the same colour values. Existing static SVG media retains its own recorded artwork palette.

## CSS integration

Layer order is theme, base, mantine, components, utilities. Tailwind reset precedes Mantine's layered styles; utilities can intentionally override component classes. Import only styles.layer.css from Mantine. Presentation supplies an explicit colour scheme and scoped theme. Mantine supplies appropriate primitives, while Tailwind handles layouts and utility styles. Rendered motion comes from Remotion frames, never CSS animations or transitions.
