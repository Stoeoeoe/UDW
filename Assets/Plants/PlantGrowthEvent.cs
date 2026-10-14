using Core.Events;
using UnityEngine;

namespace Plants
{
    /// <summary>Announces a saved crop's growth-stage change after the daily update has committed.</summary>
    public struct PlantGrowthEvent
    {
        public string LocationId;
        public Vector2Int Position;
        public int NewStageIndex;

        public static void Trigger(string locationId, Vector2Int position, int newStageIndex)
            => EventBus<PlantGrowthEvent>.Raise(new PlantGrowthEvent
            {
                LocationId    = locationId,
                Position      = position,
                NewStageIndex = newStageIndex,
            });
    }
}
