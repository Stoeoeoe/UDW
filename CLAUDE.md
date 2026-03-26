# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Architecture

### Singleton Managers

Core systems persist across scenes using `Core.Singleton<T>`:

- **`LevelManager`** (`Core/Location/`): Scene loading, player spawning, location transitions, manages lifecycle callbacks
- **`InputManager`** (`Input/`): Centralizes input handling
- **`CharacterManager`** (`Character/`): Manages all characters in current location
- **`MapManager`** (`Core/Tile/`): Grid-based tile data and navigation
- **`ItemManager`** (`Core/Items/`): Item instances, equipment, inventory
- **`PlayerStateManager`** (`Core/`): Persists player state across scenes

### Event Bus

Type-safe event system for decoupled communication (`Core/Events/EventBus.cs`):

```csharp
// Define event
public class MyEvent { ... }

// Subscribe
EventBus<MyEvent>.Subscribe(this);  // this must implement IEventListener<MyEvent>

// Implement listener
public void OnEvent(MyEvent e) { ... }

// Raise
EventBus<MyEvent>.Raise(new MyEvent { ... });
```

Listeners iterate backwards during dispatch—safe to unsubscribe during event.

**Common events:** `CharacterSpawnEvent`, `CharacterChangedTileEvent`, `InventoryChangedEvent`, `DialogueCancelledEvent`, `DayLightUpdateEvent`

## Character System

**`GameCharacter`** (`Character/GameCharacter.cs`) is inert—owns state (movement, condition, stamina, position) but **does not drive behavior**. Abilities drive everything.

**Abilities** extend `CharacterAbility` (`Character/Abilities/`):
- Get character reference in `Awake()`
- Read input from `InputManager.Instance`
- Query tile data via `CurrentTileData`, `TileDataInFront`, `TileDataInBack`
- Register with `LevelManager` for lifecycle via `OnEnable/OnDisable`
- Override `Tick()` for per-frame updates
- Character state accessed via `Character.MovementState`, `Character.ConditionState`

**Key types:**
- `MovementAbility`: Directional input and movement
- `CharacterPerformPrimaryActionAbility`: Triggers primary actions

## Interaction System

**Actions** extend `AbstractAction` with lifecycle: Prepare → Execute → Finish (or Failure).

Override these methods:
- `OnPrepare()`: Optional pre-execution setup
- `OnExecute()`: Main action logic
- `OnFinish()`: Cleanup after success
- `OnFailure()`: Cleanup after failure

**Types:**
- **`PrimaryAction`**: Non-tool actions (dialogue, planting, etc.) — registered in `ActionRegistry`
- **`UseToolAction`**: Tool-based actions (Hoe, WateringJar, Hammer) — registered in `ToolActionRegistry`

Tools have stamina costs via `Character.Stamina.Deplete()`.

## Location Lifecycle

Implement `ILocationLifecycle` for scene-specific setup:

```csharp
public void OnLocationEnter(LocationData location) { ... }  // Setup when scene loads
public void OnLocationLeave(LocationData location) { ... }  // Cleanup when scene unloads
```

Register with `LevelManager`:
```csharp
private void OnEnable() => LevelManager.Instance?.RegisterLifecycle(this);
private void OnDisable() => LevelManager.Instance?.UnregisterLifecycle(this);
```

`LevelManager` calls these in deterministic order:
1. Call `OnLocationLeave` on all components leaving the old scene
2. Load new scene
3. Spawn player character at spawn point
4. Call `OnLocationEnter` on all components in new scene

This replaced older event-based lifecycle (LocationInitializingEvent, etc.) to reduce race conditions.

## Code Organization

Key directories:
- `Character/Abilities/`: `CharacterAbility` subclasses
- `Character/GameCharacter.cs`: Base character class
- `Core/Location/`: `LevelManager`, `ILocationLifecycle`
- `Core/Events/`: `EventBus`, `IEventListener`
- `Core/Tile/`: `MapManager`, tile data
- `Core/Items/`: `ItemManager`, inventory
- `Interaction/`: Action base classes
- `Interaction/Tools/`: Tool actions (Hoe, WateringJar, etc.)
- `Input/`: `InputManager`
- `Plants/`: Plant/farming actions

## Extending the System

### Adding a New Ability

1. Create class in `Character/Abilities/` extending `CharacterAbility`
2. Override `Awake()` to grab character reference and cache properties
3. Implement `Tick()` to read `InputManager` and drive behavior
4. If scene-specific setup needed, implement `ILocationLifecycle` and register with `LevelManager`
5. Attach to character prefab

### Adding a New Tool Action

1. Create class in `Interaction/Tools/` extending `UseToolAction`
2. Override `OnExecute()` to implement tool behavior
3. Access tile data via `Character.CurrentTileData`, `Character.TileDataInFront`, `Character.TileDataInBack`
4. Deplete stamina via `Character.Stamina.Deplete(amount)` if needed
5. Create prefab and register in `ToolActionRegistry`

### Adding a New Primary Action

1. Create class in `Interaction/` extending `PrimaryAction`
2. Override `OnPrepare()`, `OnExecute()`, `OnFinish()` as needed
3. Use `EventBus<T>` to communicate state changes to other systems
4. Create prefab and register in `ActionRegistry`

### Handling Scene State

For any component that tracks scene-specific state:
1. Implement `ILocationLifecycle`
2. Register with `LevelManager` in `OnEnable/OnDisable`
3. Clean up references in `OnLocationLeave()`, re-acquire in `OnLocationEnter()`

This ensures deterministic setup order and prevents dangling references.

## Key Patterns & Conventions

- **State as enums**: `MovementState`, `ConditionState` (not strings or bools)
- **Tile navigation**: Query `MapManager` by `Vector2Int` coordinates, access `TileData` for properties
- **Action freezing**: Set `FreezeCharacterDuringAction = true` to immobilize character during action
- **Animation**: Use Animancer state machine (`UrCharacterAnimator`), bind animators in `OnLocationEnter`
- **Feedback**: Use MoreMountains.Feedbacks for action feedback chains (particles, sounds, etc.)
- **Serialization**: Use Odin Inspector attributes (`[FoldoutGroup]`, etc.) for organized inspectors
