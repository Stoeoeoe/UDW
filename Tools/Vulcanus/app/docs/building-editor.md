# Building editor (design draft)

A building is a model: a plan per floor with walls, openings and stairs, and a roof. Vulcanus generates both the
exterior placed on a map and the interiors from it, so the two always agree on doors and windows. Buildings are assembled from a
hand-drawn **kit** of 16 px pieces, so a season such as winter is drawn once per piece, not once per building.

Status: the building editor, kits and placing buildings on maps work in Vulcanus (see
[building-editor-plan.md](building-editor-plan.md)); Unity does not use buildings yet.

- Prototype kit: [building-kit/kit_roman_basic.aseprite](building-kit/kit_roman_basic.aseprite), also as
  [PNG](building-kit/kit_roman_basic.png) with a [winter sheet](building-kit/kit_roman_basic_winter.png) (programmer
  art with the right sizes, meant to be redrawn).
- Example exteriors from Vulcanus's preview: [side gable](building-kit/example_barn.png),
  [front gable](building-kit/example_farmhouse.png), [cross gable over two floors](building-kit/example_villa.png),
  [the same in winter](building-kit/example_villa_winter.png); [an interior](building-kit/example_interior_3x.png).

## Scope

Any number of floors on one rectangular grid, rooms on each, stairs between them, a side, front or cross gable roof,
doors and windows, one wall material and one roof material. Later: hip roofs, L shapes, the Roman domus with its
atrium.

## Grid and projection

- Tiles are 16 px; characters are about 32 px tall.
- The view is oblique top-down: the ground and the tops of things are seen from above, and faces that point south are
  drawn below them at their real height. East, west and north faces are not visible.
- One floor's front wall is **3 tiles (48 px)** high, so a 32 px character fits through a door with a lintel above.
- The exterior is drawn by **readable rules, not to scale**, as in most games of this kind: fronts at full height,
  depth squashed. A building's inside can be deeper, and wider (its `scale`), than its outside looks. Drawn to scale, a
  45° roof would be as many rows tall as the building is deep and dwarf the front.

## The plan

- The building is a grid of `width × depth` cells; every floor has the same grid. The first floor is the ground floor.
- On each floor, each cell is **wall** or **floor**. Walls are whole cells, one tile thick: the game's navigation
  blocks whole cells, so thinner walls would let characters walk through them.
- The border of the grid is wall. Inner walls are full rows or columns of wall cells; the floor areas between them are
  rooms. Each room has a floor material.
