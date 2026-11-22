using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Tile.Vulcanus;
using Core.TimeAndWeather;
using Core.Tile.Water;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEditor.U2D.Aseprite;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class TilesetImporter
    {
        public static void ImportTileset(AssetImportContext ctx)
        {
            var dto = VulcanusImportHelpers.LoadDto<TilesetDto>(ctx.assetPath);

            var projectAssetPath = VulcanusImportHelpers.FindProjectAssetPath(ctx.assetPath);
            VulcanusProject project = null;
            var tileSize = 16;
            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                VulcanusImportHelpers.AddDependency(ctx, projectAssetPath);
                project = AssetDatabase.LoadAssetAtPath<VulcanusProject>(projectAssetPath);
                tileSize = project != null
                    ? Mathf.Max(1, project.TileSize)
                    : VulcanusImportHelpers.GetProjectTileSize(projectAssetPath);
            }

            var tilesetId = !string.IsNullOrEmpty(dto.Id) ? dto.Id : VulcanusImportHelpers.GetBaseName(ctx.assetPath);
            var displayName = !string.IsNullOrEmpty(dto.Name) ? dto.Name : tilesetId;
            var columns = Math.Max(1, dto.Columns);
            var tileCount = Math.Max(0, dto.TileCount);

            var spriteSheetAssetPath =
                VulcanusImportHelpers.ResolveAssetReferencePath(ctx.assetPath, dto.SpriteSheet, projectAssetPath);
            if (!string.IsNullOrEmpty(spriteSheetAssetPath))
                VulcanusImportHelpers.AddDependency(ctx, spriteSheetAssetPath);

            if (!string.IsNullOrEmpty(spriteSheetAssetPath))
                EnsureTextureReadable(spriteSheetAssetPath);

            var texture = !string.IsNullOrEmpty(spriteSheetAssetPath)
                ? AssetDatabase.LoadAssetAtPath<Texture2D>(spriteSheetAssetPath)
                : null;

            if (!texture && tileCount > 0)
                throw new InvalidOperationException($"Tileset '{tilesetId}' requires sprite sheet '{dto.SpriteSheet}'. Check its owner-relative or project-relative path.");

            if (texture && AssetImporter.GetAtPath(spriteSheetAssetPath) is AsepriteImporter &&
                (texture.width < columns * tileSize || texture.height < ((tileCount + columns - 1) / columns) * tileSize))
                throw new InvalidOperationException($"Tileset '{tilesetId}' needs a {columns * tileSize}x{((tileCount + columns - 1) / columns) * tileSize} sheet, but Aseprite imported {texture.width}x{texture.height}. Check transparent canvas cropping, frame count and texture size limits; tile indices require the original grid.");

            var twinSheets = SeasonTwinSheets(ctx, tilesetId, columns, tileCount, projectAssetPath);

            var tiles = new VulcanusTile[tileCount];
            for (var i = 0; i < tileCount; i++)
            {
                var tile = ScriptableObject.CreateInstance<VulcanusTile>();
                tile.name = $"tile_{i:D4}";

                dto.Tiles.TryGetValue(i.ToString(), out var meta);
                var terrainId = meta?.Terrain ?? GetFirstTerrainCorner(meta);
                var tags = meta?.Tags?.ToArray() ?? Array.Empty<string>();
                var collisionKind = ParseCollisionKind(meta?.Collision);
                var tileId = !string.IsNullOrEmpty(meta?.Id) ? meta.Id : $"{tilesetId}_{i}";
                var tilePivotY = meta?.PivotY ?? 1f;
                var waterType = "None";
                // Tilesets are not schema-validated on import, so enforce the authored range here.
                if (meta?.NavigationCost is { } navigationCost &&
                    (navigationCost < NavigationCostGrid.MinCost || navigationCost > NavigationCostGrid.MaxCost))
                    throw new FormatException(
                        $"Tile {i}: navigationCost must be {NavigationCostGrid.MinCost}..{NavigationCostGrid.MaxCost}, got {navigationCost}.");

                // Use "grid" collision if "Full" mode was selected
                if (collisionKind == VulcanusCollisionKind.Full)
                {
                    tile.colliderType = UnityEngine.Tilemaps.Tile.ColliderType.Grid;
                }

                VulcanusTile.VulcanusTileProperty[] metaProps = null;
                if (meta?.Properties != null && meta.Properties.Count > 0)
                {
                    var list = new List<VulcanusTile.VulcanusTileProperty>();
                    for (int p = 0; p < meta.Properties.Count; p++)
                    {
                        var pi = meta.Properties[p];
                        if (pi == null) continue;

                        if (string.Equals(pi.Key, "waterType", StringComparison.OrdinalIgnoreCase))
                        {
                            if (pi.Value?.Type != JTokenType.String ||
                                string.IsNullOrWhiteSpace(pi.Value.ToObject<string>()))
                                throw new FormatException($"Tile {i}: waterType must be a non-empty enum string (use 'None' for no water).");
                            waterType = pi.Value.ToObject<string>();
                            continue;
                        }

                        if (string.Equals(pi.Key, "isFreshwater", StringComparison.OrdinalIgnoreCase) &&
                            pi.Value?.Type != JTokenType.Boolean)
                            throw new FormatException($"Tile {i}: isFreshwater must be a boolean.");

                        var applied = VulcanusImportHelpers.TryApplyPropertyToObject(tile, pi.Key, pi.Value);
                        if (applied) continue;

                        list.Add(new VulcanusTile.VulcanusTileProperty
                        {
                            key = pi.Key,
                            jsonValue = pi.Value != null
                                ? pi.Value.ToString(Formatting.None)
                                : null
                        });
                    }

                    if (list.Count > 0)
                        metaProps = list.ToArray();
                }

                // Parse collision shapes before creating the sprite so we can bake physics shape in.
                VulcanusTile.CollisionShape[] shapes = ParseCollisionShapes(meta?.Collision);

                var sprite = CreateSpriteForTile(texture, columns, tileSize, i, tilePivotY);
                if (sprite != null)
                {
                    sprite.name = $"sprite_{i:D4}";
                    // Bake per-tile collision into the sprite's physics shape.
                    // TilemapCollider2D uses this when colliderType == Sprite.
                    // if (collisionKind == VulcanusCollisionKind.Full)
                    // {
                    //     // Full tile — one rect covering the whole tile in local tile units.
                    //     sprite.OverridePhysicsShape(new List<Vector2[]>
                    //     {
                    //         new Vector2[]
                    //         {
                    //             new Vector2(0, 0), new Vector2(1, 0),
                    //             new Vector2(1, 1), new Vector2(0, 1)
                    //         }
                    //     });
                    // }
                    if (collisionKind == VulcanusCollisionKind.Complex && shapes != null && shapes.Length > 0)
                    {
                        var physicsShapes = BuildPhysicsShapesForSprite(shapes, tileSize);
                        if (physicsShapes.Count > 0)
                            sprite.OverridePhysicsShape(physicsShapes);
                    }

                    ctx.AddObjectToAsset($"sprite_{i}", sprite);
                    tile.sprite = sprite;
                }

                tile.Configure(i, tileId, terrainId,
                    VulcanusImportHelpers.MapTerrainIdToTerrainType(terrainId), tags, collisionKind,
                    metaProps, tilePivotY, shapes, waterType, meta?.NavigationCost ?? 0);

                // Use Sprite collider type so TilemapCollider2D picks up the overridden physics shape.
                if (collisionKind == VulcanusCollisionKind.Complex && sprite != null)
                    tile.colliderType = UnityEngine.Tilemaps.Tile.ColliderType.Sprite;

                if (twinSheets.Count > 0)
                    tile.ConfigureSeasonSprites(CreateSeasonSprites(ctx, twinSheets, columns, tileSize, i, tilePivotY,
                        collisionKind == VulcanusCollisionKind.Complex ? shapes : null));

                tiles[i] = tile;
                ctx.AddObjectToAsset($"tile_{i}", tile);
            }

            var tileset = ScriptableObject.CreateInstance<VulcanusTilesetAsset>();
            tileset.name = displayName;
            tileset.Configure(tilesetId, displayName, texture, columns, tileCount, tileSize, tiles);

            ctx.AddObjectToAsset("tileset", tileset);
            ctx.SetMainObject(tileset);
        }

        // ── Season twins ──────────────────────────────────────────────────────

        // The sheets of this tileset's season twins, which must share its grid.
        private static Dictionary<Season, Texture2D> SeasonTwinSheets(AssetImportContext ctx, string tilesetId,
            int columns, int tileCount, string projectAssetPath)
        {
            ctx.DependsOnCustomDependency(SeasonTwins.DependencyName);
            var sheets = new Dictionary<Season, Texture2D>();
            foreach (var (path, twin) in SeasonTwins.Of(tilesetId))
            {
                ctx.DependsOnSourceAsset(path);
                if (!Enum.TryParse<Season>(twin.Season, true, out var season))
                    throw new FormatException($"Season twin '{twin.Id}' has unknown season '{twin.Season}'.");
                if (twin.Columns != columns || twin.TileCount != tileCount)
                    throw new InvalidOperationException(
                        $"Season twin '{twin.Id}' needs the grid of '{tilesetId}': {columns} columns and {tileCount} tiles.");
                if (sheets.ContainsKey(season))
                    throw new InvalidOperationException($"Tileset '{tilesetId}' has more than one {season} twin.");
                var sheetPath = VulcanusImportHelpers.ResolveAssetReferencePath(path, twin.SpriteSheet, projectAssetPath)
                    ?? throw new InvalidOperationException($"Season twin '{twin.Id}' requires sprite sheet '{twin.SpriteSheet}'.");
                VulcanusImportHelpers.AddDependency(ctx, sheetPath);
                EnsureTextureReadable(sheetPath);
                sheets.Add(season, AssetDatabase.LoadAssetAtPath<Texture2D>(sheetPath));
            }
            return sheets;
        }

        // A tile's sprite per season, where the twin's tile has visible pixels; it collides like the base tile.
        private static Sprite[] CreateSeasonSprites(AssetImportContext ctx, Dictionary<Season, Texture2D> twinSheets,
            int columns, int tileSize, int tileIndex, float pivotY, VulcanusTile.CollisionShape[] complexShapes)
        {
            var sprites = new Sprite[Enum.GetValues(typeof(Season)).Length];
            foreach (var (season, sheet) in twinSheets)
            {
                var sprite = CreateSpriteForTile(sheet, columns, tileSize, tileIndex, pivotY);
                if (sprite == null) continue;
                sprite.name = $"sprite_{tileIndex:D4}_{season}";
                if (complexShapes is { Length: > 0 })
                {
                    var physicsShapes = BuildPhysicsShapesForSprite(complexShapes, tileSize);
                    if (physicsShapes.Count > 0) sprite.OverridePhysicsShape(physicsShapes);
                }
                ctx.AddObjectToAsset(sprite.name, sprite);
                sprites[(int)season] = sprite;
            }
            return sprites;
        }

        // ── Sprite physics shapes ─────────────────────────────────────────────


        // Schema coords are normalized [0,1] with y=0 at top.
        // OverridePhysicsShape coords are in pixels from the sprite's bottom-left (not pivot-relative).
        // Unity handles the pivot offset internally when placing the collider.
        //   x_px = sx * tileSize
        //   y_px = (1 - sy) * tileSize + tileSize/2   (flip schema y; origin is half tile below bottom)
        private static List<Vector2[]> BuildPhysicsShapesForSprite(
            VulcanusTile.CollisionShape[] shapes, int tileSize)
        {
            var result = new List<Vector2[]>();

            Vector2 ToLocal(float sx, float sy) =>
                new(sx * tileSize, (1f - sy) * tileSize + tileSize * 0.5f);

            foreach (var shape in shapes)
            {
                Vector2[] pts;
                if (shape.type == "polygon" && shape.points != null && shape.points.Length >= 3)
                {
                    pts = new Vector2[shape.points.Length];
                    for (int i = 0; i < shape.points.Length; i++)
                        pts[i] = ToLocal(shape.points[i].x, shape.points[i].y);
                }
                else if (shape.type == "rectangle")
                {
                    pts = new Vector2[]
                    {
                        ToLocal(shape.x,               shape.y),
                        ToLocal(shape.x + shape.width,  shape.y),
                        ToLocal(shape.x + shape.width,  shape.y + shape.height),
                        ToLocal(shape.x,               shape.y + shape.height),
                    };
                }
                else
                {
                    continue;
                }

                result.Add(pts);
            }

            return result;
        }

        // ── Tile helpers ──────────────────────────────────────────────────────

        private static Sprite CreateSpriteForTile(Texture2D texture, int columns, int tileSize, int tileIndex, float pivotY = 1f)
        {
            if (texture == null || tileSize <= 0 || columns <= 0) return null;

            var x = (tileIndex % columns) * tileSize;
            var y = texture.height - ((tileIndex / columns + 1) * tileSize);
            if (x < 0 || y < 0 || x + tileSize > texture.width || y + tileSize > texture.height) return null;

            try
            {
                var pixels = texture.GetPixels(x, y, tileSize, tileSize);
                var anyOpaque = false;
                const float AlphaEpsilon = 0.003f;
                for (int i = 0; i < pixels.Length; i++)
                {
                    if (pixels[i].a > AlphaEpsilon) { anyOpaque = true; break; }
                }
                if (!anyOpaque) return null;
            }
            catch { }

            var pivot = new Vector2(0.5f, Mathf.Clamp01(pivotY));
            return Sprite.Create(texture, new Rect(x, y, tileSize, tileSize), pivot, tileSize, 0,
                SpriteMeshType.FullRect);
        }

        private static VulcanusTile.CollisionShape[] ParseCollisionShapes(CollisionDto collision)
        {
            if (collision?.Shapes == null || collision.Shapes.Count == 0) return null;
            var list = new List<VulcanusTile.CollisionShape>();
            foreach (var s in collision.Shapes)
            {
                if (s == null) continue;
                var cs = new VulcanusTile.CollisionShape
                {
                    id = s.Id,
                    type = s.Type ?? "polygon",
                    x = s.X ?? 0f,
                    y = s.Y ?? 0f,
                    width = s.Width ?? 0f,
                    height = s.Height ?? 0f
                };
                if (s.Points != null && s.Points.Count > 0)
                {
                    var pts = new List<Vector2>();
                    foreach (var p in s.Points)
                    {
                        if (p == null || p.Count < 2) continue;
                        pts.Add(new Vector2(p[0], p[1]));
                    }
                    cs.points = pts.ToArray();
                }
                list.Add(cs);
            }
            return list.Count > 0 ? list.ToArray() : null;
        }

        internal static void EnsureTextureReadable(string assetPath)
        {
            var importer = AssetImporter.GetAtPath(assetPath);
            if (importer is AsepriteImporter aseprite)
            {
                // Tile IDs address the original canvas grid. AnimatedSprite packs cels
                // into an atlas, which changes both their coordinates and texture size.
                if (aseprite.importMode != FileImportModes.SpriteSheet ||
                    aseprite.layerImportMode != LayerImportModes.MergeFrame ||
                    aseprite.mosaicPadding != 0 || aseprite.spritePadding != 0)
                    throw new InvalidOperationException($"Tileset sheet '{assetPath}' uses a packed Aseprite import mode. Reimport the Aseprite source to apply Vulcanus sprite-sheet settings.");
                return;
            }
            var ti = importer as TextureImporter;
            if (ti == null || ti.isReadable) return;
            ti.isReadable = true;
            ti.SaveAndReimport();
        }

        private static string GetFirstTerrainCorner(TileMetaDto meta)
        {
            if (meta?.TerrainCorners == null) return null;
            return meta.TerrainCorners.FirstOrDefault(c => !string.IsNullOrEmpty(c));
        }

        private static VulcanusCollisionKind ParseCollisionKind(CollisionDto collision)
        {
            if (collision == null) return VulcanusCollisionKind.None;
            if (collision.Type.Equals("full", StringComparison.OrdinalIgnoreCase)) return VulcanusCollisionKind.Full;
            if (collision.Type.Equals("complex", StringComparison.OrdinalIgnoreCase))
                return VulcanusCollisionKind.Complex;
            return VulcanusCollisionKind.None;
        }
    }
}
