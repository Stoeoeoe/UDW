# Linear cutscene steps

The initial sequence contract is an ordered list of action steps. Unity compiles
the list to Lua; the Lua session executes it. There is no second command runner.
This describes the sequence body only. The full source file, import route and
terminal completion outcomes are not implemented yet.

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

This compiler validates shape and action signatures. Reference existence is
checked separately against the map and dialogue bindings before playback.
The IDs above illustrate the format; they are not a playable fixture.
