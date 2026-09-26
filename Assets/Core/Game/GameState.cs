using System;
using System.Collections.Generic;
using Character;

namespace Core.Game
{
    /// <summary>Convenient access to the state of the current game session.</summary>
    public static class GameState
    {
        private static GameStateManager Manager => GameStateManager.Instance
            ? GameStateManager.Instance
            : throw new InvalidOperationException("GameState is unavailable until SystemRoot has initialized.");

        public static WorldState World => Manager.World;
        public static PlayerState Player => Manager.Player;
        public static StoryState Story => Manager.Story;
    }

    /// <summary>World-object records will live here once their identity and record types are defined.</summary>
    public sealed class WorldState
    {
    }

    public sealed class PlayerState
    {
        public CharacterSkills Skills { get; } = new CharacterSkills();
    }

    public sealed class StoryState
    {
        private readonly HashSet<string> _flags = new HashSet<string>(StringComparer.Ordinal);

        public bool HasFlag(string flag) => _flags.Contains(flag);

        public bool SetFlag(string flag) => _flags.Add(flag);

        public bool ClearFlag(string flag) => _flags.Remove(flag);
    }
}
