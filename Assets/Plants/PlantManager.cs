using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Core.Events;
using Core.Game;
using Core.Inventory;
using Core.Items;
using Core.Location;
using Core.Tile;
using Core.TimeAndWeather;
using UnityEngine;

namespace Plants
{
    /// <summary>
    /// Coordinates saved crops across all locations: daily updates, sowing and harvesting.
    /// PlantState owns growth rules; FarmablePlant presents the state in the loaded map.
    /// </summary>
    public sealed class PlantManager : IDisposable,
        IEventListener<NewDayEvent>
    {
        private readonly ItemManager _items;
        private readonly GameState _gameState;
        private readonly LocationContext _locationContext;

        private const string PlantObjectPrefix = "plant:";

        private readonly PlantCatalog _catalog;

        public PlantManager(GameState state, PlantCatalog catalog, LocationContext location, ItemManager items)
        {
            _gameState = state;
            _catalog = catalog;
            _locationContext = location;
            _items = items;
            this.Subscribe<NewDayEvent>();
        }

        public void Dispose() => this.Unsubscribe<NewDayEvent>();

        /// <summary>Looks up an enabled plant definition in the shared catalog.</summary>
        public bool TryGetPlantData(string id, out PlantData data)
        {
            data = _catalog.Get(id);
            return data;
        }

        /// <summary>Advances saved crops, consumes irrigation and then publishes the daily changes.</summary>
        public void OnEvent(NewDayEvent e)
        {
            var growthEvents = new List<PlantGrowthEvent>();
            var conditionEvents = new List<PlantConditionChangedEvent>();
            var removalEvents = new List<PlantRemovedEvent>();
            var dryEvents = new List<FarmlandDriedEvent>();

            // Crops use yesterday's irrigation before farmland dries. Publish only after all state changes.
            AdvanceCrops(growthEvents, conditionEvents, removalEvents);
            DryFarmland(dryEvents);
            PublishChanges(dryEvents, growthEvents, conditionEvents, removalEvents);
        }

        private void AdvanceCrops(List<PlantGrowthEvent> growthEvents,
            List<PlantConditionChangedEvent> conditionEvents, List<PlantRemovedEvent> removalEvents)
        {
            // Snapshot the entries because wilted-crop removal changes that store during iteration.
            foreach (var entry in _gameState.World.GetStates<PlantState>().ToArray())
            {
                var state = entry.State;
                if (!TryGetPlantData(state.plantID, out var data)) continue;

                var position = ParsePlantObjectId(entry.ObjectId);
                var wasWatered = IsFarmlandIrrigated(entry.LocationId, position);
                var previousStage = data.GetGrowthStageIndexByDays(state.daysPassedSincePlanting);
                var previousCondition = state.condition;

                state.AdvanceDay(definition: data, currentSeason: _gameState.Time.season, wasWatered: wasWatered);
                if (RemoveExpiredCrop(entry, position, data, removalEvents)) continue;

                RecordCropChanges(entry, position, data, previousStage, previousCondition, growthEvents, conditionEvents);
            }
        }

        private bool IsFarmlandIrrigated(string locationId, Vector2Int position) =>
            _gameState.World.TryGet<FarmlandState>(locationId ?? WorldState.Global,
                MapManager.FarmlandObjectId(position), out var land) && land.plowed && land.irrigated;

        private bool RemoveExpiredCrop(WorldStateEntry<PlantState> entry, Vector2Int position,
            PlantData data, List<PlantRemovedEvent> removalEvents)
        {
            var state = entry.State;
            if (state.condition != PlantCondition.Wilted || state.daysSinceWilted < data.DaysWiltedUntilRemoval)
                return false;

            _gameState.World.Remove(entry.LocationId ?? WorldState.Global, entry.ObjectId);
            removalEvents.Add(new PlantRemovedEvent { LocationId = entry.LocationId, Position = position, State = state });
            return true;
        }

        private static void RecordCropChanges(WorldStateEntry<PlantState> entry, Vector2Int position,
            PlantData data, int previousStage, PlantCondition previousCondition,
            List<PlantGrowthEvent> growthEvents, List<PlantConditionChangedEvent> conditionEvents)
        {
            var state = entry.State;
            var newStageIndex = data.GetGrowthStageIndexByDays(state.daysPassedSincePlanting);
            if (newStageIndex != previousStage)
                growthEvents.Add(new PlantGrowthEvent
                {
                    LocationId = entry.LocationId, Position = position, NewStageIndex = newStageIndex
                });
            if (state.condition != previousCondition)
                conditionEvents.Add(new PlantConditionChangedEvent
                {
                    LocationId = entry.LocationId, Position = position,
                    PreviousCondition = previousCondition, Condition = state.condition
                });
        }

        private void DryFarmland(List<FarmlandDriedEvent> dryEvents)
        {
            foreach (var entry in _gameState.World.GetStates<FarmlandState>().ToArray())
            {
                if (!entry.State.irrigated) continue;
                entry.State.irrigated = false;
                // Empty/unplowed records need no saved override once dry.
                if (!entry.State.plowed)
                    _gameState.World.Remove(entry.LocationId ?? WorldState.Global, entry.ObjectId);
                dryEvents.Add(new FarmlandDriedEvent
                {
                    LocationId = entry.LocationId, ObjectId = entry.ObjectId
                });
            }
        }

        private static void PublishChanges(List<FarmlandDriedEvent> dryEvents,
            List<PlantGrowthEvent> growthEvents, List<PlantConditionChangedEvent> conditionEvents,
            List<PlantRemovedEvent> removalEvents)
        {
            foreach (var dry in dryEvents) EventBus<FarmlandDriedEvent>.Raise(dry);
            foreach (var growth in growthEvents) EventBus<PlantGrowthEvent>.Raise(growth);
            foreach (var change in conditionEvents) EventBus<PlantConditionChangedEvent>.Raise(change);
            foreach (var removal in removalEvents) EventBus<PlantRemovedEvent>.Raise(removal);
        }

        /// <summary>Enumerates live saved crops for rebuilding a location's plant views.</summary>
        public IEnumerable<KeyValuePair<Vector2Int, PlantState>> GetPlantStatesInLocation(string locationId)
        {
            foreach (var pair in _gameState.World.GetStates<PlantState>(locationId))
                yield return new KeyValuePair<Vector2Int, PlantState>(ParsePlantObjectId(pair.Key), pair.Value);
        }

        /// <summary>Returns the live saved crop at a tile, or null when the tile has no crop.</summary>
        public PlantState GetPlantState(string locationId, Vector2Int position)
        {
            return _gameState.World.TryGet<PlantState>(locationId, PlantObjectId(position), out var state)
                ? state
                : null;
        }

        /// <summary>Checks crop health, growth stage and harvest method, without checking inventory space.</summary>
        public bool CanHarvest(string locationId, Vector2Int position, HarvestMethod method)
        {
            var state = GetPlantState(locationId, position);
            return state != null && state.condition == PlantCondition.Healthy &&
                TryGetPlantData(state.plantID, out var data) && data.TryGetHarvestStage(state.daysPassedSincePlanting, method, out _);
        }

        /// <summary>Checks that a healthy crop has a later growth stage to move to.</summary>
        public bool CanAdvanceGrowthStage(string locationId, Vector2Int position) =>
            CanAdvanceGrowthStage(GetPlantState(locationId, position));

        /// <summary>Same check for an already looked-up crop; null means there is no crop.</summary>
        public bool CanAdvanceGrowthStage(PlantState state) =>
            state != null && state.condition == PlantCondition.Healthy &&
            TryGetPlantData(state.plantID, out var data) &&
            data.GetGrowthStageIndexByDays(state.daysPassedSincePlanting) < data.GrowthStages.Count - 1;

        /// <summary>Moves a healthy crop to the start of its next growth stage; false when it is wilted or fully grown.</summary>
        public bool TryAdvanceGrowthStage(string locationId, Vector2Int position)
        {
            var state = GetPlantState(locationId, position);
            if (!CanAdvanceGrowthStage(state)) return false;
            TryGetPlantData(state.plantID, out var data);
            var next = data.GetGrowthStageIndexByDays(state.daysPassedSincePlanting) + 1;
            state.daysPassedSincePlanting = data.GrowthStages[next].DaysToReachStage;
            PlantGrowthEvent.Trigger(locationId, position, next);
            return true;
        }

        /// <summary>Removes a wilted crop without producing items; returns false for other tiles.</summary>
        public bool TryClearWilted(string locationId, Vector2Int position)
        {
            var state = GetPlantState(locationId, position);
            if (state == null || state.condition != PlantCondition.Wilted) return false;
            _gameState.World.Remove(locationId, PlantObjectId(position));
            EventBus<PlantRemovedEvent>.Raise(new PlantRemovedEvent { LocationId = locationId, Position = position, State = state });
            return true;
        }

        /// <summary>Picks a ready crop if its entire yield fits in the supplied inventory.</summary>
        public bool TryHarvest(string locationId, Vector2Int position, HarvestMethod method, SlotInventory inventory)
        {
            // Picking delivers to inventory. Scythe harvesting uses a world drop instead.
            if (method != HarvestMethod.Picking || !CanHarvest(locationId, position, method)) return false;
            var state = GetPlantState(locationId, position);
            TryGetPlantData(state.plantID, out var data);
            var quantity = data.RollHarvestQuantity();
            // Prepare without changing slots, so a full bag leaves the crop and inventory untouched.
            if (!inventory.Storage.TryPrepareAddition(data.HarvestItem, quantity, out var slots)) return false;
            inventory.Storage.CommitContent(slots);
            var harvest = CommitHarvest(locationId, position, state, data, quantity);
            // Listeners see both the delivered items and the crop's final state.
            PlantHarvestedEvent.Trigger(harvest);
            InventoryChangedEvent.Trigger(inventory);
            return true;
        }

        /// <summary>Harvests a scythe-ready crop into a world drop, without requiring inventory space.</summary>
        public bool TryHarvestWithScythe(string locationId, Vector2Int position, Vector3 worldPosition, out WorldItem drop)
        {
            // TODO: Persist uncollected drops if ground items need to survive location changes/save-load.
            drop = null;
            if (!CanHarvest(locationId, position, HarvestMethod.Scythe)) return false;
            var state = GetPlantState(locationId, position);
            TryGetPlantData(state.plantID, out var data);
            var quantity = data.RollHarvestQuantity();
            drop = _items.PrepareDrop(data.HarvestItem, quantity, worldPosition);
            var harvest = CommitHarvest(locationId, position, state, data, quantity);
            // Activate only after updating the crop; drop activation can invoke gameplay callbacks.
            drop.gameObject.SetActive(true);
            PlantHarvestedEvent.Trigger(harvest);
            return true;
        }

        private PlantHarvestedEvent CommitHarvest(string locationId, Vector2Int position, PlantState state, PlantData data, int quantity)
        {
            // Single-harvest crops disappear; regrowing crops return to the configured stage.
            // Return the event without publishing it so the caller can finish delivering the yield first.
            var removed = data.RegrowthStageIndex < 0;
            if (removed) _gameState.World.Remove(locationId, PlantObjectId(position));
            else state.daysPassedSincePlanting = data.GrowthStages[data.RegrowthStageIndex].DaysToReachStage;
            return new PlantHarvestedEvent
            {
                LocationId = locationId, Position = position, PlantId = state.plantID,
                ItemId = data.HarvestItem.ItemId, Quantity = quantity, Method = data.HarvestMethod,
                Removed = removed, NewStageIndex = removed ? -1 : data.RegrowthStageIndex, State = state
            };
        }

        /// <summary>Sows directly on the current map without consuming a seed; occupied crop tiles are unchanged.</summary>
        public void SowPlantOnCurrentMap(Vector2Int position, string plantId)
        {
            string locationId = _locationContext.Location.id;
            SowPlantOnMap(locationId, position, plantId);
        }

        /// <summary>Consumes one carried seed and sows it on an empty, plowed tile when planting is allowed.</summary>
        public bool TrySowCarriedSeed(string locationId, TileData tile, SlotInventory inventory, int slotIndex)
        {
            if (string.IsNullOrEmpty(locationId) || tile?.FarmlandData is not { IsPlowed: true } ||
                tile.PlacedObject || slotIndex < 0 || slotIndex >= inventory.Capacity ||
                inventory.GetSlot(slotIndex).Item is not SeedItem seed ||
                !TryGetPlantData(seed.PlantData.plantId, out _) ||
                HasPlantAt(locationId, tile.Coordinates)) return false;
            var stack = inventory.GetSlot(slotIndex);
            var remaining = stack.Quantity > 1 ? new ItemStack(seed, stack.Quantity - 1) : ItemStack.Empty;
            inventory.Storage.SetSlot(slotIndex, remaining);
            // Both live states are complete before a listener can move inventory or start a transition.
            _gameState.World.Set(locationId, PlantObjectId(tile.Coordinates), new PlantState(seed.PlantData.plantId));
            var sow = new SowPlantEvent { Position = tile.Coordinates, PlantId = seed.PlantData.plantId, LocationId = locationId };
            EventBus<SowPlantEvent>.Raise(sow);
            InventoryChangedEvent.Trigger(inventory);
            return true;
        }

        private void SowPlantOnMap(string locationId, Vector2Int position, string plantId)
        {
            var objectId = PlantObjectId(position);
            if (_gameState.World.TryGet<PlantState>(locationId, objectId, out _)) return;

            _gameState.World.Set(locationId, objectId, new PlantState(plantId));
            SowPlantEvent.Trigger(position, plantId, locationId);
        }

        /// <summary>Checks for a saved crop at the tile, including wilted crops.</summary>
        public bool HasPlantAt(string locationId, Vector2Int position)
        {
            return _gameState.World.TryGet<PlantState>(locationId, PlantObjectId(position), out _);
        }

        /// <summary>Checks for a saved crop at the tile in the current location.</summary>
        public bool HasPlantAtCurrentMap(Vector2Int position)
        {
            string locationId = _locationContext.Location.id;
            return HasPlantAt(locationId, position);
        }

        // Coordinates form the key within a location's save bucket; the prefix separates crops from farmland.
        private static string PlantObjectId(Vector2Int position) =>
            PlantObjectPrefix + position.x.ToString(CultureInfo.InvariantCulture) + "," +
            position.y.ToString(CultureInfo.InvariantCulture);

        private static Vector2Int ParsePlantObjectId(string objectId)
        {
            if (!objectId.StartsWith(PlantObjectPrefix, StringComparison.Ordinal))
                throw new FormatException($"Invalid plant object ID '{objectId}'.");

            var parts = objectId.Substring(PlantObjectPrefix.Length).Split(',');
            if (parts.Length != 2 ||
                !int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var x) ||
                !int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var y))
                throw new FormatException($"Invalid plant object ID '{objectId}'.");

            return new Vector2Int(x, y);
        }
    }
}
