# Routine editor

A routine (`routines/*.routine.json`, schema `schemas/routine.schema.json`) is one NPC's day plan. Unity reads it
each morning: the first matching **special day** (`overrides`), otherwise the first matching **ordinary day**
(`variants`), decides the day's goals. A goal is "at HH:MM, walk to this anchor, then play this activity until the
next goal". Create one from the **Routines** section of the explorer; each character has at most one routine, and
the routine is named after its character.

## Layout

- **Header**: the character, the routine's **home** (where the NPC wakes up and sleeps), undo/redo and a summary of
  problems that stop Unity from importing it. Hover the red badge to read them.
- **Days** (left): special days, then ordinary days, in evaluation order. Reorder with the arrows; order decides
  which day wins. The fallback (the first ordinary day with no condition) is marked; anything after it is greyed
  out as *never chosen*. A **pick one** day is a pool: Unity draws one of its options whose condition holds,
  weighted by `weight`; the percentage is the chance when every option is possible.
- **Day** (middle): the selected day's ID and condition, a 24-hour strip of where the NPC is, and the goals. A goal
  can go home or to a place (map + anchor), play an activity animation from Unity's bindings, and be limited to
  some days with its own condition.
- **Map** (right): the map of the selected goal, with every anchor, the home (⌂) and each leg of the day that stays
  on this map. Legs show the route Unity's pathfinder would walk; a red dashed line means there is no walkable
  route and is only a straight stand-in. Travel between maps is not drawn.

## Walking times

Each goal card says when the character arrives, and the day strip shows walking as a hatched part of each
segment. Walking time is the route length divided by the character's **walk speed** (tiles per second, set in the
character editor; empty means 4) and converted with the game clock (`clock.secondsPerInGameMinute` in Unity's
`bindings.json`, from the `SystemRoot` prefab). A goal turns orange when the character is still walking at the
next departure or after the day ends, or when no walkable route exists. Without the clock in the bindings,
walking times are not shown. Walks to another map have no known duration yet.

The same walk speed drives the game: Unity imports it into the character definition and uses it as the base
walk speed (boons still modify it).

## Picking and creating anchors

The crosshair next to a place (home or a goal destination) arms the map. Click within ¾ of a tile of an anchor to
use it, or click an empty spot to create an anchor there: name it, then **Create and use**. The anchor is added to
that map and saved with it, like one placed in the map editor.

## Which day wins?

The switch at the bottom of the day list lists every condition in the routine. Tick the ones that hold to see
which day Unity would choose (green bar). For a pool, every option that could be drawn is marked. Goals whose
condition is not ticked are greyed out and skipped on the strip and the map. Nothing runs Lua: conditions are
treated as named switches, so two different expressions that mean the same thing are separate switches.

## Saving

Edits save automatically like other resources. A routine is only written when Unity can import it: unique IDs,
times increasing within a day, an ordinary day without a condition, conditions on special days, positive
weights, and no blank conditions. Missing maps, anchors, characters and animations are shown as problems too,
because Unity's catalog refresh rejects them.

## Route preview

`app/src/lib/navigationPath.ts` ports Unity's `GridPathfinder` (weighted 8-directional A*, no corner cutting) and
runs it on the navigation cost grid (see [navigation-cost.md](navigation-cost.md)). A cell is blocked when
collision covers the middle half of the tile: tile collisions on visible visual, terrain and object layers, drawn
water and the map's collision shapes. Unity tests the character's own collider and also sees entities placed on
the map, so the game is the reference; use its navigation debug view when the two disagree.
