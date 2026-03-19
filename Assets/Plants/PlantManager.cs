using System.Collections.Generic;
using System.Linq;
using Core.Game;
using Core.Location;
using Items.Plants;
using MoreMountains.Tools;
using UnityEngine;

namespace Plants
{
    public class PlantManager : MMSingleton<PlantManager>
    {
        /// <summary>
        /// List of all plant states (seeds, saplings, grown plants) by Location ID and position.
        /// </summary>
        /// <returns></returns>
        protected Dictionary<string, Dictionary<Vector2Int, PlantState>> gamePlantStates = new();
        protected Dictionary<string, PlantData> plantData = new();
        
        public Dictionary<string, PlantData> PlantData => plantData;

        protected override void Awake()
        {
            base.Awake();
            plantData = Resources.LoadAll<PlantData>("Plants").ToDictionary(d => d.plantId);
        }

        public Dictionary<Vector2Int, PlantState> GetPlantStatesInLocation(string locationId)
        {
            if (gamePlantStates.ContainsKey(locationId))
            {
                return gamePlantStates[locationId];
            }

            return new Dictionary<Vector2Int, PlantState>();
        }

        public PlantState GetPlantState(string locationId, Vector2Int position)
        {
            if (gamePlantStates.ContainsKey(locationId) && gamePlantStates[locationId].ContainsKey(position))
            {
                return gamePlantStates[locationId][position];
            }

            return null;
        }

        public void SowPlantOnCurrentMap(Vector2Int position, string plantId)
        {
            string locationId = (UrLevelManager.Current as UrLevelManager)!.CurrentLocationData.id;
            SowPlantOnMap(locationId, position, plantId);
        }

        private void SowPlantOnMap(string locationId, Vector2Int position, string plantId)
        {
            if (!gamePlantStates.ContainsKey(locationId))
            {
                gamePlantStates[locationId] = new Dictionary<Vector2Int, PlantState>();
            }

            if (!gamePlantStates[locationId].ContainsKey(position))
            {
                gamePlantStates[locationId][position] = new PlantState(plantId);
            }
            SowPlantEvent.Trigger(position, plantId, locationId);
        }
        
        public bool HasPlantAt(string locationId, Vector2Int position)
        {
            return gamePlantStates.ContainsKey(locationId) && gamePlantStates[locationId].ContainsKey(position);
        }
        
        public bool HasPlantAtCurrentMap(Vector2Int position)
        {
            string locationId = (UrLevelManager.Current as UrLevelManager)!.CurrentLocationData.id;
            return HasPlantAt(locationId, position);
        }
    }
}