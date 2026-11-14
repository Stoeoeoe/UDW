# NPC routines

A routine describes an NPC's day: where they start, when they set off, where
they go and what they do there. Routines are authored as `*.routine.json`
files in the Vulcanus project (schema: `schemas/routine.schema.json`); the
Vulcanus importer turns each into a `RoutineDefinition`, and `RoutineCatalog`
lists them. Each character has at most one routine.

```json
{
  "$schema": "../schemas/routine.schema.json",
  "formatVersion": 1,
  "id": "base:fabia_routine",
  "character": "base:fabia",
  "home": { "map": "base:map-1", "anchor": "right-sie" },
  "variants": [
    { "id": "default", "goals": [
      { "id": "visit", "departAt": "08:00",
        "destination": { "map": "base:map-1", "anchor": "fabia-destination" },
        "activity": { "animation": "base:wave2" } },
      { "id": "back_home", "departAt": "10:00", "destination": "home" } ] }
  ]
}
```

## Choosing the day

Each morning the day is chosen once, from game state at that time:

1. `overrides` (festivals, story events), then `variants`. In each list the
   first entry whose `condition` is true wins.
2. An entry has either `goals` or `pickOne`. A `pickOne` pool chooses one of
   its matching members at random, weighted by `weight` (default 1). If none
   of its members match, the pool is skipped.
3. Goals whose `condition` is false are skipped for the day.

Conditions are read-only Lua expressions, like dialogue conditions. The
random pick is deterministic: the same character and day always choose the
same member, so loading a save mid-day rebuilds the same plan. (Once STO-80
adds a per-save seed, it will be mixed in so playthroughs differ.)

`new RoutinePlanner(luaEngine).PlanDay(routine, daysSinceStart)` returns that
day's `DayPlan`: the goals that hold, with `"home"` resolved. The timetable
(below) turns it into where the character is at each minute.

## Moving between maps

Characters change maps only through location links. `MapLinkGraph` (built from the world catalog's map prefabs) joins
the maps; catalog refresh rejects a routine whose goal is on a map no chain of links reaches from where the character
comes from (home or the goal before).

`RoutineTimetablePlanner.Plan(dayPlan, world, walkSpeed, secondsPerMinute)` turns a day plan into a
`RoutineTimetable`: stays and the walks between them, minute by minute and split at every door crossed. It reads only
`WorldNavigation` (each map's baked navigation grid and anchors, plus the links, built once from the map prefabs of the
worlds in `WorldCatalog`), so
it answers for maps that aren't loaded. `At(minute)` gives the segment, `PositionAt(minute)` the feet position in that
map's local space.

- A walk goes through as few maps as possible, and is the shortest of those: characters don't pass through another map
  to save a few steps. Links within one map are ignored.
- A link is used at the walkable tile nearest the middle of its trigger, among those the trigger covers or borders.
  Walking resumes at the link's arrival anchor; crossing takes no time.
- A walk that is still going at the next departure sets off again on arrival.
- A goal with no walkable route is reached as soon as she sets off, with a warning in `Warnings`.
- Minutes are real minutes. The clock advances in steps of `ClockSettings.MinutesPerStep`, one step every
  `secondsPerInGameMinute` seconds, so one minute lasts `ClockSettings.SecondsPerMinute`.

## What the character says

Talking to a routine character starts the dialogue its routine has in effect,
never one fixed on its prefab (catalog refresh rejects a prefab that sets
one). The routine's top-level `dialogue` applies at the start of each day.
Each goal can set `walkingDialogue` (on the way there) and `dialogue` (once
arrived); a phase that sets nothing keeps the newest dialogue set earlier that
day, and goals skipped for the day set nothing. With no dialogue in effect the
character cannot be talked to. `DayPlan.DialogueAt` decides it, and
`RoutineNpcService` applies it to the character's
`ShowVulcanusDialogueInteractable` whenever it is placed, sets off or arrives.
A conversation already running finishes as it started.

Characters that always say the same thing have no routine and keep their
dialogue on their own prefab.

## Rules checked at import

- The schema: IDs, `HH:MM` departure times, `"home"` or a map anchor as
  destination, goals or a pool per entry.
- Conditions must be valid Lua.
- Departures increase within each goal list; goal IDs are unique per list and
  entry IDs unique per file.
- Overrides need a condition. At least one variant has no condition (a pool
  whose members all have conditions doesn't count, as it can be skipped), and
  entries after it are rejected as unreachable.
- When catalogs refresh: the character exists, maps and anchors exist in the
  world catalog's maps, activity animations exist, and no character has two
  routines.

## Presence

`RoutineNpcService` plans every enabled routine's day and timetable when it starts, when a game is started or loaded
(`GameState.Restored`) and at each `NewDayEvent`. Overnight the player returns home before the new day begins, so the
new day also re-places the characters in the current location, behind the overnight blackout. The timetable uses the
walk speed from the character's definition; boons only change how fast she walks in sight.

On entering a location, every character whose timetable has her on its map now is placed where it says: at her place
with its activity, or partway along a walk, walking on. Characters are spawned from their spawnable prefab (the same
lookup as `characters.spawn`) and never saved: the timetable and the clock place them again after loading. A character
with a routine must not also be placed on a map; catalog validation reports it. Departures must fall within the
clock's day (`startOfDay`-`endOfDay`).

While the location stays loaded, the characters on it live through their timetable:

- When a stay ends, its activity's end plays first (activity animations), then she walks the next segment with
  `CharacterNavigation.NavigateTo`. A walk that ends at a goal starts that goal's stay and activity.
- A walk that ends at a door: she walks to the door's tile and fades out. She isn't brought back to this map until her
  timetable has moved past that walk, even if she got to the door early.
- When her timetable brings her onto the map, usually through a door, she fades in where it puts her (the arrival
  anchor, or further along if the clock jumped) and walks on.
- Live walking can run ahead of or behind the timetable. Arriving late, she sets off again at once if her next
  departure has passed; after the clock jumps, she heads for where the timetable has reached.
- If walking stops on the way (no route, or something blocks a segment), she is placed at the end of the walk with a
  warning, like an NPC catching up off-screen.

Not yet built: interruptions and delays (talking, cutscenes; STO-87).
