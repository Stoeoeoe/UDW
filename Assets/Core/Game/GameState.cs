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
        public static void Save(string slot) => Manager.Save(slot);
        public static bool Load(string slot) => Manager.Load(slot);
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

        internal IEnumerable<string> GetFlags() => _flags;

        internal void RestoreFlags(IEnumerable<string> flags)
        {
            _flags.Clear();
            foreach (var flag in flags)
                _flags.Add(flag);
        }
    }
}
