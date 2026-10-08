using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Core.Catalogs;
using Core.Events;
using Core.Game;
using Core.Location;
using Core.TimeAndWeather;
using Core.Tile;
using MoreMountains.Tools;
using UnityEngine;

namespace Plants
{
    public class PlantManager : MMSingleton<PlantManager>,
        IEventListener<NewDayEvent>
    {
        private const string PlantObjectPrefix = "plant:";

        private PlantCatalog _catalog;

        public bool TryGetPlantData(string id, out PlantData data)
        {
            data = _catalog ? _catalog.Get(id) : null;
            return data;
        }

        protected override void Awake()
        {
            base.Awake();
            _catalog = CatalogResources.Load<PlantCatalog>(PlantCatalog.ResourceName);
            if (!_catalog) throw new InvalidOperationException("The default PlantCatalog is missing. Refresh catalogs in the editor.");
        }

        protected void OnEnable() => this.Subscribe<NewDayEvent>();
        protected void OnDisable() => this.Unsubscribe<NewDayEvent>();

        public void OnEvent(NewDayEvent e)
        {
            var growthEvents = new List<PlantGrowthEvent>();
            var conditionEvents = new List<PlantConditionChangedEvent>();
            var dryEvents = new List<FarmlandDriedEvent>();
            // One owner consumes yesterday's irrigation before drying every location.
            // Commit the whole daily update before callbacks can mutate the live store.
            foreach (var entry in GameState.World.GetStates<PlantState>().ToArray())
            {
                var state = entry.State;
                if (state.condition != PlantCondition.Healthy || !TryGetPlantData(state.plantID, out var data)) continue;

                var position = ParsePlantObjectId(entry.ObjectId);
                var irrigated = GameState.World.TryGet<FarmlandState>(entry.LocationId ?? WorldState.Global,
                    MapManager.FarmlandObjectId(position), out var land) && land.plowed && land.irrigated;
                var oldStageIndex = data.GetGrowthStageIndexByDays(state.daysPassedSincePlanting);
                var previousCondition = state.condition;
                state.AdvanceDay(irrigated, data.DaysWithoutWaterUntilWilt);
                var newStageIndex = data.GetGrowthStageIndexByDays(state.daysPassedSincePlanting);
                if (newStageIndex != oldStageIndex)
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

            foreach (var entry in GameState.World.GetStates<FarmlandState>().ToArray())
            {
                if (!entry.State.irrigated) continue;
                entry.State.irrigated = false;
                // Empty/unplowed records need no saved override once dry.
                if (!entry.State.plowed)
                    GameState.World.Remove(entry.LocationId ?? WorldState.Global, entry.ObjectId);
                dryEvents.Add(new FarmlandDriedEvent
                {
                    LocationId = entry.LocationId, ObjectId = entry.ObjectId
                });
            }

            foreach (var dry in dryEvents) EventBus<FarmlandDriedEvent>.Raise(dry);
            foreach (var growth in growthEvents) EventBus<PlantGrowthEvent>.Raise(growth);
            foreach (var change in conditionEvents) EventBus<PlantConditionChangedEvent>.Raise(change);
        }

        public IEnumerable<KeyValuePair<Vector2Int, PlantState>> GetPlantStatesInLocation(string locationId)
        {
            foreach (var pair in GameState.World.GetStates<PlantState>(locationId))
                yield return new KeyValuePair<Vector2Int, PlantState>(ParsePlantObjectId(pair.Key), pair.Value);
        }

        public PlantState GetPlantState(string locationId, Vector2Int position)
        {
            return GameState.World.TryGet<PlantState>(locationId, PlantObjectId(position), out var state)
                ? state
                : null;
        }

        public void SowPlantOnCurrentMap(Vector2Int position, string plantId)
        {
            string locationId = LevelManager.Instance.CurrentLocationData.id;
            SowPlantOnMap(locationId, position, plantId);
        }

        private void SowPlantOnMap(string locationId, Vector2Int position, string plantId)
        {
            var objectId = PlantObjectId(position);
            if (GameState.World.TryGet<PlantState>(locationId, objectId, out _)) return;

            GameState.World.Set(locationId, objectId, new PlantState(plantId));
            SowPlantEvent.Trigger(position, plantId, locationId);
        }

        public bool HasPlantAt(string locationId, Vector2Int position)
        {
            return GameState.World.TryGet<PlantState>(locationId, PlantObjectId(position), out _);
        }

        public bool HasPlantAtCurrentMap(Vector2Int position)
        {
            string locationId = LevelManager.Instance.CurrentLocationData.id;
            return HasPlantAt(locationId, position);
        }

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
