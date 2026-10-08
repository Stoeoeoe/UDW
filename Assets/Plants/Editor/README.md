# Farming and terrain tests

Run the `FarmingTerrain` category in Unity's Test Runner under **EditMode**, outside a game session. Tests cover crop definitions, saved crop state, daily farming updates, plant visuals, farmland, and map terrain.

The fixtures create temporary definitions, catalogs, managers, and tilemaps. They do not use authored scenes or edit Resources assets. Private serialized configuration and location providers are set through reflection so tests do not start the scene-loading pipeline.

Coverage includes cumulative growth thresholds; seed-stage requirements; sowing, duplicate prevention, and location isolation; daily growth in unloaded locations; missing/disabled plant definitions; callbacks that mutate world state; save serialization without asset references; plowing/watering/drying/unplowing; terrain metadata and farmland precedence; sparse cache rebuilds; translated/scaled grid centers; map bounds; inclusive Euclidean range; and restoring farmland records.

Regression fixes covered by these tests:

- Plowing initializes farmland even when the supplied farmable tile has no runtime farmland state yet.
- Watering unplowed tiles does not paint irrigation or save it.
- Unplowing removes irrigation from runtime state, the overlay, and the save record.
- Farmland restoration skips nonfarmable terrain and does not display irrigation without plowing.
- Sowing events for other locations do not spawn on the active map.
- Cached tile centers honor grid transforms and cell size.
- Daily growth snapshots the world enumeration before publishing callbacks that can mutate it; newly sown plants wait until the next daily update.

Current gameplay rules and limits observed during review:

- On `NewDayEvent`, crops grow only if their saved plot is plowed and irrigated. `daysPassedSincePlanting` counts growth days, so dry days do not advance stages. Season and harvestability do not affect this update.
- Dry days increase saved `consecutiveDaysWithoutWater`; a watered day resets it. At the crop definition's `Days Without Water Until Wilt` threshold (default five, minimum one), saved `condition` becomes `PlantCondition.Wilted`. Wilted plants remain occupied and never grow or revive through watering.
- Mature plants retain their final stage while watered growth days keep increasing; they can still wilt when left dry.
- `PlantManager` owns the entire daily update: consume the previous day's irrigation, advance growth/wilting, dry every saved plot (including unloaded locations and plots without crops), then publish events. A single owner ensures listener order cannot dry a plot before its crop reads irrigation. Repeated daily events still process another daily update.
- `MapManager` listens for `FarmlandDriedEvent` to clear loaded irrigation overlays and runtime farmland. It does not separately handle `NewDayEvent`. Watering performed by an event callback for the new day is preserved.
- `FarmablePlant` listens for `PlantConditionChangedEvent` and restores saved wilt state when loading. Crop definitions can supply an optional `Wilted Representation` sprite/prefab; without it, the current growth visual receives a brown tint.
- No automatic rain watering is wired here.
- A harvestable flag exists on growth stages, but harvesting/replanting is not implemented by these plant classes.
- Growth stages expect an ordered sequence starting at day zero. Visual spawning expects valid stage representations. Tests exercise wilt presentation, but do not validate every authored sprite/prefab or exercise the player action/inventory pipeline.

Validation during authoring: game and Editor/test assemblies compile against the project's Unity 6000.6.3f1 references. All 14 managed `FarmlandTests` and `PlantStateTests` cases pass when invoked outside the Editor. The full Unity EditMode run could not start because the project was already open and its Editor had no Pipeline connection; the remaining cases still need execution in Unity.

Crop condition is separate from growth stage: `PlantCondition.Healthy = 0` is the default; `Wilted = 1` is terminal. Add future conditions with stable explicit enum values and define their gameplay rules. Condition-change events capture both previous and new conditions after the daily state update commits.
