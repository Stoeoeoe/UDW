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
  "allowSkip": false,
  "onComplete": { "actions": "GameState.Story.SetFlag('introduced')", "actorPlacements": [] },
  "sequence": [
    { "id": "talk", "action": "dialogue.play", "arguments": { "dialogue": "base:greeting" } }
  ]
}
```

The schema reference is relative to the source file and must resolve inside
Assets. This example path assumes a `cutscenes` folder beside the project's
`schemas` folder. Format version 1 accepts only the fields above. IDs are
permanent `namespace:name` values; map IDs retain their existing source form.
Importing a definition does not start it. The Systems prefab provides one
`CutsceneRunner` and the shared Vulcanus dialogue runner/presenter.

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
Only actions allowing the `cutscene` context are accepted. Movement and dialogue
actions take non-empty string references.
`cutscene.wait` takes a numeric `seconds` argument, for example
`{ "id": "pause", "action": "cutscene.wait", "arguments": { "seconds": 0.5 } }`.
It compiles to `Cutscene.Wait(0.5)` and waits for scaled gameplay seconds through
the session's frame clock. A zero duration yields until the next session tick.
Negative and nonfinite durations fail import and direct Lua calls. Its preview
is `described` with no effects, preserving actor placement and facing.
Missing/unknown arguments, unknown
step fields and unsupported actions are errors. Branches and raw Lua steps are
not supported.

Argument property order does not affect generated Lua: calls follow the
manifest's parameter order. Strings are encoded as Lua literals, including
quotes, backslashes and control characters. JSON string escaping is not used as
Lua escaping.
Numbers use invariant Lua numeric literals. Imported numeric arguments retain
their invariant text representation; binding converts them to the declared
numeric parameter type.

Each step produces exactly one Lua line. `definition.Steps[line - 1].Id`
maps that one-based Lua line to its authored step ID. Compiler errors identify
the source, sequence index and step ID when available.
Imported definitions retain `Steps` with the authored IDs, action IDs and named
arguments alongside the generated Lua. Runtime diagnostics can use
`definition.Steps[line - 1].Id`; reference validation can inspect the arguments
without parsing executable Lua.

The compiler creates these steps in the same pass that validates the JSON and
emits Lua. The importer retains that exact output instead of parsing the JSON
again. Argument shape, types and signatures belong to compilation; definition
validation checks the required asset fields without repeating step validation.

This compiler validates shape and action signatures. Reference existence is
checked separately against the map and dialogue bindings before playback.
The IDs above illustrate the format; they are not a playable fixture.

Schema and action-manifest changes invalidate imported cutscene scripts.
Catalog discovery preserves enabled selections and uses exact cutscene IDs.
Before Play Mode or a build, the current sources are validated again so a
failed edit cannot run through an older retained Unity import artifact.

`CutsceneBindings.BindCurrentMap(definition, dialogueRunner)`
checks the definition's map against the ready loaded map, then validates every
step through the existing actor/anchor/dialogue APIs. It returns the Lua binding
registry after all references resolve. It does not execute actions, open
dialogue or claim player controls. Errors include the cutscene ID and authored
step ID. Only API modules used by the sequence are bound.

Each action links its pre-playback check with
`[LuaAction(..., Validator = nameof(ValidateMoveTo))]`. The check takes the same
parameters as the action, returns `void`, and is marked `[Preserve]` for Unity
builds. It checks references without starting gameplay. Actions with
`[LuaReference]` arguments must provide a check; the registry verifies this and
the method signature during registration and manifest export.
Pure value checks can be static: the compiler runs them during import without
constructing an API. Instance checks resolve scene references during binding.
Binding checks every validator before starting the sequence.

`[LuaAction]` alone exposes and preserves a session action; it does not also need
`[LuaCall]`. `[LuaCall]` is for synchronous APIs. Both attributes preserve their
methods for stripped player builds, and session actions remain excluded from
synchronous execution and condition evaluation.

The binder discovers actions and their checks through these attributes. Adding
an action to an existing API module needs no binder change. A new API module
still needs its construction function wired into `CutsceneBindings`.

`CutsceneBindings.BindSequence` orders the already-validated named arguments for
reflection, creates the modules used by the sequence, and checks live references.
The runner and binder do not repeat authored-definition validation during gameplay;
import and the existing before-play/build validation establish that contract.
`LuaBindingRegistry` supplies the validated
API methods and attaches calls to Lua; it does not interpret cutscene steps.

## Declarative action previews (STO-72)

`Generated/Scripting/bindings.json` remains manifest schema version 2. An action
may additionally export `action.preview`, independently versioned as `version: 1`.
This describes schematic state after **successful step completion**. It never
executes C#/Lua, navigation, dialogue, reference validators or API constructors to
obtain a preview. Playback signatures and behavior are unchanged. The Vulcanus
reducer and rendering consumer are follow-up work in STO-69, not implemented here.

The current declarations are shown in
[`Examples/LuaActionPreview.v1.json`](Examples/LuaActionPreview.v1.json). Its `actions`
objects are checked against the actual type-only manifest by `LuaActionPreviewTests`;
the `example` is illustrative consumer input and expected snapshots, not a second
runtime implementation or exported cutscene source format.

```csharp
[LuaPreview(LuaPreviewSpatialState.Described)]
[LuaPreviewEffect(0, LuaPreviewEffectKind.MoveActorToAnchor,
    ActorParameter = "actor", AnchorParameter = "destination", Facing = "unknown")]
