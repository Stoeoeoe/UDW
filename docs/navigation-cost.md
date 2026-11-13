# Navigation cost

Tiles can carry an optional `navigationCost` (integer 1-100, lower = preferred) used by NPC pathfinding in the Unity game.
Set it in the tileset editor's tile inspector ("Navigation cost"). With several tiles selected, the value applies to all of
them; clearing the field removes the key. Absent values are never written to the tileset file.

## Rule per map cell

1. Start with the **terrain layer** tile's cost. If that tile has no cost (or there is no terrain tile), use the default cost **2**.
   The terrain layer is the first visible `terrain` layer in the map's layer order (what Unity treats as the terrain tilemap).
   It is always the base, whatever its zOrder.
2. Every other visible tile layer and object layer, in ascending `zOrder`, overrides the cost where its tile at that cell has a
   `navigationCost`. Tiles without a cost are transparent, so decorations on a road do not reset the road.
3. Object layers contribute only their placed object instances (each object's tiles at the instance's tile offset).
4. Invisible layers are ignored.

Blocking (walls, objects, water) is not part of the cost; it is decided at runtime in Unity. Use the collision overlay to see it.

Constants (kept identical in `schemas/tileset.schema.json`, `app/src/lib/navigationCost.ts` and the Unity importer):
default cost 2, authored range 1-100.

## Overlay

The map toolbar has a "Navigation cost overlay" toggle next to the collision overlay. Cheaper than default cells tint green,
default cells are untinted, dearer cells tint red. Hovering a cell shows "Cost N (layer name | default)" above it.
The grid is computed by `computeNavigationCostGrid` in `app/src/lib/navigationCost.ts`.

The tileset toolbar has the same toggle. It labels every tile that has an authored cost with that number, using the same tint, so you can see which tiles of a sheet carry a cost. Tiles without a cost are left blank because they do not override anything.
