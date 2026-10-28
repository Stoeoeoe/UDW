# Cutscene authoring

## Parallel tracks

Use **Add step > Parallel block** in Sequence to start several tracks together.
Each track runs its actions in order; **Join** waits for every track before the
next outer step. A track can contain movement, waits, animation or dialogue, so
other actions can happen while characters are walking. Add/remove tracks and
duplicate/delete blocks through their controls; normal Undo/Redo applies.

Each block requires at least two nonempty tracks of ordinary sequence actions.
Conditional and parallel blocks are top-level only. Tracks cannot control the same
character, open dialogue from more than one track, or write the same story key.
These checks cover the whole block even if a track first waits. Put shared actions
after the join. Run Lua stays outside parallel blocks because its writes cannot
be checked. Every child reference is validated before export and Unity playback.

Preview draws independent routes from the state before the block. Selecting a
child shows that track's schematic result and leaves other tracks' positions
unknown; selecting a later step combines the endpoints after the join. Timing
and collisions are verified in Unity. Cancelling, skipping or failing a cutscene
cleans up all active tracks through Unity's existing runner.

Runtime source uses `action: "control.parallel"`, empty `arguments`, and
`tracks: [[step, ...], [step, ...]]` in formatVersion 2. Step IDs remain unique
across every phase and track. No new binding-manifest action is needed: parallel
blocks are control flow, like conditional branches.

The cutscene workspace has **Before start**, **Sequence** and **On completion**
tabs, with a shared Inspector and persistent resizable map preview. Select a
step to edit its parameters, or Scene settings to edit name, map and skip
eligibility. Final character positions remain editable in the completion Inspector.
They share the Grid, Pixel and Anchor picker used by placement steps. Grid picks
tile centers; Pixel picks individual map pixels. Picking is staged until a click
confirms it, and Escape cancels. The same endpoints apply after watching or skipping.

Before start and On completion offer only immediate actions explicitly allowed
in their manifest phase and cutscene context. Sequence offers sequence actions.
All phases use the same numeric, resource and map/reference pickers. There is no
raw Lua field. Context menus insert, duplicate, reorder, delete or move eligible
steps between phases. Moves retain IDs, arguments and labels. IDs must be unique
across all phases. Global Undo/Redo and text-field undo retain their usual roles.

## Bindings and resources

Configure Unity's `Generated/Scripting/bindings.json` path in **Scripting ? Lua
Manifest**. Vulcanus reads and watches it in place for the whole tool, remembers
the path locally, and refreshes open palettes, forms and previews when it changes.
Invalid/deleted sources invalidate consumers instead of retaining stale bindings.

Labels, categories, descriptions, contexts, phases, execution and parameters come
from the manifest. A string parameter with `resourceType` selects from
`resources[resourceType]`: show descriptions, store IDs. Missing catalogs or IDs
are errors and never replace authored values. Numeric fields preserve decimals
and zero as JSON numbers; blank/nonfinite values are invalid. API-specific ranges
remain Unity's responsibility unless exported as metadata.

Character references use placed NPC-instance IDs, reserved `player`, and roles declared
by preceding setup steps. Spawn appears only in Before start because its bindings
allow only `setup`. Its Character selector lists the project's characters. Instance
name identifies the spawned copy and is suggested automatically when choosing a
character. Unity prefab registration is not checked by the editor. Blank,
duplicate and forward references are errors; renaming or reordering declarations
updates character selectors without replacing saved IDs. Anchor and dialogue IDs refer
to existing map/project resources. Renaming labels does not change references.

## Preview

The map stays beside the compact step list, stacking below it in narrow layouts.
Left drag pans and the wheel zooms around the cursor. Selecting a step frames its
affected positions; Fit shows the full map. Vector arrows, markers and labels
remain sharp and readable independently of the pixel-art tile canvas.

Preview effects come exclusively from `action.preview`. Setup is folded before
sequence steps. Completion starts with restored/original placements plus the
explicit endpoint plan, then folds typed completion steps. It does not use the
last sequence snapshot, so it also represents skipping. Unknown state stays
unknown. The runtime player has no invented origin; declared setup effects can
establish a known position when such an action exists in the bindings.

Movement arrows show schematic displacement and previous-position ghosts, not
navigation paths. Facing identifies the turning character and target; movement
history is optional while inspecting facing. Dialogue is a reference cue, not
executed flow. Physics, collision and timing verification belongs in Unity.

## Files and validation

Resources open as individual tabs from the Cutscenes explorer section. Create,
rename, folder, delete and reveal use the shared navigation actions. Labels and
virtual folders stay in `cutscene-editor.json`, outside runtime source.

Validation updates continuously and reports concrete issues on steps, fields and
phase tabs. Standard Save, Save All and the existing autosave preference operate
per file. Saving/discarding one scene does not commit another scene's drafts,
metadata or pending deletion. Export rechecks current bindings/resources.

Sources now use **formatVersion 2**, with `onStart`, `sequence` and
`onComplete: { characterPlacements, steps }`. See [the v2 contract](cutscene-source-v2.md)
for exact execution order, skipping, migration and Unity acceptance requirements.
Empty legacy completion Lua can migrate losslessly; nonempty Lua requires manual
conversion and is never discarded. Unity's current v1 importer must be updated
before these v2 sources can play. No Lua sequence compiler, animation simulation
or new runtime action implementations are generated by Vulcanus.

## Position picking

Spawn and Place share Grid, Pixel and Anchor modes, as advertised in bindings.
Grid snaps the character's feet to tile centers; Pixel uses integer map pixels;
Anchor selects an existing map anchor. Coordinates save `{x,y}` and anchors save
`{anchor}` with no mixed fields or editing-mode property. Pick on map stages a
feet marker until click confirmation; Escape cancels. Left drag and wheel zoom
remain available while picking. Definition icons identify spawned characters and
placement ghosts; runtime prefab sprites are not present in the bindings.

## Choosing a character to spawn

Spawn's **Character** selector uses the project's Characters list and saves the character
ID. Unity resolves that ID to its runtime prefab and reports registration errors
there. `resources.character` from the bindings does not restrict the editor's choices.

**Instance name** identifies this particular copy of the character in later steps.
Choosing a character suggests a unique name when the field is empty; explicit names
are retained. Several instances can share one character definition while keeping
separate instance names. The existing runtime player is selected with the `player`
reference in Place and other character actions; Spawn creates a new NPC instance.

Character terminology applies to code and saved data, including `characters/`,
`.character.json`, `characterRef`, and `characters.*` Lua actions. Pre-rename resources and bindings require recreation; no migration for the old
`actors/` resources or `actorRef` metadata is provided.

Path parameters use ordered waypoints with the same position picker. Add, reorder
or remove points in the Inspector; the preview draws numbered waypoints and
route arrows. See [walk-path support and the Unity handoff](cutscene-walk-path.md).