- Openings replace a wall cell: a **door** (between rooms, or the ground floor's **entrance** in the south wall) or a
  **window** (in the south wall, the only outer wall seen from outside).
- Every floor but the top one has **stairs up** on a floor cell; the floor above has its stairs down on the same cell.
- A **chimney** rises from a column of the plan.
- **Scale** 1 or 2: plan columns per column of the front. At 2 the inside is twice as wide as the outside.

## Exterior

The front is `ceil(width / scale)` columns wide; plan column *x* shows in front column `floor(x / scale)`. Two windows
in one front column are one window; a door and a window in one column show the door.

From the top, the exterior image has:

1. **The roof.** Its slope is `clamp(ceil(depth / 2), 2, 4)` rows: the building's depth, squashed.
   - **Side gable** (ridge along the front): `roof_ridge`, `roof_slope`…, `roof_eave`, with `_l`, `_m`, `_r` pieces
     for the first, middle and last column.
   - **Front gable** (ridge from front to back): a triangle on the front, as tall as half the front plus one row, with
     the slopes going back beside it. The middle column has `gable_peak` (the ridge's far end), `gable_ridge`…,
     `gable_apex` and `gable_wall` below; a column *d* columns from the middle has `gable_back_{l,r}` in row *d*,
     `gable_roof_{l,r}` below it, `gable_edge_{l,r}` *slope rows* lower, and `gable_wall` under that. The front must be
     an odd number of columns wide.
   - **Cross gable**: a front gable over the room behind the entrance (its walls included, widened by a column if
     needed so the gable has a middle) and side gable wings on both sides, each at least 2 columns wide.
2. **The walls**, 3 rows per floor, top floor first: `wall_top` (under the eave) or `wall_band` (under the floor
   above), `wall_mid`, and `wall_base` for the ground floor or `wall_mid` above it. Each floor's south windows show as
   `window` over its middle row; the entrance shows as `door_lintel`, `door_upper`, `door_lower` over the ground
   floor's rows. Doors and windows are overlays, so the wall's shadows and mouldings run on around them.
3. **The chimney**: `chimney_top` on the highest roof row of its column and `chimney_bottom` below, drawn **over** the
   roof.

The bottom *slope rows* rows of the image are the building's footprint on a map: the ground it stands on and
collides with, except for the entrance.

## Interior

Each floor's interior uses the building's grid, cell for cell.

- A wall cell shows its top: `wall_cap_NN`, where `NN` adds 1, 2, 4 and 8 for a wall neighbour to the north, east,
  south and west.
- A room's top two rows show its back wall: `wall_face_upper` directly below the wall, `wall_face_lower` below that
  (with `_l`, `_m` or `_r` by whether a wall is to the left or right). These rows are not walkable, so a room needs at
  least three rows.
- The other room cells show the room's floor (`floor_boards`, `floor_tiles`).
- A door in an inner wall shows `threshold`; a door in a back wall cuts through the face with `door_face_upper` and
  `door_face_lower`. The entrance in the south wall shows `entrance_mat`, where the interior links to the exterior
  door. A window in the south wall shows `window_cap`.
- Stairs up show `stairs_up`, and the floor above shows `stairs_down` on the same cell, both drawn over the floor.

## Kit pieces

Each piece is a 16×16 cell of the kit sheet at a fixed position (the **standard kit layout**, the prototype's layout),
so its name says where it is; the prototype Aseprite file also carries matching slices for the artist's convenience. Most pieces are opaque; **overlay** pieces (the chimney and the stairs) are transparent
around what they show and are drawn over the piece below them, so that piece's own variations, such as snow on the
roof, show around them. Anything that sits on a surface should be an overlay.

| Group | Pieces |
|---|---|
| Roof | `roof_ridge_{l,m,r}`, `roof_slope_{l,m,r}`, `roof_eave_{l,m,r}` |
| Front gable | `gable_peak`, `gable_ridge`, `gable_apex`, `gable_back_{l,r}`, `gable_roof_{l,r}`, `gable_edge_{l,r}`, `gable_wall` |
| Front wall | `wall_top_{l,m,r}`, `wall_band_{l,m,r}`, `wall_mid_{l,m,r}`, `wall_base_{l,m,r}` |
| Openings | `door_lintel`, `door_upper`, `door_lower`, `window` |
| Overlays | `chimney_top`, `chimney_bottom` |
| Interior walls | `wall_cap_00` … `wall_cap_15`, `wall_face_upper_{l,m,r}`, `wall_face_lower_{l,m,r}` |
| Interior openings | `door_face_upper`, `door_face_lower`, `threshold`, `entrance_mat`, `window_cap`, `stairs_up`, `stairs_down` |
| Floors | `floor_boards`, `floor_tiles` |

## Variations in the kit

A kit sheet is a PNG or an Aseprite file (flattened). A variation (`winter`, later perhaps `festival`) is an extra
sheet in the same layout, drawn over the base: it only needs pixels where something changes — in the prototype, snow
on the roof, the chimney, the door lintel and the window sills. When a map shows a variation, every piece uses its
variation pixels over its base, so every building built from the kit gets its winter look for free. (In the prototype
Aseprite file the snow is the layer `variations/winter`; reading variations from Aseprite layers directly is a later
addition.)

## Open questions

- Variation IDs are defined per map today; pieces need them to mean the same everywhere, so they likely become a
  project-wide list.
- How props placed in an interior survive when the building's plan changes (likely by belonging to a room).
