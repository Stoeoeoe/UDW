using System;
using System.Collections.Generic;

namespace Core.Game
{
    /// <summary>Plain data describing one changed world object. </summary>
    [Serializable]
    public abstract class WorldObjectState { }

    /// <summary>Only stores differences from the authored world, grouped by stable location and object IDs.</summary>
    public sealed class WorldState
    {
        private readonly Dictionary<string, Dictionary<string, WorldObjectState>> _locations = new(StringComparer.Ordinal);

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

        internal WorldSaveData Capture()
        {
            var result = new WorldSaveData();
            foreach (var location in _locations)
                result.locations.Add(location.Key, new Dictionary<string, WorldObjectState>(location.Value, StringComparer.Ordinal));
            return result;
        }

        internal void Restore(WorldSaveData data)
        {
            _locations.Clear();
            foreach (var location in data.locations)
                _locations.Add(location.Key, new Dictionary<string, WorldObjectState>(location.Value, StringComparer.Ordinal));
        }

        private static void CheckId(string id, string parameterName)
        {
            if (string.IsNullOrWhiteSpace(id))
                throw new ArgumentException("A stable world ID is required.", parameterName);
        }
    }
}
