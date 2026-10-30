# Lua API browser

Scripting displays the game API exported by Unity in `bindings.json`. It does not
define functions or state. Use **Manifest connection** to select the file; changes
are watched automatically. The API tab supports text search and filters for calls,
actions and table types. Selecting an entry shows inputs, optional defaults,
ordered outputs, table fields and action execution restrictions.

**Read-only** means a call can inspect game state without changing it. An action
may change state or take time; actions that wait must finish before execution
continues. Conditions expose only the read-only API. A Lua block has its own
allowed API, and the editor reports calls that are unavailable in that context.

Unity remains the source of API definitions: `[LuaModule]`, `[LuaCall]` and
`[LuaAction]` describe callable methods. `[LuaTable]` and `[LuaField]` describe
returned table snapshots, exported under `tables` in the manifest. Both Lua
editors use the manifest for game API suggestions; the language server supplies
Lua language intelligence. Condition fields check syntax without pretending to
evaluate live game bindings using editor-defined mocks.

Story-value declarations remain in Data, and cutscene variables remain in each
cutscene. The obsolete global variable, function, namespace, table and context
declarations are no longer project authoring fields. Dialogue types still label
dialogue content, but no longer select an editor-defined scripting context.
