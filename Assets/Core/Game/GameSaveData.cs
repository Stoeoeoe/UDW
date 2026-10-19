using System;
using System.Collections.Generic;
using System.Linq;

namespace Core.Game
{
    /// <summary>The persisted game state. Runtime services operate on these sections directly.</summary>
    [Serializable]
    public sealed class GameSaveData
    {
        public const int CurrentVersion = 1;

        public int schemaVersion = CurrentVersion;
        public int worldBaselineVersion = 1;
        public PlayerState player = new();
        public StoryState story = new();
        public GameTimeState time = new();
        public WorldState world = new();

        public void Validate()
        {
            if (schemaVersion != CurrentVersion)
                throw new NotSupportedException($"Save schema version {schemaVersion} is not supported (expected {CurrentVersion}).");
            if (worldBaselineVersion < 1)
                throw new FormatException("The save is missing its world baseline version.");
            if (player?.Skills?.GetLevels() == null || player.Favour?.Scores == null || player.Wallet == null || player.Inventory?.ToolCharges == null || player.Health == null || player.Stamina == null || player.Boosts?.Active == null ||
                story?.GetFlags() == null || time == null || world?.GetLocations() == null)
                throw new FormatException("The save is missing a required state section.");

            foreach (var charge in player.Inventory.ToolCharges)
                if (string.IsNullOrWhiteSpace(charge.Key) || charge.Value == null || charge.Value.Capacity <= 0 ||
                    charge.Value.Current < 0 || charge.Value.Current > charge.Value.Capacity)
                    throw new FormatException("The save contains invalid tool charge state.");

            if (player.Health.Current < 0 || player.Health.Overcharge < 0 ||
                (long)player.Health.Current + player.Health.Overcharge > int.MaxValue)
                throw new FormatException("The save contains invalid player health.");

            if (player.Stamina.Current < 0 || player.Stamina.Overcharge < 0 ||
                (long)player.Stamina.Current + player.Stamina.Overcharge > int.MaxValue)
                throw new FormatException("The save contains invalid player stamina.");

            foreach (var boost in player.Boosts.Active)
            {
                if (string.IsNullOrWhiteSpace(boost.Key) || boost.Value == null || boost.Value.ExpiresAtMinute < 0 ||
                    boost.Value.Bonuses == null || boost.Value.Bonuses.Length == 0)
                    throw new FormatException("The save contains an invalid temporary boost.");
                foreach (var bonus in boost.Value.Bonuses)
                    if (!Enum.IsDefined(typeof(Character.CharacterAttributeType), bonus.Attribute) ||
                        float.IsNaN(bonus.Flat) || float.IsInfinity(bonus.Flat) || bonus.Flat < 0 ||
                        float.IsNaN(bonus.Percent) || float.IsInfinity(bonus.Percent) || bonus.Percent < 0)
                        throw new FormatException("The save contains invalid temporary boost values.");
            }

            if (player.Inventory.StartingLoadoutApplied && player.Inventory.Slots == null)
                throw new FormatException("The initialized inventory is missing its slots.");

            if (player.Home == null)
                throw new FormatException("The save is missing the player's home assignment.");
            player.Home.Validate();
            if (player.Inventory.Slots != null)
                foreach (var slot in player.Inventory.Slots.Concat(new[] { player.Inventory.HeldSlot }))
                    if (slot.Quantity < 0 || (slot.Quantity > 0 && string.IsNullOrWhiteSpace(slot.ItemId)))
                        throw new FormatException("The save contains an invalid inventory slot.");

            if (!time.initialized || time.daysSinceStart < 1 ||
                !Enum.IsDefined(typeof(Core.TimeAndWeather.Season), time.season) ||
                time.dayOfSeason < 1 || time.hour < 0 || time.hour > 23 ||
                time.minute < 0 || time.minute > 59 ||
                float.IsNaN(time.secondsTowardNextMinute) || float.IsInfinity(time.secondsTowardNextMinute) ||
                time.secondsTowardNextMinute < 0)
                throw new FormatException("The save contains invalid game time.");

            foreach (var skill in player.Skills.GetLevels())
                if (string.IsNullOrWhiteSpace(skill.Key) || skill.Value < 0)
                    throw new FormatException("The save contains an invalid skill level.");

            var storyFlags = new HashSet<string>(StringComparer.Ordinal);
            foreach (var flag in story.GetFlags())
                if (string.IsNullOrWhiteSpace(flag) || !storyFlags.Add(flag))
                    throw new FormatException("The save contains an invalid or duplicate story flag.");

            foreach (var location in world.GetLocations())
            {
                if (string.IsNullOrWhiteSpace(location.Key) || location.Value == null)
                    throw new FormatException("The save contains an invalid world location.");
                foreach (var obj in location.Value)
                    if (string.IsNullOrWhiteSpace(obj.Key) || obj.Value == null)
                        throw new FormatException("The save contains an invalid world object.");
            }
        }
    }

}
