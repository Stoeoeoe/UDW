using System;
using System.Collections.Generic;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>Packs square cell images into one readable atlas and cuts a top-centre-pivot sprite out of each.</summary>
    internal static class CellSpriteAtlas
    {
        private const int Columns = 64;

        /// <param name="cells">Row-major, bottom-up (sprite space) colours, tileSize × tileSize each.</param>
        internal static Sprite[] Build(AssetImportContext context, string name, IReadOnlyList<Color32[]> cells, int tileSize)
        {
            if (cells.Count == 0) return Array.Empty<Sprite>();
            var columns = Math.Min(cells.Count, Columns);
            var rows = (cells.Count + columns - 1) / columns;
            if (columns * tileSize > SystemInfo.maxTextureSize || rows * tileSize > SystemInfo.maxTextureSize)
                throw new InvalidOperationException($"'{name}' needs {cells.Count} distinct cells, more than one atlas texture can hold.");
            var width = columns * tileSize;
            var colors = new Color32[width * rows * tileSize];
            for (var i = 0; i < cells.Count; i++)
                for (var y = 0; y < tileSize; y++)
                    Array.Copy(cells[i], y * tileSize, colors, (i / columns * tileSize + y) * width + i % columns * tileSize, tileSize);

            // Readable, because the shoreline bake samples sprite alpha.
            var texture = new Texture2D(width, rows * tileSize, TextureFormat.RGBA32, false)
                { name = name + "_Atlas", filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            texture.SetPixels32(colors);
            texture.Apply(false, false);
            context.AddObjectToAsset(texture.name, texture);

            var sprites = new Sprite[cells.Count];
            for (var i = 0; i < sprites.Length; i++)
            {
                var rect = new Rect(i % columns * tileSize, i / columns * tileSize, tileSize, tileSize);
                // Top-centre pivot, like every Vulcanus tile sprite.
                sprites[i] = Sprite.Create(texture, rect, new Vector2(0.5f, 1f), tileSize, 0, SpriteMeshType.FullRect);
                sprites[i].name = $"{name}_{i}";
                context.AddObjectToAsset(sprites[i].name, sprites[i]);
            }
            return sprites;
        }
    }
}
