# Service composition

`Assets/VContainerSettings.asset`, included in Player Settings' preloaded assets,
assigns `Assets/Resources/SystemRoot.prefab` as VContainer's project root.
VContainer creates and persists it; scenes do not contain their own copies.
There is no custom bootstrapper or static SystemRoot instance.

`GameServices.Register` declares constructor-injected session services. Crop
simulation/harvesting, item drops, player initialization, the main-character
registry, save coordination and favour are ordinary C# objects. They do not
have Unity lifecycle callbacks. VContainer owns their lifetimes and disposes
crop/favour subscriptions when the session ends. The root resolves those
subscriptions before the first overnight transition.

Per-frame services declare VContainer's interfaces instead of owning a
GameObject. `GameClock` (calendar progression, `IStartable`/`ITickable`) and
`PlayerInteractionContext` (interaction snapshots, `ILateTickable`) are
registered in `GameServices` and driven by the scope's entry-point dispatcher.
The clock reports changes through its events and `EventBus` notifications;
weather reacts to it, not the other way round. `OvernightTransition` is the
Unity component that plays the overnight fade, movement and audio, and it holds
the clock while it runs. The registered player is `CharacterManager.MainCharacter`;
consumers inject it rather than searching the scene. `LevelManager` spawns the player
from its prefab and registers it immediately. `VulcanusDialogueRunner` is a plain
service: it walks the dialogue graph as a cancellable awaitable, reads dialogues from the
discovered `DialogueCatalog`, and talks to the on-screen dialogue through `IDialoguePresenter`,
which `SystemRoot` registers from the root prefab. The screen reports `Dismissed` rather than
calling the runner, so the two never depend on each other. There are no static instances.

Player loadout/home settings, item magnet/drop/sound settings and calendar rules
(`ClockSettings`) are serialized groups on the single root Inspector. They are injected into services, not
stored on manager GameObjects. Required home and drop configuration is checked
when the services are constructed.

Catalog defaults are discovered through `[DefaultCatalog]` reflection. An
explicit registration supplied before defaults takes precedence; tests can
supply a catalog directly without modifying a built container. Missing required
catalogs fail during composition. Catalog assets are shared authored data;
`GameState` and mod-added skill/deity registries belong to the scope. Loading a
save replaces the existing saved root and rebinds favour to it, preserving the
save contract.

Unity components remain for scene loading/spawning, coroutines, input, rendering,
audio and UI. SystemRoot wires these authored components before Unity callbacks.
Consumers use constructor dependencies for C# services and `[Inject]` on Unity
components. New game rules should not acquire a GameObject just to participate
in dependency injection.

Imported maps receive `GameSceneScope` from the Vulcanus map importer. This
child scope inherits the configured project root and injects scene components
before their normal Awake/OnEnable calls.
Create runtime prefabs with the injected `IObjectResolver.Instantiate` at spawn
boundaries. For procedural objects, create them inactive, inject their hierarchy,
then bind and activate them. Unity's plain Instantiate/AddComponent does not
automatically inject dependencies.

LevelManager coordinates location entry/exit. SystemRoot connects enabled
`GameManager` components implementing `ILocationLifecycle` to that coordinator.
`LocationContext` holds the current location and readiness for readers, avoiding
reverse dependencies on the loading coordinator. The clock supplies season and
daylight progress to WeatherManager; UI and pointer changes use existing events.

Tests use an isolated `GameTestFixture` scope; see
[TEST_FIXTURES.md](../Assets/Core/Common/Editor/TEST_FIXTURES.md).
