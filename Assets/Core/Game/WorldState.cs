using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace Core.Game
{
    /// <summary>Changed world-object state, keyed by stable location, object, and record IDs.</summary>
    public sealed class WorldState
    {
        private readonly Dictionary<WorldStateKey, WorldStateRecord> _records = new();

        /// <summary>Store a complete, typed state record. Put any in-game timestamp in that record.</summary>
        public void Set<T>(string locationId, string objectId, string recordType, T state) where T : class
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            ValidateStateType<T>();
            if (state.GetType() != typeof(T))
                throw new ArgumentException("Use the concrete state type when storing a world record.", nameof(state));

            var key = new WorldStateKey(locationId, objectId, recordType);
            _records[key] = new WorldStateRecord
            {
                locationId = locationId,
                objectId = objectId,
                recordType = recordType,
                data = JsonUtility.ToJson(state)
            };
        }

        /// <summary>Returns a copy of the record. Call Set again after modifying it.</summary>
        public bool TryGet<T>(string locationId, string objectId, string recordType, out T state) where T : class
        {
            ValidateStateType<T>();
            var key = new WorldStateKey(locationId, objectId, recordType);
            if (_records.TryGetValue(key, out var record))
            {
                state = JsonUtility.FromJson<T>(record.data);
                if (state == null)
                    throw new FormatException($"World record '{recordType}' for '{locationId}/{objectId}' is invalid.");
                return true;
            }

            state = null;
            return false;
        }

        private static void ValidateStateType<T>() where T : class
        {
            var type = typeof(T);
            if (!type.IsSerializable || type.IsAbstract || typeof(IEnumerable).IsAssignableFrom(type) ||
                typeof(UnityEngine.Object).IsAssignableFrom(type))
                throw new ArgumentException("World state must be a concrete [Serializable] data class.");
        }

        public bool Remove(string locationId, string objectId, string recordType)
            => _records.Remove(new WorldStateKey(locationId, objectId, recordType));

        public List<string> GetObjectIds(string locationId, string recordType)
        {
            if (string.IsNullOrWhiteSpace(locationId)) throw new ArgumentException("A location ID is required.", nameof(locationId));
            if (string.IsNullOrWhiteSpace(recordType)) throw new ArgumentException("A record type is required.", nameof(recordType));

            var ids = new List<string>();
            foreach (var record in _records.Values)
                if (StringComparer.Ordinal.Equals(record.locationId, locationId) &&
                    StringComparer.Ordinal.Equals(record.recordType, recordType))
                    ids.Add(record.objectId);

            ids.Sort(StringComparer.Ordinal);
            return ids;
        }

        internal List<WorldStateRecord> CaptureRecords()
        {
            var records = new List<WorldStateRecord>(_records.Count);
            foreach (var record in _records.Values)
                records.Add(record.Copy());

            records.Sort((a, b) =>
            {
                var result = StringComparer.Ordinal.Compare(a.locationId, b.locationId);
                if (result != 0) return result;
                result = StringComparer.Ordinal.Compare(a.objectId, b.objectId);
                return result != 0 ? result : StringComparer.Ordinal.Compare(a.recordType, b.recordType);
            });
            return records;
        }

        internal void RestoreRecords(IEnumerable<WorldStateRecord> records)
        {
            _records.Clear();
            foreach (var record in records)
                _records.Add(new WorldStateKey(record.locationId, record.objectId, record.recordType), record.Copy());
        }
    }

    internal readonly struct WorldStateKey : IEquatable<WorldStateKey>
    {
        private readonly string _locationId;
        private readonly string _objectId;
        private readonly string _recordType;

        public WorldStateKey(string locationId, string objectId, string recordType)
        {
            if (string.IsNullOrWhiteSpace(locationId)) throw new ArgumentException("A location ID is required.", nameof(locationId));
            if (string.IsNullOrWhiteSpace(objectId)) throw new ArgumentException("An object ID is required.", nameof(objectId));
            if (string.IsNullOrWhiteSpace(recordType)) throw new ArgumentException("A record type is required.", nameof(recordType));
            _locationId = locationId;
            _objectId = objectId;
            _recordType = recordType;
        }

        public bool Equals(WorldStateKey other) =>
            StringComparer.Ordinal.Equals(_locationId, other._locationId) &&
            StringComparer.Ordinal.Equals(_objectId, other._objectId) &&
            StringComparer.Ordinal.Equals(_recordType, other._recordType);

        public override bool Equals(object obj) => obj is WorldStateKey other && Equals(other);

        public override int GetHashCode()
        {
            unchecked
            {
                var hash = StringComparer.Ordinal.GetHashCode(_locationId);
                hash = hash * 397 ^ StringComparer.Ordinal.GetHashCode(_objectId);
                return hash * 397 ^ StringComparer.Ordinal.GetHashCode(_recordType);
            }
        }
    }
}
