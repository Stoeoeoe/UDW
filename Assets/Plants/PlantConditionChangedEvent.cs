using UnityEngine;

namespace Plants
{
    public struct PlantConditionChangedEvent
    {
        public string LocationId;
        public Vector2Int Position;
        public PlantCondition PreviousCondition;
        public PlantCondition Condition;
    }
}
