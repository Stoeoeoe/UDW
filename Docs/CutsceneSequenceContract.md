# Linear cutscene steps

## Holding a finished animation

`Characters.PlayAnimation(character, animation, holdLastFrame = false)` optionally
keeps the final frame after its awaited playback finishes. The sequence continues
while the animator owns the held pose. Idle/facing updates and completion placement
do not release it. Another animation, walking/running, a tool action, location leave,
or animator disable releases it. Cancelling unfinished playback does not hold it;
cutscene rollback clears a held pose introduced by that run.
The existing `EndInteractionAnimation()` API also releases the pose explicitly.
This is presentation only; it does not change character health or death state.

The manifest parameter is `type: "boolean", optional: true, defaultValue: false`.
Source stores `holdLastFrame: true` or `false`; omission retains previous behavior.
The compiler emits the default for older steps, and Lua binding accepts an omitted
optional boolean. Strings/numbers/null are rejected as boolean arguments. The
existing awaitable execution and unknown spatial preview metadata are unchanged.

## Entrance and exit presentation

Source v2 optionally includes `transition` alongside `allowSkip`:
`{ "enabled": true }`. Omission enables the transition. Vulcanus exposes only
the per-scene toggle. Global timing lives in the Unity asset
`Assets/Resources/CutscenePresentation.asset`: Fade Seconds `0.3`, Hold Seconds
`1.7`, Reveal Seconds `0.12`. These Inspector settings apply to both intro and
outro for every cutscene; they are not exposed to Lua. Times must be finite and
nonnegative. Disabling presentation preserves immediate cleanup.

