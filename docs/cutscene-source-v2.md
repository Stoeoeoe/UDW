# Cutscene source v2: typed phases

Vulcanus authors typed setup, sequence and completion phases in
`schemas/cutscene.schema.json`. The Unity handoff is
`UrdewValley/Docs/CutsceneSequenceContract.md`. Manifest schema version 2,
source format version 2, and preview versions 1/2 are independent contracts.

## Source shape

```json
{
  "$schema": "../schemas/cutscene.schema.json",
  "formatVersion": 2,
  "id": "base:introduction",
  "mapId": "base:village",
  "allowSkip": true,
  "onStart": [],
  "sequence": [
    {
      "id": "pause",
      "action": "cutscene.wait",
      "arguments": { "seconds": 0.5 }
    }
  ],
  "onComplete": {
    "characterPlacements": [{ "character": "host-01", "anchor": "meeting" }],
    "steps": [
      {
        "id": "face-player",
        "action": "characters.face",
        "arguments": { "character": "host-01", "target": "player" }
      }
    ]
  }
}
```

Root fields are exactly those shown. `onStart` is optional; omission and an empty
array mean no setup. Other root fields are required. `sequence` must contain at
least one step. `onComplete` requires both `characterPlacements` and `steps`, each of
which may be empty. It contains no `actions` Lua string. Unknown fields are errors.

Every step has exactly `id`, `action` and `arguments`. IDs are stable, nonblank,
and unique across all three arrays. Reordering or moving a step between phases
preserves its ID, arguments and editor label; duplication creates a new ID.
Arguments are nonblank strings, finite JSON numbers, or strict position objects, checked against the
manifest signature without coercion. Resource/reference IDs remain strings.

## Eligibility

All actions require `contexts` containing `cutscene` and explicit permission in
`phases`. `onStart` requires `setup`; `sequence` requires `sequence`;
`onComplete.steps` requires `completion`. Setup and completion additionally
require `execution: "immediate"`. A zero-duration awaitable is still ineligible.
Do not infer permission from action names, return types or parameter shapes.

Use the same parameter, map reference, resource catalog and signature validation
in every phase. Validate IDs, eligibility and **all** world references before
acquiring control or executing the first setup step. Report phase and step ID.
No phase accepts raw Lua steps. Ordinary synchronous calls become eligible only
when exported as explicitly phase-permitted actions.

## Runtime order and skipping

1. Prepare references and character ownership across all phases and placements.
   Capture original staging before applying setup.
2. Acquire control and run `onStart` once in authored order. Every setup action
   must finish its mutation before returning. Then begin sequence playback.
3. On normal completion **or skip**, stop transient sequence actions, restore
   unlisted staged characters to their captured original placements, and apply
   `onComplete.characterPlacements` in authored order. Nonzero anchor facing applies;
   zero facing preserves the character's original direction.
4. Run `onComplete.steps` once in authored order using the existing action
   bindings. These steps see the restored/placed character state. They may explicitly
   override that state; placements must not run again after completion steps.
5. After successful completion steps, add the cutscene ID to the existing saved
   completed-cutscene set, then publish terminal notifications.

Skip does not rerun setup, execute remaining sequence actions or choose dialogue
answers. It uses the same placement plan and completion steps as watching.
Cancellation/failure before completion restores staging without executing the
completion plan or recording completion. Completion actions retain the existing
nontransactional failure policy: prior mutations are not rolled back if a later
completion step throws, the completed marker is not added, cleanup releases
ownership, and the error identifies the phase/step. Do not retry completion
steps automatically or introduce a second action interpreter/save system.

## Schematic preview

Scene settings show original authored state. Before start previews setup in
order; sequence previews use setup's resulting state. On completion starts from
the original staging plus the explicit placement plan, not the last sequence
snapshot, then folds completion effects in order. This gives watching and skip
the same final-state preview. Selecting a completion step stops at that step.

All effects come from `action.preview`. Unknown spatial state propagates;
there is no execution of Lua/C#, world-state guessing or invented player origin.
Immediate setup/completion placement is not rendered as a walked movement.
Unimplemented preview effects do not grant new runtime capabilities.

## Existing files and Unity handoff

Vulcanus can losslessly load v1 files whose completion Lua is empty/whitespace:
it retains IDs, setup, sequence and placements, creates empty completion steps,
and saves v2 on the next successful save. Parsing alone does not write files.
Nonempty v1 Lua is **not** silently dropped or translated: loading reports that
manual conversion is needed and preserves the original source on disk. The v2
schema does not accept mixed legacy `actions` and typed `steps`.

## Positions and spawned roles

A position argument is exactly one of `{ "x": 168, "y": 104 }` or
`{ "anchor": "meeting" }`. Coordinates are nonnegative integer map pixels,
from the top left, inside the selected map. Anchors must resolve on that map;
anchor and coordinate fields cannot be mixed. Grid snaps feet to tile centers,
Pixel selects individual pixels, and Anchor selects a map anchor. Editing mode
is never serialized. Parameters advertise `type: "position"`,
`picker: "mapPosition"`, `coordinateSpace: "mapPixels"`, `origin: "topLeft"`,
`placementModes: ["tile", "pixel", "anchor"]`, `tileAnchor: "center"`, and
`characterPivot: "feet"`.

`semanticType: "characterDeclaration"` on a string parameter declares an instance
role in setup. Names must be nonblank and unique across the player, placed NPCs,
and preceding declarations. A role is usable only after its declaration step;
all setup roles are available in sequence and completion. Renaming or reordering
recomputes scope without rewriting unresolved references. The character-definition
parameter uses `resourceType: "character"`; the editor resolves this catalog from the project's character definitions. Unity
resolves prefab availability during import/playback; its `resources.character` list
does not restrict authoring.

```json
{
  "id": "spawn-guest",
  "action": "characters.spawn",
  "arguments": {
    "character": "guest",
    "definition": "base:cutscene-prototype-host",
    "position": { "anchor": "meeting" }
  }
}
```

Preview v2 `spawnCharacter` maps `characterParameter`, `definitionParameter` and
`positionParameter` explicitly and requires `facing: "unknown"`. It creates a
marker for the declared instance using the character definition's editor icon with
its bottom at the placement point. Bindings do not supply runtime prefab artwork.
Subsequent effects use that role. `setCharacterPosition` maps `characterParameter` and
`positionParameter`, with `facing: "preserve"`; it accepts the same position shapes
and creates no walked movement segment. Neither effect is accepted under preview v1.

Completion/skip keeps spawned characters; cancellation/failure removes them in Unity.
The editor needs no lifetime setting. Completion preview starts existing characters
at their pre-run staging and spawned characters at their creation points, applies
explicit completion placements, then folds completion steps. Sequence changes
are not used as completion endpoints.
