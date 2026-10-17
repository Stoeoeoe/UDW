using System;

namespace Core.Game
{
    /// <summary>The player's registered home destination, independent of whether its scene is loaded.</summary>
    [Serializable]
    public sealed class PlayerHomeState
    {
        public string LocationId;
        public string BedId;

        public PlayerHomeState(string locationId, string bedId)
        {
            LocationId = locationId;
            BedId = bedId;
            Validate();
        }

        public void Validate()
        {
            if (string.IsNullOrWhiteSpace(LocationId) || string.IsNullOrWhiteSpace(BedId))
                throw new FormatException("A player home requires a location ID and a stable bed instance ID.");
        }
    }
}
