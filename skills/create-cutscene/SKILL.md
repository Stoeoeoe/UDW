---
name: create-cutscene
description: Create or edit Vulcanus cutscene graphs from a scene description using the project's live Lua bindings, graph schema, maps, actors and resources. Use for cutscene content authoring, not implementing editor or runtime features.
---

# Create a cutscene

Turn the user's scene description into an editable Vulcanus graph source, validated against the actual project and editor. Prefer native action/function nodes with readable execution and data wires. Do not replace the graph with one large Lua script.

## Find the live contracts

Identify these paths from the workspace and existing project configuration before authoring:

- Vulcanus editor checkout containing `app/src/lib/cutsceneGraph.ts` and `schemas/cutscene.schema.json`.
- Target `.vproj` file and its adjacent content folders.
- The Unity-exported bindings JSON used by this project. The editor stores its selection under `vulcanus.scriptingManifestPath`; it is not necessarily a `.vproj` field. In this game's checkout, look at `Generated/Scripting/bindings.json`. Do not substitute test fixtures or an old skill-owned copy.

In the current workspace these are normally `C:/GameDev/mapeditor`, `C:/GameDev/UrdewValley/Assets/Vulcan/0204project/vulcan.vproj`, and `C:/GameDev/UrdewValley/Generated/Scripting/bindings.json`. These are discovery hints, not fixed output locations. Respect the user's selected project.

Read the live editor `schemas/cutscene.schema.json`, `app/src/types/cutsceneGraph.ts`, and `docs/cutscene-graph.md`. Read relevant portions of `app/src/lib/cutsceneGraph.ts` (`graphSignature`, `graphNodeFields`, `validateGraphPlan`) for node/pin semantics. The schema describes shapes; the validator also enforces execution ordering, types, claims and parallel restrictions. Check the target project's schema as well; never overwrite schemas or regenerate bindings just to make content pass.

Use the bundled helper to inspect the project and matching bindings:

```powershell
node <skill>/scripts/cutscene-project.mjs inspect --editor C:/GameDev/mapeditor --project C:/GameDev/UrdewValley/Assets/Vulcan/0204project/vulcan.vproj --bindings C:/GameDev/UrdewValley/Generated/Scripting/bindings.json --query walk
```

Omit `--query` for the full action/function catalog. Use `--map <map-id>` to inspect one map's anchors, paths and live NPC bindings. Inspect actual map content for visual paths; a character definition is not a live map actor. `player` is the built-in player binding. Use existing project character/resource IDs from the inspector output.

## Author the requested scene

- Resolve the map, participants, timing, dialogue and skip/final-placement behavior from the request and project. Make routine pacing/layout choices without repeated questions. If a required actor, dialogue or API is missing, identify it instead of inventing an ID or implementing a new binding. Ask only when a remaining choice changes the requested scene materially.
- Author breathing room explicitly with Wait nodes. Let the opening shot settle after the entrance transition before dialogue or movement (often 1–1.5 seconds). Add short reaction holds after important lines, a beat after characters arrive, and time after an impact before recovery or weather changes. Roughly 0.3–0.8 seconds suits small reactions; larger impacts may need a second or more. Tune to the scene rather than inserting a wait after every action. Dialogue reading time does not replace a deliberate visual pause.
- Read existing cutscenes and their IDs before choosing a permanent namespaced ID. Preserve IDs when editing. Use the helper's live resource filename convention (`resourceFilename`) for new sources under `cutscenes/`; preserve an existing file's location when editing it.
- Write the graph source with `apply_patch`. Graphs own their phases: corresponding `sequence`, `onStart`, or `onComplete.steps` lists are empty. Keep required root fields, phase names, variable types and format version from the current schema. Do not add save migrations or schema bumps.
- Keep execution left to right. Give Lua nodes more width and separate parallel tracks vertically; keep pure value nodes near their consumers with legible wires. Canvas positions are graph pixels, not map positions.
- Use manifest action IDs, exact named parameters, phase eligibility, optional/default rules, semantic pickers and ordered output declarations. Use existing read-only functions for pure function nodes; a value-returning state-changing method is not pure. Lua can read/write `Cutscene.Variables.<name>` using declared typed locals. A pure expression reads state and produces one declared value without `return`; a Lua script result node must return its declared number and types of values, including nil allowances.
- The editor's built-in Set Variable action is defined in `app/src/lib/cutsceneVariables.ts`, rather than necessarily being a manifest binding. Read its typed action descriptor when using it.
- Prefer direct typed data wires for intermediate results. Execution controls when an action runs; a data wire does not execute an action. An awaitable action's `next` pin means it has completed. Non-pure results must be produced before consumption. Use `resultVariables` only when an explicit cutscene local is useful, preserving output order and using `null` for unused destinations.
- For parallel motion, use a parallel node with one nonempty execution chain per track and its reciprocal paired join. Start later work from the join. Give tracks disjoint character/other exclusive claims and avoid racing local variable reads/writes. Do not smuggle timed work into Lua or fire-and-forget flags to bypass the join. Follow the current validator's control restrictions; currently branch/parallel regions are top-level Sequence controls with no nesting or cycles.
- For If/Else, connect the typed condition input and both execution alternatives to the paired join. Values produced on only one alternative are unavailable unconditionally after the join. Read current pin names from the graph implementation; persisted pins are plain names, without UI-only `exec:` or `data:` prefixes.
- Spatial values follow binding metadata: positions/paths commonly use integer map pixels measured from the top left; anchors use their authored local IDs. Read the map's `tileSize`, bounds and spatial primitives. A visual route needs actual coordinates or an authored path, not guessed waypoints. Final placements and facing apply after watching or skipping; define them intentionally when the scene must leave characters in a particular state.
- Check actors' physical footprints as well as waypoint centers when staging parallel movement. Prefer separated or staggered paths. When intended cinematic movement needs collision bypass, use the live movement binding's explicit `ignoreCollisions` option; keep the default collision behavior elsewhere. Bypass warns on actual overlaps and restores collision settings when movement finishes or is cancelled. A bypassed path is not evidence of a clear route; inspect its warnings and final staging.
- Check the runtime's replay rules before designing remembered/repeat branches. This game's runner blocks completed cutscene IDs, so branch on another reachable story condition rather than this cutscene's own completion flag.
- Limit content edits to the requested scene and any explicitly requested supporting content/wiring. Preserve unrelated maps, declarations and editor metadata. A graph source normally needs no scene/prefab registration. Map trigger changes belong to an explicit playback/wiring request.

## Validate and deliver

```powershell
node <skill>/scripts/cutscene-project.mjs validate --editor C:/GameDev/mapeditor --project C:/GameDev/UrdewValley/Assets/Vulcan/0204project/vulcan.vproj --bindings C:/GameDev/UrdewValley/Generated/Scripting/bindings.json --scene <source-file>
```

The helper is read-only. It uses the installed editor dependencies, both live cutscene JSON schemas, and the actual TypeScript parser/export validators, including Lua syntax and graph semantics. It loads resources using the editor's resource registry/ID normalization. Fix diagnostics and rerun; do not weaken validators or replace missing required data with fallbacks. For an edited scene, also check that its ID is not duplicated by another source file.

Review the completed graph against the requested beats, parallel joins, branch paths and skip state. A passing authoring validator does not prove animation timing, walkability, runtime Lua result types or Unity playback. Report which validation ran; verify playback only when requested and available. Do not launch the desktop editor just to author JSON.

Finish with the source path, a short account of the scene's behavior and validation, and any unresolved content/playback limitation. When the user asks only for a draft, leave unrelated trigger wiring alone.
