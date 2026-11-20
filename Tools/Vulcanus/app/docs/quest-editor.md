# Quest editor

Choose **Quests** in the explorer's editor picker and use **+** to create a quest.
The quest ID is namespaced with the project's prefix and stays fixed. Edit its title,
description, optional giver and Lua actions, then add steps in gameplay order.
Each step needs journal text and at least one objective. Move up/down changes that
order without renaming IDs.

Objectives support talk, deliver, have, reach and condition. Talk/deliver can select
an existing dialogue, create one here, or open it in its own tab, just like routines.
Leaving that selection empty uses the character's usual dialogue. Reach selects a
map and optionally one of its triggers. Conditions are read-only Lua expressions;
actions are synchronous Lua statements. Quest and step IDs complete in `Quests.*`
calls in both Lua and condition editors throughout Vulcanus.

The quest is checked when it is saved (autosave included) and when **Validate** is
pressed; the validation panel shows the result of the last check. Graph, format and
Lua errors keep the draft dirty and prevent saving an invalid import file. Unknown
characters, items, dialogues, maps, map-specific triggers and deities are warnings:
they never block saving, and Unity fails the import if the content is really missing.
Undo/redo, discard, autosave, Save and Save All use the normal workspace controls.

Saving writes `quests/<name>.quest.json` and its sibling `<name>.i18n.json` using
the repository's quest schemas. Message keys follow Unity's quest contract:
`quest.<quest>.title`, `.description`, `.<step>.journal`, and
`.<step>.<objective>.text`. Keep step/objective IDs stable after publishing content:
saves and translation keys refer to them. Editing text preserves its key; renaming
an ID changes its key. Existing source filenames are preserved, including names
changed outside Vulcanus. Deleting a quest also removes its generated sidecar.

Unity's format and runtime contract are documented in `Assets/Core/Quests/README.md`.
