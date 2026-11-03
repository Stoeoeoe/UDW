using System;
using System.Collections.Generic;
using Character;
using Core.Divinity;
using Core.Inventory;
using Core.TimeAndWeather;
using Sirenix.Serialization;

namespace Core.Game
{
    /// <summary>Convenient access to the state of the current game session.</summary>
    public sealed class GameState
    {
        internal GameSaveData Data { get; private set; } = new();
        internal event Action Restored;
        internal void Restore(GameSaveData data)
        {
            Data = data;
            Restored?.Invoke();
        }
        public WorldState World => Data.world;
        public PlayerState Player => Data.player;
        public StoryState Story => Data.story;
        public GameTimeState Time => Data.time;
    }

    [Serializable]
    public sealed class PlayerState
    {
        public PlayerHomeState Home;
        public CharacterSkills Skills = new();
        public DivineFavourState Favour = new();
        public WalletState Wallet = new();
        public InventoryState Inventory = new();
        public HealthState Health = new();
        public StaminaState Stamina = new();
        public CharacterBoostState Boosts = new();
    }

    [Serializable]
    public sealed class GameTimeState
    {
        public bool initialized;
        public int daysSinceStart;
        public Season season;
        public int dayOfSeason;
        public int hour;
        public int minute;
        public float secondsTowardNextMinute;

        /// <summary>Monotonic in-game clock used by persisted cooldowns.</summary>
        public long TotalMinutes => ((long)daysSinceStart - 1) * 24 * 60 + hour * 60 + minute;
    }

    [Serializable]
    public sealed class StoryState
    {
        public HashSet<string> CompletedCutscenes = new(StringComparer.Ordinal);
        [OdinSerialize] private Dictionary<string, StoryValue> _values = new(StringComparer.Ordinal);

        public bool Has(string key)
        {
            StoryValue.RequireKey(key);
            return _values.ContainsKey(key);
        }

        public T Get<T>(string key) => GetValue(key).Get<T>();

        public bool TryGet<T>(string key, out T value)
        {
            StoryValue.RequireKey(key);
            if (!_values.TryGetValue(key, out var stored)) { value = default; return false; }
            value = stored.Get<T>();
            return true;
        }

        public void Set<T>(string key, T value) => SetValue(key, new StoryValue(value));

        public bool Remove(string key)
        {
            StoryValue.RequireKey(key);
            return _values.Remove(key);
        }

        internal StoryValue GetValue(string key)
        {
            StoryValue.RequireKey(key);
            if (!_values.TryGetValue(key, out var value)) throw new KeyNotFoundException($"Story value '{key}' is not set.");
            return value;
        }

        internal void SetValue(string key, StoryValue value)
        {
            StoryValue.RequireKey(key);
            if (value == null) throw new ArgumentNullException(nameof(value));
            if (_values.TryGetValue(key, out var existing) && !StoryValue.SameType(existing, value))
                throw new InvalidOperationException($"Story value '{key}' already has type {existing.ValueType.Name}.");
            _values[key] = value;
        }

        internal void Validate()
        {
            if (_values == null || CompletedCutscenes == null) throw new FormatException("The save is missing story state.");
            foreach (var pair in _values)
            {
                if (pair.Value == null) throw new FormatException($"Story value '{pair.Key}' is null.");
                try
                {
                    StoryValue.RequireKey(pair.Key);
                    pair.Value.Validate();
                }
                catch (ArgumentException exception)
                {
                    throw new FormatException($"Invalid saved story value '{pair.Key}'.", exception);
                }
            }
        }
    }
}
