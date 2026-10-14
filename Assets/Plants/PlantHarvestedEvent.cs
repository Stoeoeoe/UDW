using Core.Events;
using UnityEngine;

namespace Plants
{
    /// <summary>Describes a completed harvest, its yield and whether the crop was removed or reset for regrowth.</summary>
    public struct PlantHarvestedEvent
    {
        public string LocationId;
        public Vector2Int Position;
        public string PlantId;
        public string ItemId;
        public int Quantity;
        public HarvestMethod Method;
        public bool Removed;
        public int NewStageIndex;
        // Identifies the harvested instance so a callback that replants this tile cannot
        // make a newly spawned view consume the old plant's event.
        public PlantState State;

        public static void Trigger(PlantHarvestedEvent harvest) => EventBus<PlantHarvestedEvent>.Raise(harvest);
    }
}
