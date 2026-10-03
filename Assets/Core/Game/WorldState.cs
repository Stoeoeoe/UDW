using System;
using System.Collections.Generic;
using Sirenix.Serialization;

namespace Core.Game
{
    /// <summary>Plain data describing one changed world object. </summary>
    [Serializable]
    public abstract class WorldObjectState { }

    /// <summary>A changed object and the stable IDs that locate it in the world.</summary>
    public readonly struct WorldStateEntry<T> where T : WorldObjectState
    {
        public string LocationId { get; }
        public string ObjectId { get; }
        public T State { get; }

        public WorldStateEntry(string locationId, string objectId, T state)
        {
            LocationId = locationId;
            ObjectId = objectId;
            State = state;
        }
    }

    /// <summary>Only stores differences from the authored world, grouped by stable location and object IDs.</summary>
    [Serializable]
    public sealed class WorldState
    {
        [OdinSerialize] private Dictionary<string, Dictionary<string, WorldObjectState>> _locations = new(StringComparer.Ordinal);

        public void Set(string locationId, string objectId, WorldObjectState state)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            CheckId(locationId, nameof(locationId));
            CheckId(objectId, nameof(objectId));

            if (!_locations.TryGetValue(locationId, out var objects))
                _locations.Add(locationId, objects = new Dictionary<string, WorldObjectState>(StringComparer.Ordinal));

            if (objects.TryGetValue(objectId, out var existing) && existing.GetType() != state.GetType())
                throw new InvalidOperationException($"World object '{locationId}/{objectId}' already has {existing.GetType().Name} state.");

            objects[objectId] = state;
        }

        /// <summary>Returns the live state object. Changes to it are included in the next save.</summary>
        public bool TryGet<T>(string locationId, string objectId, out T state) where T : WorldObjectState
        {
            CheckId(locationId, nameof(locationId));
            CheckId(objectId, nameof(objectId));

            if (_locations.TryGetValue(locationId, out var objects) && objects.TryGetValue(objectId, out var value))
            {
                state = value as T;
                if (state == null)
                    throw new InvalidOperationException($"World object '{locationId}/{objectId}' has {value.GetType().Name} state, not {typeof(T).Name}.");
                return true;
            }

            state = null;
            return false;
        }

        public bool Remove(string locationId, string objectId)
        {
            CheckId(locationId, nameof(locationId));
            CheckId(objectId, nameof(objectId));
            if (!_locations.TryGetValue(locationId, out var objects) || !objects.Remove(objectId)) return false;
            if (objects.Count == 0) _locations.Remove(locationId);
            return true;
        }

        public IEnumerable<KeyValuePair<string, T>> GetStates<T>(string locationId) where T : WorldObjectState
        {
            CheckId(locationId, nameof(locationId));
            if (!_locations.TryGetValue(locationId, out var objects)) yield break;
            foreach (var pair in objects)
                if (pair.Value is T state)
                    yield return new KeyValuePair<string, T>(pair.Key, state);
        }

        /// <summary>Enumerates this type across all locations, including unloaded ones.</summary>
        public IEnumerable<WorldStateEntry<T>> GetStates<T>() where T : WorldObjectState
        {
            foreach (var location in _locations)
                foreach (var pair in location.Value)
                    if (pair.Value is T state)
                        yield return new WorldStateEntry<T>(location.Key, pair.Key, state);
        }

        internal Dictionary<string, Dictionary<string, WorldObjectState>> GetLocations() => _locations;

        private static void CheckId(string id, string parameterName)
        {
            if (string.IsNullOrWhiteSpace(id))
                throw new ArgumentException("A stable world ID is required.", parameterName);
        }
    }
}
