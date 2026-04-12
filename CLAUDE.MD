# Guidelines

- The editor is separated in a number of "modules" or "screens":
  - Project
  - Maps
  - Tiles / Tileset
  - Layers
  - Entities
  - Actors / NPCs
  - Dialogue
  - Scripting / Variables
  - Terrain
- Whenever you make changes to the output/data (e.g. maps, tilesets), you need to update the corresponding json schema located in /schemas
- Strictly follow the screen architecture and DRY editor patterns laid out here: `.claude/docs/screen_building_instructions.md`
- Most editor logic is located in `useEditorStore.ts` and its slices: `app/src/store/slices`. Do not read all slices at once but only work with the relevant ones.
