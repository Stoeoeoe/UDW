using System;
using Core.Inventory;
using Core.Location;
using Interaction.Tools;

namespace Core
{
    [Serializable]
    public sealed class PlayerSettings
    {
        public ToolData[] startingTools = Array.Empty<ToolData>();
        public ItemDefinition[] startingItems = Array.Empty<ItemDefinition>();
        public LocationData startingHomeLocation;
        public string startingBedId;
        public int startingMoney;

        public void Validate()
        {
            if (!startingHomeLocation || string.IsNullOrWhiteSpace(startingBedId))
                throw new InvalidOperationException("Player settings require a starting home location and bed ID.");
        }
    }
}
