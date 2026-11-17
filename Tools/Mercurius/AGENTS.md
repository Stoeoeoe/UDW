# Mercurius contributor guidance

Read README.md and docs/visual-language.md, docs/motion.md, and docs/teaching.md before authoring a scene. This is a standalone video production project; it does not run the Unity game.

- Reuse shared components and tokens before adding episode-specific styling. Preserve custom TSX scenes; no scene DSL or editor is required.
- Keep briefs, narration drafts, timeline cues, scenes, and snippets within the episode folder. Preserve stable IDs and matching public/episodes/<id> media paths.
- Derive visible motion exclusively from Remotion frames. Never animate rendered content with CSS transitions, timers, random values, or wall-clock time.
- Bundle licensed assets locally, record provenance in public/ASSETS.md, and use staticFile. Fonts and syntax highlighting must block rendering until ready; failures must fail the render.
- Flag unsupported technical claims. Sample code is not evidence about the game. Human review owns explanations, narration, and publishing decisions.
- Validate before rendering. Run typecheck, lint, format:check, test, and validate after changes. Inspect relevant rendered frames and a clip when changing visual behavior.
- Keep all Remotion packages on the same exact release and Mantine packages aligned. Use npm and commit package-lock.json.
- Import the composition as Episode.tsx explicitly: extensionless Episode resolves to episode.ts on Windows.
- Use apply_patch for source/text edits. Asset tools and Prettier may generate their normal outputs.
