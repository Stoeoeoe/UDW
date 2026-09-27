using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Core.Events;
using Core.Game;
using Core.Location;
using Core.TimeAndWeather;
using MoreMountains.Tools;
using UnityEngine;

namespace Plants
{
    public class PlantManager : MMSingleton<PlantManager>,
        IEventListener<NewDayEvent>
    {
        private const string PlantObjectPrefix = "plant:";

        protected Dictionary<string, PlantData> plantData = new();

        public Dictionary<string, PlantData> PlantData => plantData;

        protected override void Awake()
        {
            base.Awake();
            plantData = Resources.LoadAll<PlantData>("Plants").ToDictionary(d => d.plantId);
        }

        protected void OnEnable() => this.Subscribe<NewDayEvent>();
        protected void OnDisable() => this.Unsubscribe<NewDayEvent>();

        public void OnEvent(NewDayEvent e)
        {
            foreach (var entry in GameState.World.GetStates<PlantState>())
            {
                var state = entry.State;
                if (!plantData.TryGetValue(state.plantID, out var data)) continue;

                var oldStageIndex = data.GetGrowthStageIndexByDays(state.daysPassedSincePlanting);
                state.daysPassedSincePlanting++;
                var newStageIndex = data.GetGrowthStageIndexByDays(state.daysPassedSincePlanting);
                if (newStageIndex != oldStageIndex)
                {
                    PlantGrowthEvent.Trigger(entry.LocationId, ParsePlantObjectId(entry.ObjectId), newStageIndex);
                }
            }
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
