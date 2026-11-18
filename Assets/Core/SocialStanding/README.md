# Social standing

How much a subject thinks of the player, from 0 (lowest) to 100. A subject is anything with a lowercase namespaced ID:
a character (`base:fabia`), a village (`base:village`) or any other entity. There is no definition for a village; its ID is
just used.

- **Starting value.** A subject that has never changed stands at its starting value: a character's
  `StartingSocialStanding` (authored in Vulcanus as `startingSocialStanding`, 0 to 100, default 50), otherwise 50.
- **Saved state.** `GameState.SocialStanding` holds only the standings that have changed, in the save's
  `socialStanding` section. The service reads it on every call, so loading a save is picked up. A save is rejected if a
  subject ID isn't a lowercase `namespace:name` or a standing is outside 0 to 100.
- **`SocialStandingService`.** `Get`, `HasMoreThan`, `HasLessThan`, and `Increase` / `Decrease` by a non-negative amount.
  Changes stop at 0 and 100 and return the new standing. A bad subject ID or a negative amount throws.
- **Event.** `SocialStandingChangedEvent` (subject, previous, new) is raised on the `EventBus` when a standing actually
  changes. A change that leaves it where it was, such as raising a standing already at 100, raises nothing.
- **Lua.** The `SocialStanding` module: `Get`, `HasMoreThan`, `HasLessThan` (read-only, usable in conditions) and
  `Increase`, `Decrease` (whole, non-negative amounts; they change state, so not in conditions).

```lua
if SocialStanding.HasMoreThan("base:village", 70) then
  SocialStanding.Increase("base:fabia", 5)
end
```