```

Use these companion attributes on an existing `[LuaAction]` method. The first
argument to each effect is its explicit nonnegative order, unique on the method;
gaps are allowed. Export sorts by that order, independent of reflection enumeration
or attribute source order. The wire array carries the order without exporting the
numeric keys. An action can declare multiple ordered effects. New action IDs or
different C# method/parameter names need no consumer action-ID switch: map the
declared parameter names explicitly and use an existing effect kind.

Preview fields:

| Field | Version 1 contract |
| --- | --- |
| `version` | Exactly `1`; independent of manifest schema and save versions. |
| `spatialState` | `described` or `unknown`. |
| `effects` | Ordered array, explicitly allowed to be empty. |

`described` means effects fully account for spatial changes; unmodified actor
positions/facing may carry forward. `unknown` means reference cues are useful but
spatial assumptions after the step are invalid. There is no runtime guarantee that
dialogue action nodes preserve position or facing, so `Dialogue.Play` declares
`unknown`. Show its reference cue, then invalidate spatial certainty.

An absent preview is **unavailable**, not unchanged. Unsupported preview versions
or effect kinds likewise cannot be treated as a no-op by a consumer. By contrast,
`[LuaPreview(LuaPreviewSpatialState.Described)]` without effects exports an explicit
`effects: []`, a known spatial no-op. This optionality applies to tooling metadata,
not to required runtime dependencies.

Version 1 effect fields (all parameter fields name **method arguments**, not IDs):

| `kind` | Required fields | Meaning |
| --- | --- | --- |
| `moveActorToAnchor` | `actorParameter`, `anchorParameter`, `facing: "unknown"` | Set schematic actor position to the referenced anchor; record previous known position and new position. |
| `faceActorTowardActor` | `actorParameter`, `targetActorParameter` | Change facing toward the target's accumulated position; neither actor moves. |
| `showDialogue` | `dialogueParameter` | Show a dialogue reference cue; do not execute flow or choose an answer. |

Each kind forbids the other kinds' fields. Only movement has a `facing` field, and
`unknown` is its only supported value in version 1. Current `MoveTo` passes only
anchor position to `CharacterNavigation`: it does not apply anchor facing or
declare the final facing produced while navigating. Facing effects leave direction
unknown when either position is unknown or their difference is zero.

The shared `LuaBindingRegistry` registration/type-inspection boundary rejects
unsupported versions, spatial states, effect kinds, negative/duplicate order,
missing/forbidden fields, absent argument names and incompatible mappings, with
the declaring method in the error. Mapped parameters must be strings annotated
with exactly `actorRef/mapActor`, `anchorRef/mapAnchor` or `dialogueRef/dialogue`
for their respective role. Existing action contexts and reference validators remain
authoritative; preview metadata does not expose additional Lua methods.

### Cumulative consumer handoff

Start with authored placed-actor world positions and fold declarations only through
the selected step. Recompute from that starting state when selecting an earlier
beat; never retain changes from later beats. Reserved `player` has no invented
authored starting position. Resolve actor/anchor/dialogue IDs from the step's named
arguments, not from module names, labels or action IDs.

The example host starts at `(1, 2)` and its meeting anchor at `(4, 2)`:

1. After `approach` (`actors.moveTo`), the host is at `(4, 2)` with unknown facing.
   Show movement arrow 1 from `(1, 2)` to `(4, 2)`, an old-position ghost and a
   distinct resulting-position marker. The anchor's facing is not applied.
2. After `greet` (`actors.face` toward `player`), the host remains at `(4, 2)`.
   Player position is unknown, so no facing direction can be fabricated. Keep the
   previous movement segment as history; a known facing direction would use a
   visually distinct direction arrow, not another displacement arrow.
3. After `talk` (`dialogue.play`), show the `greeting` reference cue. Position and
   facing are now unknown because dialogue may mutate the world. Historical arrows
   describe earlier movements, not a guaranteed current actor position.

Highlight the selected step and subdue earlier movements. Displacement arrows are
straight schematic indicators, not routes: no collision, reachability, speed,
duration, pathfinding, animation or intermediate time is simulated. Missing world
references must remain explicit diagnostics. A later move can re-establish a known
endpoint after uncertainty; if its origin is unknown, show the endpoint without a
fabricated origin, movement arrow or ghost. Do not infer knowledge of other actors.

The completion end-state view remains separate and follows
`onComplete.actorPlacements`, never the last movement beat. Completion Lua is opaque
to this preview. Existing manifest serialization includes preview metadata in its
dependency hash and write-if-changed comparison, so metadata edits update the same
watched file and unchanged exports leave its timestamp untouched.

## Running a cutscene

The runner loads the shared `Resources/CutsceneCatalog` through `CatalogResources`
at initialization; no Inspector catalog assignment is needed.

`CutsceneRunner.TryStart(id, out run)` resolves an enabled catalog entry. Unknown
IDs are setup errors. Busy, not-ready, already-completed, occupied-player and
open-menu starts return false; they do not replace or queue a run. The returned
`CutsceneRun` is the handle for one attempt, with its definition, `IsRunning` and `Skipped` flags. Its
`Cancel`/`Dispose` only affect that run; `Skip` returns false when skipping is
disabled or the run is already terminal. The runner inspector shows the active
run and authored step ID. Errors propagate as exceptions with cutscene and
step identity after releasing control and restoring staging.

While staging, normal gameplay, world interactions and global menu shortcuts
are blocked. UI input stays enabled for dialogue and skip. The in-game calendar
pauses without changing Unity time scale or freezing Rigidbody2D movement.
Escape/controller UI Cancel skips the entire run only when `allowSkip` is true;
it never dismisses a standalone dialogue. Pause menus are unavailable during v1
staging. Camera, animation and audio commands remain outside the initial action
set.

All actor/anchor/dialogue references resolve before claims are acquired. Referenced
dialogues, including dialogue jumps, must have no import diagnostics. Dialogue
choices use ordinary action nodes to set story flags or perform other supported
Lua actions immediately. These changes survive a later cutscene interruption.
Dialogue actions do not need access to a cutscene-specific Lua environment.

## Completion and persistence

`allowSkip` and `onComplete` are required authored fields. `onComplete` contains
`actions`, a synchronous Lua block using the same state APIs as dialogue actions,
and `actorPlacements`. Empty actions and placement lists are valid. Lua syntax is
checked during import. There is no cutscene outcome string or `SetOutcome` action.

Normal playback and skipping both apply the prepared placements and run
`onComplete.actions` once, then add the cutscene ID to the saved
`GameState.Story.CompletedCutscenes` set. That ID prevents replay. Cancellation
and exceptions do not execute `onComplete` or mark the cutscene completed.
Completion actions are ordinary immediate mutations, not a rollback transaction.
If they throw, the exception propagates and the cutscene is not marked completed.
Scenes requiring a player decision use `allowSkip: false`; skipping does not
execute the remaining dialogue choices or invent answers.

`onComplete.actorPlacements` is an ordered list of
`{ "actor": "placed-instance-id", "anchor": "anchor-id" }` endpoints, with
each actor listed at most once. Empty lists are valid.

The runner captures the initial positions and facing of referenced actors before
execution. Normal completion and skip both stop transient actions and apply the
same prepared endpoints. Unlisted actors return to their pre-run placement. An
anchor's nonzero facing overrides the actor's direction; zero retains its pre-run
direction. Spawned actor endpoints update the existing live spawn state. The
completion marker is saved before terminal notifications.
Cancellation, location leave, death, disabled presentation and exceptions
stop pending movement/dialogue and restore surviving actors.
Cleanup releases only the run's own control and calendar claims.

`GameStateManager.Save` rejects direct saves while staging. Save after `Finished`,
when placements, completion actions and ownership are settled. There is no autosave caller in
the current project and no new deferral queue. No transient Lua state or second
cutscene save root is serialized; no save migration/version change is required.

## Map triggers and the playable fixture

A Vulcanus map `spatialPrimitives.triggers` entry with `type: "cutscene"` and a
required `cutsceneId` imports a `CutsceneTrigger` using its existing rectangle or
polygon geometry. It cannot also be a location link. Source dependencies import
the referenced cutscene before its map; disabled/missing/wrong-map targets fail
validation before play/build. Runtime activation uses `LevelManager.LocationReady`
after reveal and checks for an already-overlapping player. Only physical player
colliders count; NPCs and interaction sensors do not. Multiple player colliders
produce one attempt per visit. Busy attempts do not retry until a new visit.

The authored prototype is
`Assets/Vulcan/0204project/cutscenes/prototype.runtime.cutscene.json`:
`base:cutscene-prototype` on `base:map-1`, with the persistent NPC
`cutscene-prototype-host-01`, anchor `prototype-meeting`, and
`prototype_greeting` dialogue. Its map trigger occupies source pixels
`[160,160]` to `[176,192]`, west of the arrival area. Watching through Goodbye or
skipping places the host at the meeting anchor and adds
`base:cutscene-prototype` to the completed set. This is an explicitly named prototype, not story
canon. A second cutscene using supported assets needs a new source, not manager
registration or new C#.
