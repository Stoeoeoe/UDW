# Story values

`GameState.Story` is the saved global key/value store. Use it from game code,
dialogue actions and cutscene Lua blocks; conditions expose only reads.

Vulcanus exposes **Data** actions: Set Story Value (`story.set`) and Remove Story
Value (`story.remove`). These run immediately in setup, sequence and completion
phases of cutscene or NPC routine action sessions. The same methods remain
available to ordinary Lua scripts. The visual Set action accepts a boolean,
string (including empty strings), number or nested JSON object. Arrays and null
are rejected before playback.

```lua
GameState.Story.Set("met_blacksmith", true)
GameState.Story.Set("quest", { stage = 2, details = { accepted = true } })
local quest = GameState.Story.Get("quest")
quest.stage = 3
GameState.Story.Set("quest", quest)
```

```csharp
GameState.Story.Set("quests_completed", 3L);
long completed = GameState.Story.Get<long>("quests_completed");
bool exists = GameState.Story.Has("quests_completed");
bool found = GameState.Story.TryGet<long>("optional_quest_count", out var count);
GameState.Story.Remove("quests_completed");
```

Supported values are booleans, strings (including empty strings), `long`, finite
`double`, and nested `Dictionary<string, object>` data. Integer inputs are normalized
to `long`. Null, arbitrary objects, arrays, cycles and Lua metatables are rejected.
Keys and dictionary keys must be nonempty. Both writes and dictionary reads copy
their data. To persist dictionary edits, call `Set` again.

`Get` fails for missing keys. `TryGet` returns false only for a missing key; a
wrong requested type fails clearly. Existing keys cannot change between boolean,
string, numeric and object types without explicit removal. Numbers permit exact
conversions between `long` and `double`. Lua uses double numbers; a Lua number can
be read as a C# long only when integral and in range. C# longs outside
±9,007,199,254,740,991 fail when read into Lua to prevent precision loss.

For booleans, `Set(key, true)` and `Set(key, false)` both retain the key.
`Has` checks whether the key exists; `Get` reads its value. `Remove` deletes it.

Vulcanus **Data → Story Values** declares keys, types and descriptions in the
project's optional `storyValues` array. These are authoring metadata, separate from
Scripting's Lua API/context definitions. Declarations provide key completion and
warnings for undeclared literal keys or obvious literal type mismatches in Lua
and condition editors. Dynamic keys and expressions are not statically checked.
Visual Set Story Value actions use the type declared in Data and cannot change it
in the action. Declared longs accept whole integers only. Conflicting authored
action values block export until corrected. Undeclared keys retain an editable
type and an Add to Data button that saves the declaration and locks the type.
Declarations do not initialize values or restrict runtime keys. Initialize required
values explicitly in game setup before scripts read them.

All values persist directly in `GameSaveData.story`. No save migration or schema
version bump accompanies this prototype change.
