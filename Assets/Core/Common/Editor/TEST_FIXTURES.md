# EditMode singleton fixtures

Use `GameTestFixture` when a test needs game managers. Add dependencies explicitly
in their initialization order; configure component references before `Awake`.

```csharp
using var game = new GameTestFixture("Shop tests");
var state = game.AddSingleton<GameStateManager>();
var items = game.AddSingleton<ItemManager>(manager => SetDropPrefab(manager, prefab));
```

Each manager has an inactive child object so Unity does not start scene gameplay.
The fixture invokes `Awake` and `OnEnable`, handling both Core and More Mountains
singleton registration in EditMode. It does not invoke `Start`, discover dependencies,
or supply missing configuration. Existing live singletons cause a setup failure.

Disposal runs `OnDisable` and `OnDestroy` in reverse registration order, clears
singleton state, and destroys owned objects. Use `Own` for temporary assets that
must remain alive until managers finish teardown.

`RegisterSingleton` deliberately omits initialization. Use it for isolated location
provider or late-registration tests, where running scene discovery is outside the
test's scope. Ordinary manager tests use `AddSingleton`.

Plain components and pure C# tests do not need a manager fixture. PlayMode tests
use Unity's real scene lifecycle rather than this EditMode fixture.
