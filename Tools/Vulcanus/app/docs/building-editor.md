# Building editor (design draft)

A building is a model: a floor plan with walls, openings and a roof. Vulcanus generates both the exterior placed on
a map and the interior map from it, so the two always agree on size, doors and windows. Buildings are assembled from a
hand-drawn **kit** of 16 px pieces, so a season such as winter is drawn once per piece, not once per building.

Status: rules and a prototype kit only. Nothing in the editor or in Unity uses this yet.

- Prototype kit: [building-kit/kit_roman_basic.aseprite](building-kit/kit_roman_basic.aseprite) (programmer art with
  the right sizes, meant to be redrawn).
- Example renders, composed only from kit pieces by the rules below:
  [exterior](building-kit/example_exterior_scene_3x.png),
  [exterior in winter](building-kit/example_exterior_winter_scene_3x.png),
  [interior](building-kit/example_interior_3x.png).

## First scope

One storey, one rectangular wing with rooms, a gable roof whose ridge runs parallel to the front, doors and windows,
one wall material and one roof material. Later: hip roofs, L shapes, more storeys, the Roman domus with its atrium.

## Grid and projection

- Tiles are 16 px; characters are about 32 px tall.
- The view is oblique top-down: the ground and the tops of things are seen from above at full size, and faces that
  point south are drawn below them at their real height. East, west and north faces are not visible.
- One storey's front wall is **3 tiles (48 px)** high, so a 32 px character fits through a door with a lintel above.
- Roofs are pitched at **45°**. From the front only the south slope is visible, and it is as many rows tall as the
  building is deep.

## The plan

- The plan is a grid of `width × depth` cells covering the building's footprint.
- Each cell is **wall** or **floor**. Walls are whole cells, one tile thick: the game's navigation blocks whole cells,
  so thinner walls would let characters walk through them.
- The border of the footprint is wall. Inner walls are full rows or columns of wall cells; the floor areas between them
  are rooms. Each room has a function (kitchen, bedroom, taberna…) and a floor material.
- Openings replace a wall cell: a **door** (in an outer or inner wall) or a **window** (in the south outer wall, the
  only outer wall seen from outside).
- A **chimney** stands on a column of the roof.

## Exterior

The exterior image is `width` columns and `depth + 3` rows; its bottom `depth` rows are the footprint (collision, and
the line characters are sorted against), so the image reaches 3 rows above the footprint's north edge.

| Row (from the top) | Piece |
|---|---|
| 0 | `roof_ridge` |
| 1 … depth − 2 | `roof_slope` |
| depth − 1 | `roof_eave` |
| depth | `wall_top` |
| depth + 1 | `wall_mid` |
| depth + 2 | `wall_base` |

- Every row uses its `_l` piece in the first column, `_r` in the last, and `_m` in between.
- A door in the south wall at column *c*: `door_lintel` in the `wall_top` row, `door_upper` and `door_lower` below.
- A window at column *c*: `window` in the `wall_mid` row.
- A chimney at column *c*: `chimney_top` in the ridge row and `chimney_bottom` in the first slope row, drawn **over**
  the roof.

## Interior

The interior map uses the same grid as the plan, cell for cell.

- A wall cell shows its top: `wall_cap_NN`, where `NN` adds 1, 2, 4 and 8 for a wall neighbour to the north, east,
  south and west.
- A room's top two rows show its back wall: `wall_face_upper` directly below the wall, `wall_face_lower` below that
  (with `_l`, `_m` or `_r` by whether a wall is to the left or right). These rows are not walkable, so a room needs at
  least three rows.
- The other room cells show the room's floor (`floor_boards`, `floor_tiles`).
- A door in an inner wall shows `threshold`; a door in a back wall cuts through the face with `door_face_upper` and
  `door_face_lower`. The entrance in the south wall shows `entrance_mat`, where the interior links to the exterior
  door. A window in the south wall shows `window_cap`.

## Kit pieces

Each piece is a 16×16 cell of the kit sheet at a fixed position (the **standard kit layout**, the prototype's layout),
so its name says where it is; the prototype Aseprite file also carries matching slices for the artist's convenience. Most pieces are opaque; **overlay** pieces (the chimney) are transparent
around what they show and are drawn over the piece below them, so that piece's own variations, such as snow on the
roof, show around them. Anything that sits on a surface should be an overlay.

| Group | Pieces |
|---|---|
| Roof | `roof_ridge_{l,m,r}`, `roof_slope_{l,m,r}`, `roof_eave_{l,m,r}` |
| Front wall | `wall_top_{l,m,r}`, `wall_mid_{l,m,r}`, `wall_base_{l,m,r}` |
| Openings | `door_lintel`, `door_upper`, `door_lower`, `window` |
| Overlays | `chimney_top`, `chimney_bottom` |
| Interior walls | `wall_cap_00` … `wall_cap_15`, `wall_face_upper_{l,m,r}`, `wall_face_lower_{l,m,r}` |
| Interior openings | `door_face_upper`, `door_face_lower`, `threshold`, `entrance_mat`, `window_cap` |
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
- Whether interiors should eventually be larger than the footprint (as in many games) instead of cell for cell.
- How props placed in an interior survive when the building's plan changes (likely by belonging to a room).
