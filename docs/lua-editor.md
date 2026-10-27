# Lua editor language support

Configure the exported schema-version-2 `bindings.json` in **Scripting → Lua Manifest**.
Both script editors and condition fields subscribe to the same watched manifest.
Changing the file updates suggestions; invalid or removed manifests remove their
suggestions immediately. Manually configured project symbols remain available.

Script fields use Monaco; compact conditions use CodeMirror with the Lua grammar.
Both provide exported module and method completion, parameter snippets, hover
documentation and signature help without requiring LuaLS. Use Ctrl+Space to open
completion explicitly. Exported module paths and method casing are preserved;
cutscene action IDs are not Lua function names. Suggestions follow the execution
scope, using the exported signatures and action metadata:

- Conditions expose ordinary read-only calls, excluding state changes and actions.
- Dialogue scripts and cutscene **Run Lua** blocks expose ordinary scripting calls,
  including writes. The shipped `CutsceneLuaApi.RunLua` calls `VulcanusLuaEngine.Execute`;
  it does not expose `Characters.*`, `Cutscene.Wait`, or other action-only APIs.
- Action-session scopes expose only actions permitted by both `contexts` and `phases`.
  Cutscene typed-step palettes already apply these restrictions.

Known direct API calls that are unavailable in the current scope produce Monaco
warnings or a condition-field error. Checks ignore strings, comments and locally
shadowed module names. They are conservative authoring checks, not full Lua type
analysis; calls through aliases and dynamic table lookups are not diagnosed.

In argument positions, `resourceType` metadata supplies resource ID suggestions.
Project character definitions supply the `character` resource list. Cutscene Lua
fields also supply live character references: the player, map NPC instances and
roles declared before the selected step. These are distinct from character
definitions used for spawning. The cutscene also supplies map anchors and project
dialogues for `anchorRef` and `dialogueRef` parameters. Suggestions are offered only
for available methods with matching parameter metadata. For example, an action
scope can offer `player` with the description **Player - current player actor**;
selecting it in a bare argument inserts `"player"`. Within existing quotes it
inserts only the escaped ID. These actor action calls remain separate typed steps
in the shipped cutscene editor; they cannot run inside a Run Lua block.

Existing syntax validation remains in the consuming screens. LuaLS integration
remains optional for local-variable inference and additional diagnostics; this
change does not generate LuaLS binding libraries or install its executable.
Script models have separate document identities, and providers and diagnostics
subscriptions are isolated between editor instances.

Focused verification, from `app`:

```powershell
npx.cmd tsc -p tsconfig.build.json --noEmit
npx.cmd vitest run --config vitest.unit.config.ts src/lib/luaBindings.test.ts src/lib/lspClient.test.ts src/components/screens/scripting/LuaScriptEditor.test.tsx src/components/screens/scripting/ConditionEditor.test.tsx src/store/useScriptingManifestStore.test.ts src/components/screens/cutscene/CutsceneEditor.test.tsx
```
