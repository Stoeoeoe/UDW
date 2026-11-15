using System;
using System.Collections.Generic;
using System.Linq;
using Sirenix.OdinInspector;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Catalogs
{
    [Serializable]
    public sealed class CatalogEntry
    {
        [SerializeField, ReadOnly] private Object definition;
        [SerializeField] private bool enabled = true;
        public Object Definition => definition;
        public bool Enabled => enabled;
        public CatalogEntry(Object definition) => this.definition = definition;
        internal void SetEnabled(bool value) => enabled = value;
    }

    /// <summary>Discovered references and authoring selection, never player save data.</summary>
    public abstract class DefinitionCatalog : ScriptableObject
    {
        [SerializeField, TableList(IsReadOnly = true, AlwaysExpanded = true)]
        private CatalogEntry[] entries = Array.Empty<CatalogEntry>();
        [NonSerialized] private Dictionary<string, Object> _byId;
        [NonSerialized] private Object[] _testContent = Array.Empty<Object>();
        /// <summary>Project folder searched recursively by editor discovery, including Assets/.</summary>
        public abstract string Path { get; }
        public abstract Type DefinitionType { get; }
        public virtual StringComparer IdComparer => StringComparer.Ordinal;
        public IReadOnlyList<CatalogEntry> Entries => entries;
        public abstract string GetId(Object definition);

        protected Object FindDefinition(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            if (_byId == null)
            {
                var index = new Dictionary<string, Object>(IdComparer);
                foreach (var enabled in EnabledObjects) index.Add(GetId(enabled), enabled);
                _byId = index;
            }
            return _byId.TryGetValue(id, out var definition) ? definition : null;
        }

        public void SetEnabled(Object definition, bool enabled)
        {
            var entry = entries.FirstOrDefault(value => value.Definition == definition);
            if (entry == null) throw new ArgumentException("The asset is not part of this catalog.", nameof(definition));
            entry.SetEnabled(enabled);
            InvalidateLookup();
        }

        /// <summary>Preserves selections. New discoveries default to enabled.</summary>
        public bool Synchronize(IEnumerable<Object> definitions)
        {
            var previous = entries.Where(entry => entry.Definition).ToDictionary(entry => entry.Definition);
            var updated = definitions.Select(definition => definition && previous.TryGetValue(definition, out var entry)
                ? entry : new CatalogEntry(definition)).ToArray();
            if (entries.Select(entry => entry.Definition).SequenceEqual(updated.Select(entry => entry.Definition))) return false;
            entries = updated;
            InvalidateLookup();
            return true;
        }

        /// <summary>Enabled definitions, then the test project's while a test scene plays.</summary>
        protected IEnumerable<Object> EnabledObjects =>
            entries.Where(entry => entry.Enabled && entry.Definition).Select(entry => entry.Definition).Concat(_testContent);

        /// <summary>
        /// The editor adds the test project's definitions while a test scene plays, and removes them afterwards.
        /// They are never saved with the catalog.
        /// </summary>
        public void UseTestContent(Object[] definitions)
        {
            _testContent = definitions;
            InvalidateLookup();
        }

        public void InvalidateLookup() => _byId = null;
        protected virtual void OnEnable() => InvalidateLookup();
        protected virtual void OnValidate() => InvalidateLookup();
    }

    public abstract class DefinitionCatalog<T> : DefinitionCatalog where T : Object
    {
        public sealed override Type DefinitionType => typeof(T);
        protected abstract string GetDefinitionId(T definition);
        public sealed override string GetId(Object definition) => GetDefinitionId((T)definition);
        public T Get(string id) => FindDefinition(id) as T;
        public IEnumerable<T> EnabledDefinitions => EnabledObjects.Cast<T>();
    }
}
