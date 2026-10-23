# Linear cutscene steps

The initial sequence contract is an ordered list of action steps. Unity compiles
the list to Lua; the Lua session executes it. There is no second command runner.
Sources ending in `.runtime.cutscene.json` import into `CutsceneDefinition`
assets and are discovered by the shared `CutsceneCatalog`. The prototype file
wrapper is:

```json
{
  "$schema": "../schemas/cutscene.schema.json",
  "formatVersion": 1,
  "id": "base:intro",
  "mapId": "map-1",
  "sequence": [
    { "id": "talk", "action": "dialogue.play", "arguments": { "dialogue": "base:greeting" } }
  ]
}
```

The schema reference is relative to the source file and must resolve inside
Assets. This example path assumes a `cutscenes` folder beside the project's
`schemas` folder. Format version 1 accepts only the fields above. IDs are
permanent `namespace:name` values; map IDs retain their existing source form.
Playback lifecycle, terminal completion outcomes and trigger bindings are not
implemented yet; importing a definition does not start it.

```json
[
  {
    "id": "approach",
    "action": "actors.moveTo",
    "arguments": { "actor": "npc-placement-id", "destination": "meeting-anchor-id" }
  },
  {
    "id": "greet",
    "action": "actors.face",
    "arguments": { "actor": "npc-placement-id", "target": "player" }
  },
  {
    "id": "talk",
    "action": "dialogue.play",
    "arguments": { "dialogue": "greeting-dialogue-id" }
  }
]
```

Step IDs are permanent, non-empty and unique within the sequence, compared
exactly. Reordering or renaming a step's display label must retain its ID.
Action IDs and argument names come from `Generated/Scripting/bindings.json`.
Only actions allowing the `cutscene` context are accepted. The initial three
actions take non-empty string references. Missing/unknown arguments, unknown
step fields and unsupported actions are errors. Branches and raw Lua steps are
not supported.

Argument property order does not affect generated Lua: calls follow the
manifest's parameter order. Strings are encoded as Lua literals, including
quotes, backslashes and control characters. JSON string escaping is not used as
Lua escaping.

Each step produces exactly one Lua line. `CompiledSequence.StepIds[line - 1]`
maps that one-based Lua line to its authored step ID. Compiler errors identify
the source, sequence index and step ID when available.
Imported definitions retain `Steps` with the authored IDs, action IDs and named
arguments alongside the generated Lua. Runtime diagnostics can use
`definition.Steps[line - 1].Id`; reference validation can inspect the arguments
without parsing executable Lua.

This compiler validates shape and action signatures. Reference existence is
checked separately against the map and dialogue bindings before playback.
The IDs above illustrate the format; they are not a playable fixture.

Schema and action-manifest changes invalidate imported cutscene scripts.
Catalog discovery preserves enabled selections and uses exact cutscene IDs.
Before Play Mode or a build, the current sources are validated again so a
failed edit cannot run through an older retained Unity import artifact.
