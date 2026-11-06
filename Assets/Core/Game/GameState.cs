using System;
using System.Collections.Generic;
using Character;
using Core.Divinity;
using Core.Inventory;
using Core.TimeAndWeather;
using Sirenix.Serialization;
using UnityEngine;

namespace Core.Game
{
    /// <summary>Convenient access to the state of the current game session.</summary>
    public sealed class GameState
    {
        internal GameSaveData Data { get; private set; } = new();
        internal event Action Restored;
        /// <summary>A new game's first location starts at the home bed. It is a start request, not saved data.</summary>
        internal bool StartAtHome { get; set; }

        internal void Restore(GameSaveData data)
        {
            Data = data;
            StartAtHome = false;
            Restored?.Invoke();
        }
        public WorldState World => Data.world;
        public PlayerState Player => Data.player;
        public StoryState Story => Data.story;
        public GameTimeState Time => Data.time;
        public SessionState Session => Data.session;
    }

    /// <summary>Where the player is and which conditions are active, so a save resumes exactly where it was made.</summary>
    [Serializable]
    public sealed class SessionState
    {
        /// <summary>The location the player was in; null until the first save made inside a location.</summary>
        public string LocationId;
        public Vector2 Position;
        public Vector2 Facing = Vector2.down;
        /// <summary>The active weather, valid only for <see cref="WeatherDay"/>; a new day rolls again.</summary>
        public string WeatherId;
        public int WeatherDay;

        internal void Validate()
        {
            if (LocationId != null && string.IsNullOrWhiteSpace(LocationId))
                throw new FormatException("The save contains an invalid location ID.");
            if (!IsFinite(Position) || !IsFinite(Facing))
                throw new FormatException("The save contains an invalid player position.");
            if (WeatherId != null && string.IsNullOrWhiteSpace(WeatherId) || WeatherDay < 0)
                throw new FormatException("The save contains invalid weather.");
        }

        private static bool IsFinite(Vector2 value) =>
            float.IsFinite(value.x) && float.IsFinite(value.y);
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
