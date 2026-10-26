# Walk a path: editor support and Unity handoff

Vulcanus supports an inline ordered path argument. Each point uses the shared
position format: integer map pixels `{x,y}` or a map-anchor reference `{anchor}`.
The list must contain at least one point. Grid snaps to tile centers; Pixel picks
individual map pixels; Anchor selects an existing anchor. Editing modes are not
serialized. This does not reference the map's separate named spatial paths.

Unity implements and exports this action through
`Generated/Scripting/bindings.json`, including the matching path argument and
route-preview metadata. Vulcanus reads those parameter mappings rather than
switching on the action ID. The editor integration test uses Unity's generated
manifest as its fixture.

```json
{
  "name": "WalkPath",
  "parameters": [
    {
      "name": "character",
      "type": "string",
      "semanticType": "characterRef",
      "picker": "mapCharacter"
    },
    {
      "name": "path",
      "type": "path",
      "picker": "mapPath",
      "coordinateSpace": "mapPixels",
      "origin": "topLeft",
      "placementModes": ["tile", "pixel", "anchor"],
      "tileAnchor": "center",
      "characterPivot": "feet"
    }
  ],
  "returnType": "nil",
  "returnNullable": false,
  "writesState": true,
  "action": {
    "id": "characters.walkPath",
    "displayName": "Walk path",
    "category": "Movement",
    "description": "Walk through the ordered waypoints.",
    "contexts": ["cutscene", "npcRoutine"],
    "phases": ["sequence"],
    "execution": "awaitable",
    "preview": {
      "version": 2,
      "spatialState": "described",
      "effects": [
        {
          "kind": "moveCharacterAlongPath",
          "characterParameter": "character",
          "pathParameter": "path",
          "facing": "unknown"
        }
      ]
    }
  }
}
```

Example saved step, retaining cutscene source format version 2:

```json
{
  "id": "walk-to-meeting",
  "action": "characters.walkPath",
  "arguments": {
    "character": "guest",
    "path": [
      { "x": 168, "y": 104 },
      { "anchor": "meeting" },
      { "x": 208, "y": 120 }
    ]
  }
}
```

The character starts at its accumulated current position, visits every point in
order, and ends at the last point. The action is awaitable and sequence-only;
setup and completion use immediate placement actions instead. Unity must resolve
and validate every anchor and coordinate before playback, visit each point using
its movement implementation, and stop pending movement on cancellation/skip.
Normal completion and skip still use the cutscene's explicit completion plan.

The schematic preview draws numbered waypoints and arrows for each known leg,
then carries the final position into subsequent steps. It does not simulate
collision or pathfinding and does not infer final facing. Unknown origins have
no fabricated first segment. Missing waypoints produce diagnostics and never
create a connecting segment across the unresolved point. A declaration of
`spatialState: "unknown"` still invalidates accumulated spatial certainty.

In the Inspector, Add waypoint opens the shared position field. Pick on map
stages the point until a click confirms it; Escape cancels the pick. Points can
be reordered and removed, and edits participate in global Undo/Redo and per-file
save. Empty/incomplete paths and unresolved references block export.
