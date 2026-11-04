# EditMode game tests

Inherit `ServiceTest` for session rules and inventory tests. It builds the C#
registrations without instantiating SystemRoot or running scene callbacks.
Inherit `GameTest` when testing Unity integration such as character animation,
weather presentation or scene transitions. Both expose a lazy `Game` property
and clean up after each test. Tests without dependencies should construct their
subjects directly, including Lua metadata tests.

```csharp
public sealed class CropTests : ServiceTest
{
    [Test]
    public void CropGrows()
    {
        var crop = Game.Asset<PlantData>();
        // Configure the authored definition before registering it.
        Game.Catalog<PlantCatalog>(crop);
        var plants = Game.Get<PlantManager>();
        // Exercise growth and assert the resulting saved state.
    }
}
```

The container uses the production service registrations and authored settings. Replace
catalogs with `Game.Catalog<T>(definitions)` or other dependencies with
`Game.Use(instance)` before the first service resolution. Tests do not register
their manager's dependency graph. `Game.State` is ready to use.

`Game.Get<T>()` resolves a ready C# service; its container owns disposal.
`Game.Clock` and `Game.Characters` are shortcuts for the calendar and player registry.
Frame-driven services (`GameClock`, `PlayerInteractionContext`) are ordinary objects
whose `ITickable`/`ILateTickable` callbacks are driven by the real scope's
dispatcher; the test container has none, so tests call them directly
(`Game.Clock.Advance(seconds)`, `context.Refresh()`) and never simulate Unity
lifecycle for them. Prefer `ServiceTest` for such services.

In Unity integration tests, `Game.Start<T>(configure)` (now needed only for Unity-bound components such as the GUI, input, weather and map managers) invokes a component's
`Awake` and `OnEnable` callbacks when the tested behavior needs them.
Other components remain inactive. This does not
invoke Unity's `Start` callback. `RegisterManager` is reserved for tests of
registration or a vendor component's lifecycle.

`Game.Asset<T>()` owns a temporary ScriptableObject. `Game.Create<T>()` creates
an inactive, injected component; `Game.Add<T>(gameObject)` adds an injected component to
an object the test owns; `Game.Instantiate(prefab)` creates an injected prefab instance.
EditMode does not run `Awake`/`OnEnable` for these: `Game.Wake(components)` runs both on the
given components, and `Game.Wake(gameObject)` on every component of an object, parents first. `Game.Inventory(state, resolver)` binds an owned inventory to
the state under test. Use `Game.CreatePlayer()` for the authored character
registered as the session's player (what interactables, cutscenes, the camera and
UI treat as the player), `Game.CreateCharacter()` for any other actor, or
`Game.CreateAnimatedCharacter()` when exercising animation.
`Game.Location` and `Game.Ready` establish the current location context.

Tests set serialized private fields and call private methods through
`using static Core.Common.Editor.Reflect;`: `Set(target, "field", value)`, `Get<T>(target, "field")`
and `Call(target, "Method", args)` (exceptions are rethrown unwrapped). Never write a per-file
reflection helper. Internal members are visible to the test assembly, so call them directly.
`Game.Location` and `Game.Ready` assign the location context without reflection.

`Game.Bind(modules)` and `Game.BindSequence(...)` inject Lua APIs and attach the
fixture's runtime. For dependency-free APIs, construct `LuaBindingRegistry`
directly. `Game.Inject(value)` supports manually constructed consumers.

The fixture releases character subscriptions and started managers before
disposing the container and destroying its objects and assets. Use `Game.Own`
for additional temporary assets that must survive until service teardown.
Only test-specific external subscriptions or resources need their own teardown.
More Mountains components retain their package's singleton lifecycle contract.

PlayMode tests use Unity's real scene lifecycle instead of this EditMode fixture. Their
Editor-folder integration tests read the running game's services through `LiveGame.Get<T>()`
and `LiveGame.Player`; production code never uses that helper.
