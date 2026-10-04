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

    /// <summary>Changed world objects, addressed globally or by location for tile-based state.</summary>
    [Serializable]
    public sealed class WorldState
    {
        /// <summary>Reserved storage bucket, never an authored location ID.</summary>
        public const string Global = "$global";

        [OdinSerialize] private Dictionary<string, Dictionary<string, WorldObjectState>> _locations = new(StringComparer.Ordinal);

        /// <summary>Stores state for an object with a globally unique ID, independent of location.</summary>
        public void Set(string objectId, WorldObjectState state) => Set(Global, objectId, state);

        /// <summary>Returns the live state of a globally identified object.</summary>
        public bool TryGet<T>(string objectId, out T state) where T : WorldObjectState => TryGet(Global, objectId, out state);

        public bool Remove(string objectId) => Remove(Global, objectId);

        public void Set(string locationId, string objectId, WorldObjectState state)
        {
            if (!_locations.TryGetValue(locationId, out var objects))
                _locations[locationId] = objects = new(StringComparer.Ordinal);

            if (objects.TryGetValue(objectId, out var existing) && existing != null && existing.GetType() != state.GetType())
                throw new InvalidOperationException($"World object '{locationId}/{objectId}' already has {existing.GetType().Name} state.");

            objects[objectId] = state;
        }

        /// <summary>Returns live state; mutations persist. Missing, null or differently typed values return false.</summary>
        public bool TryGet<T>(string locationId, string objectId, out T state) where T : WorldObjectState
        {
            state = _locations.TryGetValue(locationId, out var objects) && objects.TryGetValue(objectId, out var value)
                ? value as T : null;
            return state != null;
        }

        public bool Remove(string locationId, string objectId)
        {
            if (!_locations.TryGetValue(locationId, out var objects) || !objects.Remove(objectId)) return false;
            if (objects.Count == 0) _locations.Remove(locationId);
            return true;
        }

        /// <summary>Live enumeration; materialize with ToArray/ToList before adding or removing entries.</summary>
        public IEnumerable<KeyValuePair<string, T>> GetStates<T>(string locationId) where T : WorldObjectState
        {
            if (!_locations.TryGetValue(locationId, out var objects)) yield break;
            foreach (var pair in objects)
                if (pair.Value is T state)
                    yield return new KeyValuePair<string, T>(pair.Key, state);
        }

        /// <summary>Live enumeration across the world. Global objects have no LocationId.
        /// Materialize with ToArray/ToList before adding or removing entries.</summary>
        public IEnumerable<WorldStateEntry<T>> GetStates<T>() where T : WorldObjectState
        {
            foreach (var location in _locations)
                foreach (var pair in location.Value)
                    if (pair.Value is T state)
                        yield return new WorldStateEntry<T>(location.Key == Global ? null : location.Key, pair.Key, state);
        }

        internal Dictionary<string, Dictionary<string, WorldObjectState>> GetLocations() => _locations;

    }
}
