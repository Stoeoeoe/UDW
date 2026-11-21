using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
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
    [CreateAssetMenu(menuName = "Game/Definition Catalog")]
    public sealed class DefinitionCatalog : ScriptableObject
    {
        public const string ResourceName = "DefinitionCatalog";
        public const string AssetPath = "Assets/Resources/DefinitionCatalog.asset";
        public static IReadOnlyList<Type> DefinitionTypes { get; } = typeof(DefinitionCatalog).Assembly.GetTypes()
            .Where(type => type.IsDefined(typeof(DefinitionResourceAttribute), false))
            .OrderBy(type => type.FullName, StringComparer.Ordinal).ToArray();
        [SerializeField, TableList(IsReadOnly = true, AlwaysExpanded = true)]
        private CatalogEntry[] entries = Array.Empty<CatalogEntry>();
        [NonSerialized] private readonly Dictionary<Type, Dictionary<string, Object>> _byType = new();
        [NonSerialized] private Object[] _testContent = Array.Empty<Object>();
        public IReadOnlyList<CatalogEntry> Entries => entries;
        public static string GetId(Object definition) => ((IDefinition)definition).Id;
        public static string DiscoveryPath(Type type) => FamilyOf(type).GetCustomAttribute<DefinitionResourceAttribute>().Path;

        public static Type FamilyOf(Type type)
        {
            for (var current = type; current != null; current = current.BaseType)
                if (current.IsDefined(typeof(DefinitionResourceAttribute), false)) return current;
            throw new ArgumentException($"{type.FullName} is not a declared definition resource.", nameof(type));
        }

        public T Get<T>(string id) where T : Object => Get(typeof(T), id) as T;
        public T Require<T>(string id) where T : Object => Get<T>(id)
            ?? throw new InvalidOperationException($"{typeof(T).Name} '{id}' is not registered and enabled.");
        public IEnumerable<T> All<T>() where T : Object => All(typeof(T)).Cast<T>();
        public IEnumerable<Object> All(Type type) => EnabledObjects.Where(type.IsInstanceOfType);

        public Object Get(Type type, string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            var family = FamilyOf(type);
            if (!_byType.TryGetValue(family, out var index))
            {
                index = new Dictionary<string, Object>(StringComparer.Ordinal);
                foreach (var enabled in All(family)) index.Add(GetId(enabled), enabled);
                _byType.Add(family, index);
            }
            return index.TryGetValue(id, out var definition) && type.IsInstanceOfType(definition) ? definition : null;
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
        private IEnumerable<Object> EnabledObjects =>
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

        public void InvalidateLookup() => _byType.Clear();
        private void OnEnable() => InvalidateLookup();
        private void OnValidate() => InvalidateLookup();
    }
}
