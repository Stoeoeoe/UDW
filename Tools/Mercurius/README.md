# Mercurius

A small, local production workspace for Roemer technical devlogs. Based on the official `create-video@4.0.544 --blank` scaffold, with custom React/TypeScript scenes. Mercurius is the working folder name; the visual language is provisional.

The included **demo** is a silent 24-second component study at **1920×1080, 30 FPS**. It presents illustrative C# code, a dependency diagram, and the cost of explicit setup. It does not describe implemented Roemer code. **Showcase** exposes the same reusable components, emphasis changes, diagram reveals, and Mantine/Tailwind styling checks.

## Install

Use Node **24.x** and npm **11.x** (implemented with Node 24.14.0 / npm 11.9.0). From `Tools/Mercurius`:

```sh
git lfs install
git lfs pull
npm ci
npm run studio
```

On Windows PowerShell with script execution disabled, use `npm.cmd` for all commands. Studio prints its localhost URL; choose demo or Showcase. The first render downloads Remotion's Chrome Headless Shell if it is not already installed, so initial machine setup requires network access. Once dependencies and Chromium are present, demo rendering uses local assets and bundled highlighting grammars/fonts, without live network services.

Git LFS rules apply to footage and narration under public/. Install Git LFS before adding media; use `git lfs ls-files` to inspect tracked files. Fonts and the small SVG are ordinary committed assets. Existing media added before these rules needs explicit review before any LFS migration. Renders, bundler output, npm cache, and intermediate files are ignored.

## Commands

```sh
npm run studio                       # Remotion Studio, no separate app
npm run compositions                 # List registered compositions
npm run typecheck
npm run lint
npm run format
npm run format:check
npm test                             # Workflow and validation boundaries
npm run validate                     # All episode metadata, timing, assets
npm run still -- demo 330             # out/demo-330.png
npm run render -- demo                # out/demo.mp4 (H.264 / yuv420p)
```

The still/render wrappers validate **all episodes** before invoking the Remotion CLI. Studio and direct CLI use are useful for authoring but bypass that validation. To preview the showcase directly:

```sh
npx remotion still src/index.ts Showcase out/showcase.png --frame=420
```

## Add an episode

```sh
npm run new-episode -- inventory-contract
```

The script accepts lowercase kebab-case IDs starting with a letter, creates episodes/<id> and public/episodes/<id>, and refuses to overwrite either destination. It creates a brief, narration draft, metadata, named timeline, composition, custom opening scene, and snippets folder. It does not generate technical claims or narration audio.

1. Review the brief and script using docs/teaching.md.
2. Edit episode.ts, timeline.ts, scenes/, and snippets/. Keep boundaries/cues named. The starter is six seconds; change the duration to suit the reviewed explanation.
3. Put media under public/episodes/<id>/ and list every used media file in episode.assets. Shared media lives under public/shared/. Add attribution to public/ASSETS.md. MediaFrame resolves these paths with staticFile.
4. Import the new Episode **with the `.tsx` extension** and metadata in src/Root.tsx. Register another Composition using the demo's pattern, keeping id, dimensions, fps, and duration sourced from its metadata. Explicit registration keeps the composition reviewable and permits arbitrary React scene implementations.
5. Run format, typecheck, lint, test, and validate; produce a still and render with the episode ID.

Validation checks metadata types, ID uniqueness/directory agreement, even video dimensions, scene/cue bounds, required episode files, fonts, and readable local asset references. Overlapping scenes are allowed for transitions. It does not verify factual claims, narration length, visual clipping, or whether every TSX media reference was listed; review those manually. Timeline offsets are composition-absolute; convert a cue to sequence-local time by subtracting its scene's from value.

## Structure and review

- src/shared/: theme, motion, components, diagrams, layouts, and showcase.
- episodes/<id>/: brief, narration, metadata, timeline, custom scenes, snippets.
- public/shared/ and public/episodes/<id>/: browser-accessible assets.
- scripts/: scaffold, validation, and validated CLI production wrappers.
- docs/: visual language, animation rules, and teaching/review guidance.
- out/: local generated previews and MP4s, intentionally untracked.

For a visual change, inspect frames before/after each cue, transition midpoints, title and final scene. Read code at delivery size; check clipping and margins. Scrub forward past an emphasis, then backwards before it: it must disappear. Render the same frame again and compare the pixels. Review the whole clip for reading time; the visual study intentionally has no audio. See docs/verification.md for the latest recorded checks.

Package integration follows [Remotion Tailwind v4](https://www.remotion.dev/docs/tailwind-v4/overview), [local font loading](https://www.remotion.dev/docs/fonts-api/load-font), and [Mantine CSS layers](https://mantine.dev/styles/mantine-styles/). Check [Remotion licensing](https://www.remotion.dev/license) for the production team before publishing commercial work. No automatic narration, timeline editor, cloud rendering, or publishing service is included.
