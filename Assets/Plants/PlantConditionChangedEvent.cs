using UnityEngine;

namespace Plants
{
    /// <summary>Announces a saved crop's condition change so its view and interaction availability can refresh.</summary>
    public struct PlantConditionChangedEvent
    {
        public string LocationId;
        public Vector2Int Position;
        public PlantCondition PreviousCondition;
        public PlantCondition Condition;
    }
}
