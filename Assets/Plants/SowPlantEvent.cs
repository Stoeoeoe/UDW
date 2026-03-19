using Core.Game;
using Core.Location;
using MoreMountains.Tools;
using UnityEngine;

namespace Plants
{
    public struct SowPlantEvent
    {
        public string PlantId;
        public Vector2Int Position;
        public string LocationId;
        
        static SowPlantEvent e;
        
        /// <summary>
        /// Triggers a SowPlantEvent informing listeners that a plant has been sown at the specified position.
        /// If locationId is not provided, it defaults to the current location.
        /// </summary>
        /// <param name="position"></param>
        /// <param name="plantId"></param>
        /// <param name="locationId"></param>
        public static void Trigger(Vector2Int position, string plantId, string locationId = null)
        {
            e.PlantId = plantId;
            e.Position = position;
            locationId ??= (UrLevelManager.Current as UrLevelManager)!.CurrentLocationData.id;
            
            e.LocationId = locationId;
            MMEventManager.TriggerEvent(e);
        }
    }
}