The shared ScreenFader fades to black and reveals the scene by retracting two
black rectangles toward the top and bottom. Animation uses unscaled time. Control
is acquired before the entrance. The entrance fades to black and holds; setup runs
and Started is raised under that cover, then the sequence begins alongside the
reveal. On normal completion or skip, script progression stops, the exit
fades to black and holds, transient actions stop and completion placements/actions apply once under black, and the
final state is revealed before control and Finished notifications are released.
Cancellation/failure clears presentation and retains the existing rollback policy.
Completion that already committed under black is retained if presentation is then
interrupted. Very short scenes finish the entrance before beginning the exit.

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
  "onStart": [],
  "onComplete": { "actions": "GameState.Story.SetFlag('introduced')", "characterPlacements": [], "steps": [] },
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
    "action": "characters.moveTo",
    "arguments": { "character": "npc-placement-id", "destination": "meeting-anchor-id" }
  },
  {
    "id": "greet",
    "action": "characters.face",
    "arguments": { "character": "npc-placement-id", "target": "player" }
  },
  {
    "id": "talk",
    "action": "dialogue.play",
    "arguments": { "dialogue": "greeting-dialogue-id" }
  }
]
```

Step IDs are permanent, non-empty and unique across setup, sequence and completion, compared
exactly. Reordering or renaming a step's display label must retain its ID.
Action IDs and argument names come from `Generated/Scripting/bindings.json`.
Only actions allowing the `cutscene` context are accepted. Movement and dialogue
actions take non-empty string references.
`characters.faceDirection` takes `character` and `direction` string arguments, for example
`Characters.FaceDirection("player", "North")`. Direction IDs are exactly `North`,
`East`, `South` and `West`, mapped to world vectors `(0, 1)`, `(1, 0)`, `(0, -1)`
and `(-1, 0)`. The action turns immediately without moving the character. It supports
all three authoring phases and both execution contexts. The direction parameter
declares `resourceType: "direction"`; `resources.direction` in `bindings.json`
supplies the choices. Invalid directions fail binding before sequence playback.
`cutscene.wait` takes a numeric `seconds` argument, for example
`{ "id": "pause", "action": "cutscene.wait", "arguments": { "seconds": 0.5 } }`.
It compiles to `Cutscene.Wait(0.5)` and waits for scaled gameplay seconds through
the session's frame clock. A zero duration yields until the next session tick.
Negative and nonfinite durations fail import and direct Lua calls. Its preview
is `described` with no effects, preserving character placement and facing.

`characters.playAnimation` takes `character` and `animation` string references, for example
`{ "id": "wave", "action": "characters.playAnimation", "arguments": { "character": "player", "animation": "base:wave" } }`.
It compiles to `Characters.PlayAnimation("player", "base:wave")` and waits for the
native animation state to finish, then releases playback. CutsceneRunner owns
character control for the whole sequence; this action adds no second control claim.
Cancellation releases playback. Interruption fails the sequence;
it does not report successful animation completion. Sets and looping clips are
not accepted. Directional animations must have finite, non-looping clips for all
four facings in the selected character's library; binding checks this before any step
runs. This also covers a preceding Face action changing the character's direction.
The spatial preview is `unknown`: arbitrary clips can animate artwork transforms,
and the schematic preview does not interpret Unity animation curves.

Animation IDs come from the shared `CharacterAnimationCatalog`, discovered across
Assets and selected through Tools > Catalogs. Existing `CharacterAnimation`
assets supply either a fixed clip or a character-specific Memao action. No new
playback library is required. Animation sets remain available to existing
occupation code but are excluded from this one-shot action's picker.

The animation parameter is marked `[LuaResource("animation")]` and exports
`resourceType: "animation"` in `Generated/Scripting/bindings.json`. That same file
contains `resources: { "animation": [{ "id": "base:wave", "description": "Wave" }] }`.
The external editor can populate a generic resource selector from
`resources[parameter.resourceType]`; Lua still receives the selected string ID.
Scene-specific character and anchor pickers retain their existing reference metadata.
Choices are sorted by exact ID and include only enabled single animations with a
finite fixed clip or complete one-shot clips in at least one authored Memao
library. Character compatibility is still checked at binding. The choices file is
regenerated with the bindings after script reload and animation/catalog asset
changes, or with Tools > Scripting > Regenerate Lua bindings.json. New resource
types can use the same parameter attribute and add their choices in the manifest
exporter; exporting a parameter whose resource type has no list is an error.
No emotion resources are currently implemented.
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

Each sequence step produces exactly one Lua line. `definition.Steps[line - 1].Id`
maps that one-based Lua line to its authored step ID. Compiler errors identify
the source, sequence index and step ID when available.
Imported definitions retain `Steps` with the authored IDs, action IDs and named
arguments alongside the generated Lua. Runtime diagnostics can use
`definition.Steps[line - 1].Id`; reference validation can inspect the arguments
without parsing executable Lua.
Setup and completion keep their own compiled Lua and step lists in
`definition.OnStartLua`/`OnStart` and `definition.OnComplete.Lua`/`Steps`.
Their errors identify the phase and authored step ID independently of sequence lines.

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
step through the existing character/anchor/dialogue APIs. It returns the Lua binding
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
an action to an existing API module needs no binder change. `[LuaModule]` classes
in the game's assembly are discovered once. Parameterless APIs need no registration
entry; the attribute also preserves their types and default constructors in player
builds. Modules needing scene dependencies have explicit factories in
`CutsceneBindings.ActionModules`. A discovered module without either constructor
or factory fails when its bindings are initialized; construction uses .NET's
`Activator.CreateInstance` rather than a separate constructor-validation pass.
Runtime construction and manifest export use the same discovered modules and
scene factories. Export reads types without constructing APIs. Playback creates
only the modules used by its sequence; editor test APIs are in a separate assembly
and are not discovered as shipped modules.
State APIs read `GameState` directly on each call; they do not receive or cache
state objects. Tag queries likewise resolve the current main character. Loading
a save therefore changes what subsequent Lua calls read without rebinding.

`CutsceneBindings.BindSequence` orders the already-validated named arguments for
reflection, creates the modules used by the sequence, and checks live references.
The runner and binder do not repeat authored-definition validation during gameplay;
import and the existing before-play/build validation establish that contract.
`LuaBindingRegistry` supplies the validated
API methods and attaches calls to Lua; it does not interpret cutscene steps.

## Position arguments and immediate placement

`Characters.Place("player", { x = 168, y = 104 })` immediately places an existing
character's feet at a map point and preserves facing. Its action ID is `characters.place`,
with `cutscene` context and `setup`, `sequence`, `completion` phases. It stops
movement, updates the Rigidbody2D and tile context, and updates a spawned
character's existing placement record. The cutscene's captured staging still restores
the original placement on cancellation; completion placements/steps define the
final result on completion or skip.

The C# parameter is `[LuaPosition] MapPosition position`. The shared binding
registry exports the reusable parameter contract, independent of the action ID:

```json
{
  "name": "position",
  "type": "position",
  "picker": "mapPosition",
  "coordinateSpace": "mapPixels",
  "origin": "topLeft",
  "placementModes": ["tile", "pixel", "anchor"],
  "tileAnchor": "center",
  "characterPivot": "feet"
}
```

The source argument is either an object with exactly numeric `x` and `y` fields,
or `{ "anchor": "meeting" }`. Anchor IDs resolve against the current map before
playback; mixing anchor and pixel fields is invalid. An anchor chooses its world
point without applying its facing.
Coordinates must be finite and nonnegative; binding rejects points beyond the
map's pixel rectangle rather than clamping them. Rectangle edges are valid points.
Fractional coordinates are preserved, including centers of odd-sized tiles.
The compiler emits a Lua table and retains a typed serialized position alongside
the step. Direct Lua input accepts the same plain x/y table and rejects malformed
tables. Arbitrary Unity objects and userdata are not exposed.

Both editing modes save the same coordinates. With 16-pixel tiles, zero-based
column 10 / row 6 saves `{ "x": 168, "y": 104 }`; pixel selection can save
`{ "x": 171, "y": 106 }`. Editing mode is not a source argument. Unity converts
the point to map-local `(x / tileSize, mapHeight - y / tileSize, 0)`, then applies
the map transform. The authored CharacterGraphics sprite pivot is the feet
origin; placement compensates for its offset from the character/rigidbody root.

Vulcanus should render a generic picker for this parameter metadata: tile/pixel/anchor
mode, X/Y fields or an anchor selector, and Pick on map. Map picking shows a ghost of the selected character
with its feet on the chosen point. Tile mode snaps to tile centers; pixel mode
selects individual map pixels. Click confirms, Escape cancels, and drag/scroll
continue navigating the map. Cancelling a pick must preserve the previous value.
For Place, identify the ghost character through the preview effect whose
`positionParameter` names this input, then read its `characterParameter`; do not
hardcode an API or parameter name in the picker.
These controls belong to the external editor and are not implemented in Unity.

The placement preview is version 2, with `kind: "setCharacterPosition"`,
`characterParameter: "character"`, `positionParameter: "position"` and
`facing: "preserve"`. It requires a position argument carrying the metadata
above. Move the character marker immediately, preserve known/unknown facing as-is,
and add no movement segment. Subsequent steps use the new position, including
target-facing calculations. Convert map pixels into the preview's common
coordinate space before combining them with existing character/anchor positions.
Version 2 also accepts existing version 1 effect kinds; version 1 cannot declare
`setCharacterPosition` or `spawnCharacter`. Unknown preview versions/effects must be shown as unavailable,
not silently ignored. The v2 fixture is
[`Examples/LuaActionPreview.v2.json`](Examples/LuaActionPreview.v2.json).

## Walk an inline path

`Characters.WalkPath("guest", { { x = 168, y = 104 }, { anchor = "meeting" }, { x = 208, y = 120 } })`
walks through each point in order. It is awaitable and sequence-only; all points
resolve before movement starts. Cancellation/skip disposes the active movement
segment, and the existing completion plan determines the final staging.

The `path` parameter exports `type: "path"`, `picker: "mapPath"`, and the same
map-pixel, top-left, Grid/Pixel/Anchor, feet-pivot hints as position parameters.
Cutscene arguments store the nonempty ordered array directly. The importer
preserves its order in typed arguments and generated Lua.

Preview v2 declares `spatialState: "described"` with a
`moveCharacterAlongPath` effect mapping `characterParameter`, `pathParameter`,
and `facing: "unknown"`. Vulcanus draws numbered waypoints and known movement
legs, uses the last point for subsequent previews, and never invents a starting
position or connects across an unresolved waypoint. It does not simulate
navigation, collisions or duration. The regular bindings exporter publishes the
action and its metadata to the watched manifest.

## Spawn character and editor handoff

`Characters.Spawn("guest", "base:cutscene-prototype-host", { anchor = "meeting" })`
creates a persistent NPC at the selected point. `characters.spawn` is an immediate
**setup-only** action: creation runs before the sequence, including when the player
skips it. Successful completion/skip keeps the character and its saved spawn record;
cancellation or playback failure removes both. The character is controlled by the
cutscene until it finishes. Existing completion placements and steps can refer to it.

The `character` string declares a new cutscene-local role, exported with
`semanticType: "characterDeclaration"`. It must be nonempty and cannot shadow the
player, a placed instance ID, or an earlier declaration. Later setup steps and
all sequence/completion steps may use that role wherever `characterRef` is accepted.
References before the declaration fail binding. This role is transient; the
spawner assigns a separate persistent instance ID that survives save/load.

The `definition` string has `resourceType: "character"`. Vulcanus supplies this selector
from its own project character definitions; Unity does not export a character list
in `bindings.json` or filter those definitions by prefab availability. Unity imports
`characters/*.character.json` independently of prefab mappings. A character definition
supplies identity; spawning it requires a mapped runtime prefab. Author that prefab
under `Assets/Content/Spawnables` with a root
`SpawnedObject` and exactly one active NPC referencing that definition. The existing
SpawnableCatalog discovery handles registration; each character definition needs one
unambiguous prefab. The player is referenced through its existing `player` role.

Editor changes:

- Render `characterDeclaration` as a role-name input and add its value to subsequent
  character pickers in authored setup order. Recompute when declarations move or change.
- Populate the definition selector from Vulcanus project characters; do not mix definition
  IDs with existing map instance IDs.
- Reuse the position picker for all three modes. Tile/pixel save `{x,y}`;
  anchor saves `{anchor:"id"}`. Spawn and Place share this argument contract.
- Fold preview v2 `spawnCharacter` using `characterParameter`, `definitionParameter`,
  `positionParameter`, and `facing: "unknown"`. Add the declared character marker at
  the resolved point and use it for subsequent effects. Definition identifies its
  visual; the role identifies this instance. Invalid/unresolved references must
  remain visibly unresolved.

For a spawn ghost, obtain the character visual through the effect's
`definitionParameter`; for an existing character use `characterParameter`. Both align
their feet with the selected point. No API-name-specific picker logic is needed.

## Before start, completion steps and action phases

`Weather.SetWeather("LightRainSpring")` is the immediate `weather.setWeather`
action, available in setup, sequence and completion. Its `weather` argument uses
`resourceType: "weather"`; `bindings.json` exports enabled WeatherCatalog IDs
and labels in `resources.weather`. Use it in `onStart` to establish a scene's
weather. Binding rejects unknown or disabled IDs before any steps execute.
The change lasts until the next normal seasonal weather roll; it does not
advance the calendar or add a saved weather override.

Unity accepts structured `onStart` and `onComplete.steps` blocks. The binding
manifest exports `action.phases`; registration, compilation and phase-specific
Lua bindings enforce eligibility. The editor must author the shapes below and
use the phase metadata to filter its action choices.

### Authoring and interchange

The editor presents a **Before start** card above the sequence. Its wire field
is `onStart`: an optional ordered array of the same `{ id, action, arguments }`
objects used by `sequence`. Omission or an empty array explicitly means no setup.
`onComplete.steps` is an optional ordered array with the same step shape;
omission or an empty array means no structured completion actions.
`onComplete.actions` is optional Lua; omission, an empty string, or whitespace
means no Lua completion actions. `null` is invalid. An empty completion block
uses `{ "characterPlacements": [], "steps": [] }`.
Setup uses the existing action bindings and resource/reference parameter metadata;
it has no raw Lua field. There is still one Lua execution system.

For example, this fragment sets an initial and a final facing around dialogue:

```json
{
  "onStart": [
    {
      "id": "stage-player",
      "action": "characters.faceDirection",
      "arguments": { "character": "player", "direction": "East" }
    }
  ],
  "sequence": [
    {
      "id": "talk",
      "action": "dialogue.play",
      "arguments": { "dialogue": "base:greeting" }
    }
  ],
  "onComplete": {
    "characterPlacements": [],
    "actions": "",
    "steps": [
      { "id": "finish-player", "action": "characters.faceDirection", "arguments": { "character": "player", "direction": "West" } }
    ]
  }
}
```

This fragment omits the required wrapper fields. Place and the immediate facing
actions are available in these sections; lighting override actions are not yet
implemented. Retain permanent step IDs when moving steps between
sections. IDs must be unique across `onStart`, `sequence` and `onComplete.steps`;
diagnostics include the phase and step ID.

### Binding metadata and immediate execution

The action descriptor declares a non-empty, duplicate-free `phases`
array independently of `contexts` and `execution`. Phase names are `setup`,
`sequence` and `completion`. For an immediate action explicitly permitted in
setup and sequence, the relevant metadata would be:

```json
{
  "contexts": ["cutscene"],
  "execution": "immediate",
  "phases": ["setup", "sequence"]
}
```

`onStart` accepts only actions whose contexts include `cutscene`, whose phases
explicitly include `setup`, and whose execution is `immediate`. A `void` return
or `execution: "immediate"` alone does not grant setup eligibility. The updated
manifest must declare the allowed phases; the editor must not infer them from
action IDs, categories, names or return types. The current Face and FaceDirection actions allow
`setup`, `sequence` and `completion`; MoveTo, Wait, PlayAnimation and dialogue
playback allow only `sequence`. Execution contexts remain separate: Face,
FaceDirection and MoveTo allow `cutscene` and `npcRoutine`; the other actions allow `cutscene`.

The C# action author must explicitly declare phase eligibility. Registration and
manifest export reject unknown/duplicate phases and reject an `ILuaAction`
return type whenever `setup` or `completion` is allowed. Sequence actions may be
immediate or awaitable. `MoveTo`, `Wait`, `PlayAnimation` and dialogue playback
cannot be used in setup. Their underlying operation may span frames, even when
its requested duration happens to be zero.

An eligible setup implementation promises that its requested state change is
complete before the call returns. It must not start deferred mutations through
coroutines, background tasks, tweens or queued callbacks. Return-type inspection
cannot prove this promise; the implementation must satisfy it. The importer
independently rejects ineligible actions in `onStart`, so hand-edited JSON cannot
bypass the editor filter. Ordinary argument, reference and resource validation
also applies before any setup action executes.

`completion` describes eligibility for `onComplete.steps`. The existing
`onComplete.actions` Lua string and `characterPlacements` retain their formats.
Completion remains distinct from the last sequence
step: both normal completion and skip apply it; cancellation does not.

### Runtime ownership, restoration and preview

The runner validates and binds setup, sequence and completion references before
mutating the scene. Characters referenced only by setup must participate in the
same character preparation and control ownership as sequence characters. Capture original
character position/facing **before** applying setup.
Acquire the run's control claims, execute setup once in authored order, then
start the sequence. Setup must finish before the scene's first visible sequence
frame and before publishing the run's Started notification. Reuse the action
bindings and Lua execution path; do not introduce a second command interpreter.

Setup may establish temporary character placement/facing and presentation overrides.
It must not commit story outcomes or irreversible gameplay changes. If setup
fails, abort the run, restore captured staging, release ownership and report the
phase/step failure. Cancellation likewise restores the pre-setup staging. On
completion/skip, apply the existing completion placement plan; a setup placement
does not implicitly become a persistent endpoint. Skip never reruns setup or
executes the remaining sequence.

Future nighttime staging should use a temporary lighting/time-of-day presentation override
and restore it on completion, skip, cancellation or failure. This does not advance
the saved clock or emit calendar progression events. An actual game-time change
needs its own explicit gameplay contract and is not implied by setup lighting.

Selecting the Before start card previews the state after all setup actions.
Sequence previews fold setup effects into their initial state, then apply the
existing cumulative sequence reducer. Use the same declarative preview metadata;
never execute Lua to preview setup. Unknown effects remain unknown, and setup
placement must not appear as a walked movement segment. The placement action's
preview effect must be specified with that action before the editor offers it.

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
[LuaPreviewEffect(0, LuaPreviewEffectKind.MoveCharacterToAnchor,
    CharacterParameter = "character", AnchorParameter = "destination", Facing = "unknown")]
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

`described` means effects fully account for spatial changes; unmodified character
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
| `moveCharacterToAnchor` | `characterParameter`, `anchorParameter`, `facing: "unknown"` | Set schematic character position to the referenced anchor; record previous known position and new position. |
| `faceCharacterTowardCharacter` | `characterParameter`, `targetCharacterParameter` | Change facing toward the target's accumulated position; neither character moves. |
| `faceCharacterDirection` | `characterParameter`, `directionParameter` | Set facing to the chosen cardinal world direction without changing position. |
| `showDialogue` | `dialogueParameter` | Show a dialogue reference cue; do not execute flow or choose an answer. |

Each kind forbids the other kinds' fields. Only movement has a `facing` field, and
`unknown` is its only supported value in version 1. Current `MoveTo` passes only
anchor position to `CharacterNavigation`: it does not apply anchor facing or
declare the final facing produced while navigating. Target-character facing leaves
direction unknown when either position is unknown or their difference is zero.
Cardinal facing is known even when the character's position is unknown: read the
argument named by `directionParameter` and map North/East/South/West to the world
vectors above. This is an additive v1 effect; an editor that does not recognize
it must treat its facing result as unknown rather than preserve stale facing.

The shared `LuaBindingRegistry` registration/type-inspection boundary rejects
unsupported versions, spatial states, effect kinds, negative/duplicate order,
missing/forbidden fields, absent argument names and incompatible mappings, with
the declaring method in the error. Mapped parameters must be strings annotated
with exactly `characterRef/mapCharacter`, `anchorRef/mapAnchor` or `dialogueRef/dialogue`
for their respective role; `directionParameter` instead requires
`[LuaResource("direction")]`. Existing action contexts and reference validators remain
authoritative; preview metadata does not expose additional Lua methods.

### Cumulative consumer handoff

Start with authored placed-character world positions and fold declarations only through
the selected step. Recompute from that starting state when selecting an earlier
beat; never retain changes from later beats. Reserved `player` has no invented
authored starting position. Resolve character/anchor/dialogue IDs from the step's named
arguments, not from module names, labels or action IDs.

The example host starts at `(1, 2)` and its meeting anchor at `(4, 2)`:

1. After `approach` (`characters.moveTo`), the host is at `(4, 2)` with unknown facing.
   Show movement arrow 1 from `(1, 2)` to `(4, 2)`, an old-position ghost and a
   distinct resulting-position marker. The anchor's facing is not applied.
2. After `greet` (`characters.face` toward `player`), the host remains at `(4, 2)`.
   Player position is unknown, so no facing direction can be fabricated. Keep the
   previous movement segment as history; a known facing direction would use a
   visually distinct direction arrow, not another displacement arrow.
3. After `talk` (`dialogue.play`), show the `greeting` reference cue. Position and
   facing are now unknown because dialogue may mutate the world. Historical arrows
   describe earlier movements, not a guaranteed current character position.

Highlight the selected step and subdue earlier movements. Displacement arrows are
straight schematic indicators, not routes: no collision, reachability, speed,
duration, pathfinding, animation or intermediate time is simulated. Missing world
references must remain explicit diagnostics. A later move can re-establish a known
endpoint after uncertainty; if its origin is unknown, show the endpoint without a
fabricated origin, movement arrow or ghost. Do not infer knowledge of other characters.

The completion end-state view remains separate: start from the pre-run character
positions, apply `onComplete.characterPlacements`, then fold `onComplete.steps`
preview effects in order.
Facing preserved from playback is unspecified in this view because skipping can
retain a different direction; explicit endpoint/anchor facing is shown. Never use
the last movement beat as an implicit completion position. Completion
Lua remains opaque to this preview. Existing manifest serialization includes preview metadata in its
dependency hash and write-if-changed comparison, so metadata edits update the same
watched file and unchanged exports leave its timestamp untouched.

## Screen flashes

`Camera.Flash()` / `camera.flash` starts a global screen overlay and continues
the script immediately. Its optional arguments, in order, are `color` (HTML name
or `#RRGGBB` / `#RRGGBBAA`, default `#FFFFFF`), `durationSeconds` (default `1.1`),
`easeInSeconds` (`0.05`), `holdSeconds` (`1`), and `easeOutSeconds` (`0.05`).
The three phase times are scaled proportionally to the requested total duration.
For example, `Camera.Flash("#FFFFFF", 0.4, 0.05, 0.3, 0.05)` flashes for 0.4 seconds.
Omitted named arguments in authored cutscene steps use the same defaults.

Flash timing uses unscaled seconds. Both fades use quadratic InOut easing,
configurable through `CameraManager.flashEase` in the Inspector. A new flash
replaces the previous flash; zero duration clears it immediately. Individual
phase times may be zero, but at least one phase must be positive. Invalid colors,
negative times and nonfinite times fail during import/binding. The overlay does
not intercept input or alter the scene transition fader. Flashes are available
in setup, sequence and completion phases and do not change spatial preview state.

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

All character/anchor/dialogue references resolve before claims are acquired. Referenced
dialogues, including dialogue jumps, must have no import diagnostics. Dialogue
choices use ordinary action nodes to set story flags or perform other supported
Lua actions immediately. These changes survive a later cutscene interruption.
Dialogue actions do not need access to a cutscene-specific Lua environment.

## Completion and persistence

`allowSkip` and `onComplete` are required authored fields. `onComplete` contains
`actions`, a synchronous Lua block using the same state APIs as dialogue actions,
`characterPlacements`, and optional structured `steps`. Empty actions, steps and placement lists are valid. Lua syntax is
checked during import. There is no cutscene outcome string or `SetOutcome` action.

Normal playback and skipping both apply the prepared placements, execute
`onComplete.steps` in authored order, then run `onComplete.actions` once and add the cutscene ID to the saved
`GameState.Story.CompletedCutscenes` set. That ID prevents replay. Cancellation
or an exception before completion does not execute `onComplete` or mark the cutscene completed.
Completion actions are ordinary immediate mutations, not a rollback transaction.
If they throw, the exception propagates and the cutscene is not marked completed.
Scenes requiring a player decision use `allowSkip: false`; skipping does not
execute the remaining dialogue choices or invent answers.

`onComplete.characterPlacements` is an ordered list of
`{ "character": "placed-instance-id", "anchor": "anchor-id" }` endpoints, with
each character listed at most once. Empty lists are valid.

Each endpoint may instead store `{ "character": "player", "position": { "x": 168, "y": 104 } }`.
Coordinates are integer map pixels from the top left, with the character's feet
aligned to that point. Grid picks save tile centers in this same format. An
endpoint must contain exactly one of `anchor` or `position`; the position object
contains only `x` and `y`. Coordinate endpoints retain current playback facing, while
anchors retain their existing nonzero-facing override. This endpoint plan is
shared by normal completion and skipping and runs before completion steps.

The runner captures the initial positions and facing of referenced characters before
execution. Normal completion and skip both stop transient actions and apply the
same prepared endpoints. Unlisted characters return to their pre-run placement. An
anchor's nonzero facing overrides the character's direction; zero retains its current
playback direction. Unlisted characters also keep current facing when restored to
their pre-run position. Each endpoint can optionally specify `facing`: `North`,
`East`, `South`, `West`, or `preserve`. A direction overrides anchor facing, and
`preserve` suppresses the anchor override. Omitting it uses current facing for
coordinate endpoints and the anchor's nonzero facing for anchors. Cancellation
still restores the initial facing. Structured completion steps execute afterward, so an explicit final
FaceDirection can override that facing. Spawned character endpoints update the existing live spawn state. The
completion marker is saved before terminal notifications.
Cancellation, location leave, death, disabled presentation and exceptions
stop pending movement/dialogue and restore surviving characters.
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

## Lua script blocks

`Cutscene.RunLua(code)` exports `cutscene.runLua` as an immediate action allowed
only in `sequence`. Its string parameter is marked `[LuaCode]`, which exports
`semanticType: "lua", picker: "lua"` for the shared Vulcanus Lua editor. Import
compiles the chunk to check syntax without executing it; the sequence compiler
quotes the entire code argument, including newlines, instead of injecting Lua.

At runtime the action uses `VulcanusLuaEngine.Execute`: the same synchronous,
writable scripting sandbox and instruction budget used by dialogue scripts.
Each block has a fresh local scope. Timed actions stay separate typed steps;
session action APIs are not available inside the block. Errors fail playback.
Skipping bypasses remaining sequence blocks and applies completion normally.
Preview declares `spatialState: "unknown", effects: []`; arbitrary code is never
executed in Vulcanus to guess changes in scene state.
