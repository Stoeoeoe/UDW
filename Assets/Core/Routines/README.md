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
day's `DayPlan`. `DayPlan.At(minuteOfDay)` says where the day stands: at home before
the first departure, otherwise which goal the character last set off for, from
where, and how long ago. Whether they have arrived depends on the route, which
the caller measures.

## Moving between maps

Characters change maps only through location links. `MapLinkGraph` (built from the world catalog's map prefabs) joins
the maps; catalog refresh rejects a routine whose goal is on a map no chain of links reaches from where the character
comes from (home or the goal before).

`RoutineTimetablePlanner.Plan(dayPlan, world, walkSpeed, secondsPerInGameMinute)` turns a day plan into a
`RoutineTimetable`: stays and the walks between them, minute by minute and split at every door crossed. It reads only
`WorldNavigation` (each map's baked navigation grid and anchors, plus the links, built once from the map prefabs), so
it answers for maps that aren't loaded. `At(minute)` gives the segment, `PositionAt(minute)` the feet position in that
map's local space.

- A walk takes the shortest chain of links by walking distance. Links within one map are ignored.
- A link is used at the walkable tile nearest the middle of its trigger, among those the trigger covers or borders.
  Walking resumes at the link's arrival anchor; crossing takes no time.
- A walk that is still going at the next departure sets off again on arrival.
- A goal with no walkable route is reached as soon as she sets off, with a warning in `Warnings`.

The service doesn't use the timetable yet; placing characters from it on any map is STO-86.

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

`RoutineNpcService` places routine characters when a location is entered and
removes them when it is left. It plans every enabled routine when it starts,
when a game is started or loaded (`GameState.Restored`) and at each
`NewDayEvent`. Overnight the player returns home before the new day begins,
so the new day also re-places the characters in the current location, behind
the overnight blackout. On entering a location it asks each plan where its
character is now:

- At home before the first departure; at a goal's destination once the
  route there is walked, with the goal's activity playing; or partway along
  the route. Walking distance is the time since departure times
  `secondsPerInGameMinute` times the character's walk speed, measured with
  `CharacterNavigation.PlanRoute`.
- A character is spawned only if that place is on the entered map, from the
  character's spawnable prefab (the same lookup as `characters.spawn`), and is
  never saved: the plan and the clock place them again after loading.
- Travel between maps isn't built yet: a character who sets off for another
  map is at the destination at once.
- Departures must fall within the clock's day (`startOfDay`-`endOfDay`).
- A character with a routine must not also be placed on a map; catalog
  validation reports it.

While the location stays loaded, the service also moves characters through
the rest of their day:

- When a goal's departure time comes, the current activity's end plays first
  (activity animations), then the character walks to the destination with
  `CharacterNavigation.NavigateTo` and starts that goal's activity there. A
  character placed partway along a route keeps walking.
- If the clock jumps past several departures, the character heads straight
  for the latest one.
- If walking stops on the way (no route, or something blocks a segment), the
  character is placed at the destination with a warning, like an NPC catching
  up off-screen.
- A character setting off for another map leaves this one at once.

Not yet built: interruptions (talking, cutscenes), travel between maps and
authoring routines in Vulcanus.
