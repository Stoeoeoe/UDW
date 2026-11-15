# Editor language

The explorer opens resources; tabs switch documents; one header identifies the
active document. Editor bodies supply the task's content rather than repeating
document identity. Save, Save All, Undo and Redo live in the application toolbar.

## Component contracts

- `WorkspaceDocumentViews` owns `EditorDocumentFrame`. Every document kind must
  choose its layout and icon in the exhaustive `documentPresentation` registry.
  Adding a kind without its presentation fails TypeScript.
- The frame owns headers and the form layout. Forms return fields; `DetailPanel`
  supplies the shared reading width, spacing and neutral surface. It accepts no
  styling overrides. Canvas and sequence editors supply their specialized bodies.
- `EditorHeaderActions` places Settings and validation in the shared header. It
  requires the workspace frame, including in standalone tests and previews.
- `EditorWorkspaceShell` owns resizable body panels and has no header API.
- `SequenceCard` owns geometry, focus, selection and hover treatment. It accepts
  content, selection, semantic accents, comments and preview muting, not arbitrary
  Chakra styling props. Dialogues, quests and routine goals share it.
- `SequenceToolbar` owns ordered-content toolbar geometry. Map/tileset tools sit
  immediately below the document header, separate from application commands.
- `InspectorShell` owns property panel spacing, empty states and deletion. Quest
  cards summarize steps/objectives; selecting one edits its properties here.
- Conditions use `ConditionEditor`; action blocks use `LuaScriptEditor`.
- `EditorFormSave` connects character/item drafts to Save, Save All, dirty state
  and the existing autosave scheduler. Other editors retain their save commands.
  Unsupported document histories are disabled; a form cannot undo the last map.

## Enforcement

`npm run lint:editors` tests and runs `scripts/check-editor-language.mjs`. The check
also runs before normal lint and build. It rejects local history controls, private
card/form chrome overrides (including aliases and prop spreads), decorative
gradients in editor entry components, screen-owned frames, and exporting/moving
the private workspace body outside its frame. TypeScript enforces the exhaustive
registry and the shared components' narrow prop types.

Domain visualization remains specialized: maps, routine timing and graph connections
can communicate spatial or timing information through their own rendering.

To add an editor, register its document kind/presentation, implement the body using
the appropriate shared components, and exercise it through the workspace frame.
Extend a shared component when an actual authoring task needs a new behavior;
do not recreate its chrome in an editor.
