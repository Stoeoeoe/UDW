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
random pick is deterministic: the same playthrough, character and day always
choose the same member, so loading a save mid-day rebuilds the same plan. The
playthrough's seed (`GameState.Seed`, chosen when a new game is created and
kept in the save) makes each playthrough choose differently.

`new RoutinePlanner(luaEngine, seed).PlanDay(routine, daysSinceStart)` returns that
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
- A goal with no walkable route is reached as soon as the character sets off, with a warning in `Warnings`.
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

## What the character is busy with

A goal can set an `occupation` tag (such as `fishing`; lowercase letters, digits, `_ . -`) for what the character does
once arrived. It is derived from the timetable and the clock, so nothing is saved. `RoutineTimetable.OccupationAt` gives
it: null while walking, before the first goal, or when the goal sets none. Lua reads it through the `Routines` module:
`Routines.Occupation(characterId)` and `Routines.HasOccupation(characterId, occupation)`, both usable in conditions.
A character without a routine is busy with nothing.

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
walk speed from the character's definition; boons only change how fast the character walks in sight.

On entering a location, every character whose timetable has them on its map now is placed where it says: at their place
with its activity, or partway along a walk, walking on. Characters are spawned from their spawnable prefab (the same
lookup as `characters.spawn`) and never saved: the timetable and the clock place them again after loading. A character
with a routine must not also be placed on a map; catalog validation reports it. Departures must fall within the
clock's day (`startOfDay`-`endOfDay`).

While the location stays loaded, the characters on it live through their timetable:

- When a stay ends, its activity's end plays first (activity animations), then the character walks the next segment with
  `CharacterNavigation.NavigateTo`. A walk that ends at a goal starts that goal's stay and activity.
- A walk that ends at a door: the character walks to the door's tile and fades out. They aren't brought back to this
  map until their timetable has moved past that walk, even if they got to the door early.
- When a character's timetable brings them onto the map, usually through a door, they fade in where it puts them (the arrival
  anchor, or further along if the clock jumped) and walks on.
- Live walking can run ahead of or behind the timetable. Arriving late, the character sets off again at once if
  their next departure has passed; after the clock jumps, they head for where the timetable has reached.
- If walking stops on the way (no route, or something blocks a segment), the character is placed at the end of the walk with a
  warning, like an NPC catching up off-screen.
- While the game clock is paused (every dialogue, menus that pause it, cutscenes), routine characters stand still
  and walk on when it runs again.
- After someone talks to a routine character, they stay put for `RoutineSettings.pauseAfterTalkingSeconds` (real
  seconds, 3 by default) while the clock runs, so they fall behind their timetable. Once conversations have held them
  up `maxDelayMinutes` (20 in-game minutes by default), they move on and can't be talked to
  (`ShowVulcanusDialogueInteractable.Busy`) until they catch up. Reaching a place before the stay there ends clears
  the delay, and they can be talked to again; they still leave at the scheduled time. Delays aren't saved, and
  re-entering the map places them where their timetable says. Both settings are on the `SystemRoot` prefab.
- Only the player uses location links by walking into them; characters change maps only through their timetable.

Not yet built: cutscenes that take over a routine character and hand them back (STO-68).
