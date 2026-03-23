using Core.Events;
using Core.Location;
using UnityEngine;

namespace Plants
{
    public struct SowPlantEvent
    {
        public string PlantId;
        public Vector2Int Position;
        public string LocationId;

        /// <summary>
        /// Triggers a SowPlantEvent informing listeners that a plant has been sown at the specified position.
        /// If locationId is not provided, it defaults to the current location.
        /// </summary>
        public static void Trigger(Vector2Int position, string plantId, string locationId = null)
        {
            locationId ??= LevelManager.Instance?.CurrentLocationData?.id;
            EventBus<SowPlantEvent>.Raise(new SowPlantEvent
            {
                PlantId    = plantId,
                Position   = position,
                LocationId = locationId,
            });
        }
    }
}