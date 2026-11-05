using System;
using System.Collections.Generic;
using System.Linq;
using Core.TimeAndWeather;

namespace Core.Game
{
    /// <summary>The summary shown for a slot, stored beside the save so listing slots never loads a whole game.</summary>
    [Serializable]
    public sealed class SaveSlotHeader
    {
        public string saveName;
        public long savedAtUtcTicks;
        public int daysSinceStart;
        public Season season;
        public int dayOfSeason;
        public int hour;
        public int minute;
        public string locationId;
        public int worldBaselineVersion;

        public DateTime SavedAtUtc => new(savedAtUtcTicks, DateTimeKind.Utc);

        public bool IsValid() => savedAtUtcTicks > 0 && savedAtUtcTicks <= DateTime.MaxValue.Ticks;

        public static SaveSlotHeader From(GameSaveData data, DateTime savedAtUtc) => new()
        {
            saveName = data.saveName,
            savedAtUtcTicks = savedAtUtc.Ticks,
            daysSinceStart = data.time.daysSinceStart,
            season = data.time.season,
            dayOfSeason = data.time.dayOfSeason,
            hour = data.time.hour,
            minute = data.time.minute,
            locationId = data.session.LocationId,
            worldBaselineVersion = data.worldBaselineVersion
        };
    }

    /// <summary>A save slot on disk: readable with a header, or unreadable with the reason it failed to load.</summary>
    public sealed class SaveSlotInfo
    {
        public string Slot { get; }
        public SaveSlotHeader Header { get; }
        public string Error { get; }
        public bool IsReadable => Error == null;
        public string DisplayName => string.IsNullOrWhiteSpace(Header?.saveName) ? Slot : Header.saveName;

        public SaveSlotInfo(string slot, SaveSlotHeader header, string error)
        {
            Slot = slot;
            Header = header;
            Error = error;
        }

        /// <summary>The most recently saved readable slot, or null when there is none.</summary>
        public static SaveSlotInfo LastPlayed(IEnumerable<SaveSlotInfo> slots) =>
            slots.Where(slot => slot.IsReadable).OrderByDescending(slot => slot.Header.savedAtUtcTicks).FirstOrDefault();
    }
}
