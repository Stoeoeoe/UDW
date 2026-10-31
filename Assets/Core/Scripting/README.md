# Lua scripting and bindings

The project runs Lua through MoonSharp. C# modules expose a small explicit API;
scripts do not receive arbitrary C# objects or Unity components. Execution uses
MoonSharp's hard sandbox (no file/OS/dynamic code-loading modules) and an
instruction budget, so scripts cannot run indefinitely.

## Which kind of script?

| Use | Available API | Execution |
| --- | --- | --- |
| Dialogue conditions and graph expressions | Read-only `[LuaCall]` methods | `VulcanusLuaEngine.EvaluateCondition` / `EvaluateValue` |
| Dialogue actions and Run Lua nodes | All `[LuaCall]` methods, including writes | `VulcanusLuaEngine.Execute` |
| Cutscene/session steps | `[LuaAction]` methods allowed in the context and phase | `LuaExecutionSession`, advanced each frame |

Conditions are expressions, without `return`. A blank condition means true.
Compiled expressions are cached but read live game state on each evaluation.
Writable chunks get a fresh Lua environment each time; Lua globals are not saved.
Use dot calls, without a Lua `self` argument:

```lua
-- Condition
Time.GetCurrent().hour >= 18 and GameState.Story.Has('met_vendor')

-- Writable chunk
GameState.Story.Set('met_vendor', true)
GameState.Story.Set('visit', { count = 1, place = 'market' })
```

`GameState.Story` persists through the live save root. Story values support
booleans, strings, finite numbers and plain acyclic tables with string keys;
use `GameState.Story.Remove(key)` to delete a value. Returned tables are detached
snapshots: editing one does not update saved state. Cutscene-local data instead
uses declared, typed `Cutscene.Variables`, shared across phases/tracks for one run
and never saved. Conditions can read these variables but cannot write them.

## Exposing a C# API

Put modules in this folder, in the runtime scripting assembly. For example,
the existing story module exposes this reader and writer:

```csharp
[LuaModule("GameState.Story")]
public sealed class StoryLuaApi
{
    [LuaCall]
    public bool Has(string key) => GameState.Story.Has(key);

    [LuaCall(writesState: true)]
    public void Set(string key, StoryValue value) => GameState.Story.SetValue(key, value);
}
```

The module path creates nested Lua tables; the public instance method name is
the Lua function name. Mark every mutation `writesState: true` so it is absent
from conditions. Modules in this assembly are discovered automatically and need
a parameterless constructor unless they are scene-bound. Scene-bound modules
(actors, dialogue, audio, weather and camera) use factories in
`CutsceneBindings.ActionModules`; binding constructs only modules used by steps.
Inspecting signatures/exporting metadata must not require live scene services.

`LuaBindingRegistry` validates signatures and converts supported values. Use
existing APIs as examples for primitive values, `StoryValue`, `MapPosition` and
`MapPath`. Returned snapshot classes use `[LuaTable]` and `[LuaField]` fields.
The module/call/action attributes preserve reflection-discovered code in builds;
separate validator methods must carry `[Preserve]`. Resolve live saved state on
each call, since loading replaces the root; do not cache a saved state section.

## Timed actions and visual steps

`[LuaAction]` adds a permanent unique authoring ID, display metadata, contexts
(`cutscene`, `npcRoutine`) and explicit phases (`setup`, `sequence`, `completion`).
The ID (for example `story.set`) identifies a visual step independently of its
C# method name. Declaring `npcRoutine` eligibility does not create a scheduler.
An ordinary `[LuaCall]` is not automatically callable in a session. Immediate
methods can carry both attributes, as the actual story writer does.

Timed methods return `ILuaAction` and use `[LuaAction]` alone. The session pauses
Lua, ticks the operation, resumes after success, and disposes it on success,
cancellation or failure. Timed actions are sequence-only; setup and completion
must finish their mutations immediately. See `CutsceneLuaApi.Wait` and
`MoveToAction` for examples. Run Lua nodes execute synchronous chunks through
the ordinary engine: use separate visual steps for waits, movement and dialogue.

Reference/resource parameters use `[LuaReference]` / `[LuaResource]` and require
a named validator with the same parameter types, returning void and marked
`[Preserve]`. Static validators check authored inputs at import; instance
validators resolve live dependencies at binding. Literal steps are checked before
playback; computed inputs are checked immediately before their action executes.
Missing required IDs, services or scene references must fail at these boundaries.
Add accurate `[LuaPreview]` / `[LuaPreviewEffect]` metadata for visual actions;
preview is schematic and does not execute gameplay or arbitrary Lua.

## Export and check changes

Unity exports signatures, action metadata and resource choices to
[`Generated/Scripting/bindings.json`](../../../Generated/Scripting/bindings.json)
after script reload and relevant asset changes. Vulcanus consumes that manifest
for authoring. To refresh explicitly, use **Tools > Scripting > Regenerate Lua
bindings.json**. Do not edit the generated file or add a separate manual registry.

When extending an API, test its actual caller, read-only/write boundary, invalid
authored inputs and any action cancellation/cleanup. Existing Edit Mode fixtures
are in [Editor](Editor); dialogue coverage also lives under
`Assets/Core/Dialogue/Vulcanus/Editor`. Use the Unity CLI workflow in
[cli_operations.md](../../../Docs/cli_operations.md).
For source formats, variables/outputs, parallel ownership, phase and skip
semantics, see [CutsceneSequenceContract.md](../../../Docs/CutsceneSequenceContract.md).
