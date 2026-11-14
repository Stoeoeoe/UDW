# Guidelines

- If you want to compile/build, always first cd into the `app` directory. This is where all the code is. In the root fodler, we have the following important folders: /docs, /schemas and /app. In general, try to avoid that and instead use tools/LSP plugins if you have any.
- The program you are working on is to build 2D top-down retro-style games.
- Do not use inline styling if you can avoid it. Use components in /components/common, e.g. for typography, toolbars, headers, labels etc.
- Whenever possible work with theme.ts to see what colors we have at our disposal.
- The editor is separated in a number of "modules" or "screens":
  - Project
  - Maps
  - Tiles / Tileset
  - Layers
  - Entities
  - Characters / NPCs
  - Dialogue
  - Scripting / Variables
  - Terrain
- Whenever you make changes to the output/data (e.g. maps, tilesets), you need to update the corresponding json schema located in /schemas
- Strictly follow the screen architecture and DRY editor patterns laid out here: `.claude/docs/screen_building_instructions.md`
- Most editor logic is located in `useEditorStore.ts` and its slices: `app/src/store/slices`. Do not read all slices at once but only work with the relevant ones.
- Do not ask whether to run the editor or not, the user will always do that for you. If you must run it, you must always do it from /app
