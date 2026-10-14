using UnityEngine;

namespace Plants
{
    /// <summary>Crop removal without a harvest yield, including wilt expiry and manual clearing.</summary>
    public struct PlantRemovedEvent
    {
        public string LocationId;
        public Vector2Int Position;
        public PlantState State;
    }
}
