using System;
using System.Collections.Generic;
using UnityEngine;

namespace Core.Tile.Water.Editor
{
    /// <summary>Maps exact opaque key colors in keyed tilesets to water types. Import-time data only.</summary>
    [CreateAssetMenu(menuName = "Water/Color Keys")]
    public sealed class WaterColorKeys : ScriptableObject
    {
        [Serializable]
        public struct Entry
        {
            [Tooltip("Exact opaque RGB that marks this water type. It must not appear anywhere else in keyed tilesets.")]
            public Color32 color;
            [Tooltip("Water type name. Resolves to Assets/Content/Water/<waterType>.asset like tile metadata does.")]
            public string waterType;
        }

        [SerializeField] private Entry[] entries =
        {
            new() { color = new Color32(255, 0, 255, 255), waterType = "Lake_1" },
        };

        [SerializeField, Tooltip("Tileset textures whose key-colored pixels become water. Only these are scanned.")]
        private Texture2D[] keyedTilesets = Array.Empty<Texture2D>();

        public IReadOnlyList<Entry> Entries => entries;
        public IReadOnlyList<Texture2D> KeyedTilesets => keyedTilesets;

        public void Validate()
        {
            if (entries == null || entries.Length == 0)
                throw new InvalidOperationException($"Water color keys '{name}' requires at least one entry.");
            var colors = new HashSet<int>();
            var types = new HashSet<string>();
            foreach (var entry in entries)
            {
                if (string.IsNullOrWhiteSpace(entry.waterType) || entry.waterType == "None")
                    throw new InvalidOperationException($"Water color keys '{name}' has an entry without a water type.");
                if (entry.color.a != 255)
                    throw new InvalidOperationException($"Water color keys '{name}': key for '{entry.waterType}' must be opaque.");
                if (!colors.Add(Pack(entry.color)))
                    throw new InvalidOperationException($"Water color keys '{name}' uses {Describe(entry.color)} for more than one type.");
                if (!types.Add(entry.waterType))
                    throw new InvalidOperationException($"Water color keys '{name}' lists '{entry.waterType}' more than once.");
            }
            var tilesets = new HashSet<Texture2D>();
            foreach (var tileset in keyedTilesets ?? Array.Empty<Texture2D>())
                if (!tileset || !tilesets.Add(tileset))
                    throw new InvalidOperationException($"Water color keys '{name}' has a missing or duplicate keyed tileset.");
        }

        internal static int Pack(Color32 color) => color.r << 16 | color.g << 8 | color.b;

        internal static string Describe(Color32 color) => $"RGB({color.r},{color.g},{color.b})";
    }
}