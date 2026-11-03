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
In Unity integration tests, `Game.Start<T>(configure)` invokes a component's
`Awake` and `OnEnable` callbacks when the tested behavior needs them.
Other components remain inactive. This does not
invoke Unity's `Start` callback. `RegisterManager` is reserved for tests of
registration or a vendor component's lifecycle.

`Game.Asset<T>()` owns a temporary ScriptableObject. `Game.Create<T>()` creates
an inactive, injected component; `Game.Instantiate(prefab)` creates an injected
prefab instance. `Game.Inventory(state, resolver)` binds an owned inventory to
the state under test. Use `Game.CreateCharacter()` for the authored character
fixture, or `Game.CreateAnimatedCharacter()` when exercising animation.
`Game.Location` and `Game.Ready` establish the current location context.

`Game.Bind(modules)` and `Game.BindSequence(...)` inject Lua APIs and attach the
fixture's runtime. For dependency-free APIs, construct `LuaBindingRegistry`
directly. `Game.Inject(value)` supports manually constructed consumers.

The fixture releases character subscriptions and started managers before
disposing the container and destroying its objects and assets. Use `Game.Own`
for additional temporary assets that must survive until service teardown.
Only test-specific external subscriptions or resources need their own teardown.
More Mountains components retain their package's singleton lifecycle contract.

PlayMode tests use Unity's real scene lifecycle instead of this EditMode fixture.
