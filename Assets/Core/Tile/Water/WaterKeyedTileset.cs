using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEditor.U2D.Aseprite;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Water.Editor
{
    /// <summary>
    /// Splits a color-keyed tileset into a terrain texture with key pixels removed and one opaque
    /// mask texture per water type present. Runs once per flagged tileset per map import. The
    /// source PNG is read directly; Aseprite sheets use their readable, uncompressed imported pixels.
    /// Key pixels must match exactly, with alpha 255. There is no near-match tolerance.
    /// </summary>
    public sealed class WaterKeyedTileset
    {
        private readonly AssetImportContext context;
        private readonly Texture2D source;
        private readonly string prefix;
        private readonly int width;
        private readonly Texture2D terrain;
        private readonly Dictionary<string, Color32[]> maskPixels = new();
        private readonly Dictionary<string, Texture2D> masks = new();
        private readonly Dictionary<Sprite, Sprite> terrainSprites = new();
        private readonly Dictionary<(Sprite, string), Sprite> maskSprites = new();
        private readonly Dictionary<Sprite, string[]> spriteTypes = new();

        /// <summary>The tileset with every key pixel made transparent.</summary>
        public Texture2D Terrain => terrain;

        /// <summary>Water types that occur anywhere in this tileset.</summary>
        public IReadOnlyCollection<string> WaterTypes => masks.Keys;

        private WaterKeyedTileset(AssetImportContext importContext, Texture2D importedTexture, string sourcePath,
            Color32[] pixels, int textureWidth, int textureHeight, WaterColorKeys keys)
        {
            context = importContext;
            source = importedTexture;
            width = textureWidth;
            prefix = AssetDatabase.AssetPathToGUID(sourcePath);

            var keyTypes = new Dictionary<int, string>();
            foreach (var entry in keys.Entries) keyTypes[WaterColorKeys.Pack(entry.color)] = entry.waterType;

            // One pass over the tileset: key pixels move to their type's mask, everything else stays terrain.
            var white = new Color32(255, 255, 255, 255);
            for (var i = 0; i < pixels.Length; i++)
            {
                var pixel = pixels[i];
                if (pixel.a != 255 || !keyTypes.TryGetValue(WaterColorKeys.Pack(pixel), out var type)) continue;
                if (!maskPixels.TryGetValue(type, out var mask))
                    maskPixels[type] = mask = new Color32[pixels.Length]; // Zero is transparent.
                mask[i] = white;
                pixels[i] = default;
            }

            terrain = MakeTexture($"{importedTexture.name} (terrain)", pixels, textureWidth, textureHeight, linear: false, readable: false);
            context.AddObjectToAsset($"water-key/{prefix}/terrain", terrain);
            foreach (var (type, mask) in maskPixels)
            {
                // Masks stay readable so the shoreline baker can rasterize them like any water sprite.
                var texture = MakeTexture($"{importedTexture.name} ({type} mask)", mask, textureWidth, textureHeight, linear: true, readable: true);
                context.AddObjectToAsset($"water-key/{prefix}/mask/{type}", texture);
                masks[type] = texture;
            }
        }

        /// <summary>Splits a flagged tileset. Call once per tileset texture per import.</summary>
        public static WaterKeyedTileset Create(AssetImportContext context, Texture2D importedTexture, WaterColorKeys keys)
        {
            if (context == null) throw new ArgumentNullException(nameof(context));
            if (!importedTexture) throw new ArgumentNullException(nameof(importedTexture));
            if (!keys) throw new InvalidOperationException("Keyed water tilesets require a WaterColorKeys asset.");
            keys.Validate();

            var path = AssetDatabase.GetAssetPath(importedTexture);
            if (AssetImporter.GetAtPath(path) is AsepriteImporter)
            {
                if (!importedTexture.isReadable || importedTexture.format != TextureFormat.RGBA32)
                    throw new InvalidOperationException($"Keyed Aseprite tileset '{path}' requires readable, uncompressed RGBA32 pixels to preserve exact key colors.");
                context.DependsOnArtifact(path);
                context.DependsOnSourceAsset(AssetDatabase.GetAssetPath(keys));
                return new WaterKeyedTileset(context, importedTexture, path, importedTexture.GetPixels32(),
                    importedTexture.width, importedTexture.height, keys);
            }
            if (string.IsNullOrEmpty(path) || !path.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"Keyed water tileset '{importedTexture.name}' must be a PNG or Aseprite asset.");
            context.DependsOnSourceAsset(path);
            context.DependsOnSourceAsset(AssetDatabase.GetAssetPath(keys));

            var decoded = new Texture2D(2, 2, TextureFormat.RGBA32, false, true);
            try
            {
                if (!decoded.LoadImage(File.ReadAllBytes(path), false))
                    throw new InvalidOperationException($"Keyed water tileset '{path}' could not be decoded.");
                if (decoded.width != importedTexture.width || decoded.height != importedTexture.height)
                    throw new InvalidOperationException($"Keyed water tileset '{path}' is imported at {importedTexture.width}x{importedTexture.height} but the PNG is {decoded.width}x{decoded.height}. Raise its Max Size so sprite rects match the source pixels.");
                return new WaterKeyedTileset(context, importedTexture, path, decoded.GetPixels32(), decoded.width, decoded.height, keys);
            }
            finally
            {
                Object.DestroyImmediate(decoded);
            }
        }

        /// <summary>The tile sprite with its key pixels removed. Use it in the source layer instead of the original.</summary>
        public Sprite TerrainSprite(Sprite tile)
        {
            CheckSource(tile);
            if (!terrainSprites.TryGetValue(tile, out var sprite))
            {
                sprite = MakeSprite(terrain, tile, "terrain");
                terrainSprites[tile] = sprite;
            }
            return sprite;
        }

        /// <summary>Water types with at least one key pixel inside this tile.</summary>
        public IReadOnlyList<string> TypesIn(Sprite tile)
        {
            CheckSource(tile);
            if (spriteTypes.TryGetValue(tile, out var cached)) return cached;
            var found = new List<string>();
            var rect = PixelRect(tile);
            foreach (var (type, mask) in maskPixels)
                if (AnyPixel(mask, rect)) found.Add(type);
            var result = found.ToArray();
            spriteTypes[tile] = result;
            return result;
        }

        /// <summary>The opaque water mask of one type for this tile. False when the tile has no pixels of that type.</summary>
        public bool TryGetMaskSprite(Sprite tile, string waterType, out Sprite mask)
        {
            mask = null;
            if (Array.IndexOf((string[])TypesIn(tile), waterType) < 0) return false;
            var key = (tile, waterType);
            if (!maskSprites.TryGetValue(key, out mask))
            {
                mask = MakeSprite(masks[waterType], tile, $"{waterType} mask");
                maskSprites[key] = mask;
            }
            return true;
        }

        /// <summary>True when the tileset pixel is a key pixel of the given type. Texture coordinates, bottom-left origin.</summary>
        public bool IsWaterPixel(string waterType, int x, int y) =>
            maskPixels.TryGetValue(waterType, out var mask) && mask[y * width + x].a != 0;

        private void CheckSource(Sprite tile)
        {
            if (!tile) throw new ArgumentNullException(nameof(tile));
            if (tile.texture != source)
                throw new InvalidOperationException($"Sprite '{tile.name}' does not belong to keyed tileset '{source.name}'.");
        }

        private Sprite MakeSprite(Texture2D texture, Sprite tile, string suffix)
        {
            var rect = tile.rect;
            var sprite = Sprite.Create(texture, rect, tile.pivot / rect.size, tile.pixelsPerUnit, 0,
                SpriteMeshType.FullRect, tile.border);
            sprite.name = $"{tile.name} ({suffix})";
            // The rect keeps identifiers unique and stable even when sprite names repeat.
            context.AddObjectToAsset($"water-key/{prefix}/{rect.x},{rect.y},{rect.width},{rect.height}/{suffix}", sprite);
            return sprite;
        }

        private static RectInt PixelRect(Sprite tile)
        {
            var rect = tile.rect;
            return new RectInt(Mathf.RoundToInt(rect.x), Mathf.RoundToInt(rect.y),
                Mathf.RoundToInt(rect.width), Mathf.RoundToInt(rect.height));
        }

        private bool AnyPixel(Color32[] mask, RectInt rect)
        {
            for (var y = rect.yMin; y < rect.yMax; y++)
            for (var x = rect.xMin; x < rect.xMax; x++)
                if (mask[y * width + x].a != 0) return true;
            return false;
        }

        private static Texture2D MakeTexture(string name, Color32[] pixels, int width, int height, bool linear, bool readable)
        {
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false, linear)
            {
                name = name,
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
            };
            texture.SetPixels32(pixels);
            texture.Apply(false, !readable);
            return texture;
        }
    }
}
