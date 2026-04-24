using System;
using System.Collections.Generic;
using System.Linq;
using Core.Tile.Vulcanus;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Rendering;

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

                VulcanusTile.VulcanusTileProperty[] metaProps = null;
                if (meta?.Properties != null && meta.Properties.Count > 0)
                {
                    var list = new List<VulcanusTile.VulcanusTileProperty>();
                    for (int p = 0; p < meta.Properties.Count; p++)
                    {
                        var pi = meta.Properties[p];
                        if (pi == null) continue;

                        var applied = VulcanusImportHelpers.TryApplyPropertyToObject(tile, pi.Key, pi.Value);
                        if (applied) continue;

                        list.Add(new VulcanusTile.VulcanusTileProperty
                        {
                            key = pi.Key,
                            jsonValue = pi.Value != null
                                ? pi.Value.ToString(Newtonsoft.Json.Formatting.None)
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
                    if (collisionKind == VulcanusCollisionKind.Full)
                    {
                        // Full tile — one rect covering the whole tile in local tile units.
                        sprite.OverridePhysicsShape(new List<Vector2[]>
                        {
                            new Vector2[]
                            {
                                new Vector2(0, 0), new Vector2(1, 0),
                                new Vector2(1, 1), new Vector2(0, 1)
                            }
                        });
                    }
                    else if (collisionKind == VulcanusCollisionKind.Complex && shapes != null && shapes.Length > 0)
                    {
                        var physicsShapes = BuildPhysicsShapesForSprite(shapes, tileSize, tilePivotY);
                        if (physicsShapes.Count > 0)
                            sprite.OverridePhysicsShape(physicsShapes);
                    }

                    ctx.AddObjectToAsset($"sprite_{i}", sprite);
                    tile.sprite = sprite;
                }

                tile.Configure(i, tileId, terrainId,
                    VulcanusImportHelpers.MapTerrainIdToTerrainType(terrainId, project), tags, collisionKind,
                    metaProps, tilePivotY, shapes);

                // Use Sprite collider type so TilemapCollider2D picks up the overridden physics shape.
                if (collisionKind != VulcanusCollisionKind.None && sprite != null)
                    tile.colliderType = UnityEngine.Tilemaps.Tile.ColliderType.Sprite;

                tiles[i] = tile;
                ctx.AddObjectToAsset($"tile_{i}", tile);
            }

            var objectDefs = BuildObjectDefinitions(dto);

            if (texture != null && objectDefs != null && objectDefs.Length > 0)
                CreateObjectAssets(objectDefs, tiles, texture, columns, tileSize, ctx);

            var tileset = ScriptableObject.CreateInstance<VulcanusTilesetAsset>();
            tileset.name = displayName;
            tileset.Configure(tilesetId, displayName, texture, columns, tileCount, tileSize, tiles, objectDefs);

            ctx.AddObjectToAsset("tileset", tileset);
            ctx.SetMainObject(tileset);
        }

        // ── Sprite physics shapes ─────────────────────────────────────────────

        // Schema points are normalized [0,1] per tile, origin at top-left of the tile.
        // Sprite.OverridePhysicsShape uses sprite-local space: pivot = (0,0), x+ right, y+ up,
        // units = world units (i.e. pixels / PPU = pixels / tileSize).
        // Tile sprite pivot is (0.5, pivotY), so the tile rect's bottom-left corner in local
        // space is at (-0.5, -pivotY) in world units.
        // Schema y=0 is the top of the tile, y=1 is the bottom (screen-down), so we flip y.
        private static List<Vector2[]> BuildPhysicsShapesForSprite(
            VulcanusTile.CollisionShape[] shapes, int tileSize, float pivotY)
        {
            // Pivot offset in world units (sprite local origin relative to tile rect bottom-left).
            float pivotOffsetX = -0.5f;          // pivot.x = 0.5 → shift left by 0.5
            float pivotOffsetY = -pivotY;        // pivot.y = pivotY → shift down by pivotY

            var result = new List<Vector2[]>();
            foreach (var sh in shapes)
            {
                if (sh == null) continue;

                if (string.Equals(sh.type, "polygon", StringComparison.OrdinalIgnoreCase) && sh.points?.Length >= 3)
                {
                    var pts = new Vector2[sh.points.Length];
                    for (int i = 0; i < sh.points.Length; i++)
                    {
                        // nx in [0,1] left→right, ny in [0,1] top→bottom (schema convention).
                        // Local x = nx - 0.5 + pivotOffsetX ... wait: nx=0 → tile left → local x = pivotOffsetX
                        // nx=1 → tile right → local x = pivotOffsetX + 1
                        // ny=0 → tile top → local y = pivotOffsetY + 1 (top is +1 from bottom in Unity y-up)
                        // ny=1 → tile bottom → local y = pivotOffsetY
                        var nx = sh.points[i].x;
                        var ny = sh.points[i].y;
                        pts[i] = new Vector2(pivotOffsetX + nx, pivotOffsetY + (1f - ny));
                    }
                    result.Add(pts);
                }
                else if (string.Equals(sh.type, "rectangle", StringComparison.OrdinalIgnoreCase))
                {
                    var w = sh.width > 0 ? sh.width : 1f;
                    var h = sh.height > 0 ? sh.height : 1f;
                    var ox = pivotOffsetX + sh.x;
                    var oy = pivotOffsetY + (1f - sh.y - h); // flip y, anchor at top of rect
                    result.Add(new Vector2[]
                    {
                        new Vector2(ox, oy), new Vector2(ox + w, oy),
                        new Vector2(ox + w, oy + h), new Vector2(ox, oy + h)
                    });
                }
            }
            return result;
        }

        // ── Object assets: baked sprite + prefab with merged collider ─────────

        private static void CreateObjectAssets(
            VulcanusTilesetAsset.ObjectDefinition[] defs,
            VulcanusTile[] tiles,
            Texture2D texture,
            int columns,
            int tileSize,
            AssetImportContext ctx)
        {
            foreach (var def in defs)
            {
                if (def == null || def.tiles == null || def.tiles.Length == 0) continue;

                var minX = def.tiles.Min(t => t.x);
                var maxX = def.tiles.Max(t => t.x);
                var minY = def.tiles.Min(t => t.y);
                var maxY = def.tiles.Max(t => t.y);
                var widthTiles = maxX - minX + 1;
                var heightTiles = maxY - minY + 1;
                def.widthTiles = widthTiles;
                def.heightTiles = heightTiles;

                var bakeWidth = widthTiles * tileSize;
                var bakeHeight = heightTiles * tileSize;

                // Bake sprite sheet region into a flat texture.
                var baked = new Texture2D(bakeWidth, bakeHeight, TextureFormat.RGBA32, false);
                baked.SetPixels32(new Color32[bakeWidth * bakeHeight]);

                foreach (var t in def.tiles)
                {
                    var col = t.tileIndex % columns;
                    var row = t.tileIndex / columns;
                    var srcX = col * tileSize;
                    var srcY = texture.height - (row + 1) * tileSize;
                    if (srcX < 0 || srcY < 0 || srcX + tileSize > texture.width || srcY + tileSize > texture.height)
                        continue;
                    var pixels = texture.GetPixels(srcX, srcY, tileSize, tileSize);
                    var dstX = (t.x - minX) * tileSize;
                    var dstY = (maxY - t.y) * tileSize;
                    baked.SetPixels(dstX, dstY, tileSize, tileSize, pixels);
                }

                baked.Apply();
                baked.filterMode = FilterMode.Point;

                var humanName = !string.IsNullOrEmpty(def.name) ? def.name : def.id;
                baked.name = humanName + "_bakedTexture";

                // Pivot at bottom-center.
                var sprite = Sprite.Create(baked, new Rect(0, 0, bakeWidth, bakeHeight),
                    new Vector2(0.5f, 0f), tileSize, 0, SpriteMeshType.FullRect);
                sprite.name = humanName + "_bakedSprite";

                ctx.AddObjectToAsset(baked.name, baked);
                ctx.AddObjectToAsset(sprite.name, sprite);
                def.sprite = sprite;

                // Build prefab sub-asset.
                var prefab = BuildObjectPrefab(def, tiles, minX, maxX, minY, maxY,
                    widthTiles, heightTiles, sprite, humanName);
                if (prefab != null)
                {
                    prefab.name = humanName + "_prefab";
                    ctx.AddObjectToAsset(prefab.name, prefab);
                    def.prefab = prefab;
                }
            }
        }

        // Builds a GameObject prefab with SpriteRenderer + merged PolygonCollider2D.
        // All transforms are in world units (1 unit = 1 tile).
        // Object origin is bottom-center, matching the sprite pivot.
        private static GameObject BuildObjectPrefab(
            VulcanusTilesetAsset.ObjectDefinition def,
            VulcanusTile[] tiles,
            int minX, int maxX, int minY, int maxY,
            int widthTiles, int heightTiles,
            Sprite sprite,
            string humanName)
        {
            var go = new GameObject(humanName);

            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = sprite;
            sr.sortingLayerName = "Objects";
            sr.spriteSortPoint = SpriteSortPoint.Pivot;

            var sg = go.AddComponent<SortingGroup>();
            sg.sortingLayerName = "Objects";

            var ySort = go.AddComponent<Character.YSortByPosition>();
            ySort.Offset = -100;

            // Gather all per-tile collision shapes in object-local tile space.
            // Object local: x=0 is left edge, y=0 is bottom edge (matching sprite pivot).
            // Tile (gx, gy) in object grid (gx=0..widthTiles-1, gy=0..heightTiles-1, gy=0 at bottom).
            bool hasFull = false, hasComplex = false;
            var allPolygons = new List<Vector2[]>(); // already in world units

            foreach (var ot in def.tiles)
            {
                if (ot.tileIndex < 0 || ot.tileIndex >= tiles.Length) continue;
                var vtile = tiles[ot.tileIndex];
                if (vtile == null) continue;

                if (vtile.CollisionKind == VulcanusCollisionKind.None) continue;

                // Object-local tile grid position (y=0 at bottom).
                var gx = ot.x - minX;
                var gy = maxY - ot.y; // flip: ot.y=minY is the topmost tile → gy = heightTiles-1

                // Bottom-left corner of this tile in world units, relative to object origin (bottom-center).
                var tileOriginX = gx - widthTiles * 0.5f;
                var tileOriginY = (float)gy;

                if (vtile.CollisionKind == VulcanusCollisionKind.Full)
                {
                    hasFull = true;
                    allPolygons.Add(new Vector2[]
                    {
                        new Vector2(tileOriginX, tileOriginY),
                        new Vector2(tileOriginX + 1, tileOriginY),
                        new Vector2(tileOriginX + 1, tileOriginY + 1),
                        new Vector2(tileOriginX, tileOriginY + 1)
                    });
                }
                else if (vtile.CollisionKind == VulcanusCollisionKind.Complex)
                {
                    hasComplex = true;
                    var shapes = vtile.CollisionShapes;
                    if (shapes == null || shapes.Length == 0)
                    {
                        allPolygons.Add(new Vector2[]
                        {
                            new Vector2(tileOriginX, tileOriginY),
                            new Vector2(tileOriginX + 1, tileOriginY),
                            new Vector2(tileOriginX + 1, tileOriginY + 1),
                            new Vector2(tileOriginX, tileOriginY + 1)
                        });
                    }
                    else
                    {
                        foreach (var sh in shapes)
                        {
                            if (sh == null) continue;
                            if (string.Equals(sh.type, "polygon", StringComparison.OrdinalIgnoreCase) && sh.points?.Length >= 3)
                            {
                                var pts = new Vector2[sh.points.Length];
                                for (int pi = 0; pi < sh.points.Length; pi++)
                                {
                                    // Schema: nx/ny in [0,1], y=0 top, y=1 bottom of tile.
                                    // World: tileOriginY is the bottom of the tile (Unity y-up).
                                    pts[pi] = new Vector2(
                                        tileOriginX + sh.points[pi].x,
                                        tileOriginY + (1f - sh.points[pi].y));
                                }
                                allPolygons.Add(pts);
                            }
                            else if (string.Equals(sh.type, "rectangle", StringComparison.OrdinalIgnoreCase))
                            {
                                var w = sh.width > 0 ? sh.width : 1f;
                                var h = sh.height > 0 ? sh.height : 1f;
                                var ox = tileOriginX + sh.x;
                                var oy = tileOriginY + (1f - sh.y - h); // flip y, anchor at top of rect
                                allPolygons.Add(new Vector2[]
                                {
                                    new Vector2(ox, oy), new Vector2(ox + w, oy),
                                    new Vector2(ox + w, oy + h), new Vector2(ox, oy + h)
                                });
                            }
                        }
                    }
                }
            }

            if (allPolygons.Count == 0)
                return go;

            // Complex shapes are authored precisely — preserve every path as-is.
            // Only attempt merging for the all-full-tile case (rectangular grids) where
            // adjacent unit squares can be unioned into fewer larger rectangles.
            List<Vector2[]> finalPaths;
            if (!hasComplex && hasFull)
                finalPaths = MergeFullTileRects(allPolygons);
            else
                finalPaths = allPolygons;

            var poly = go.AddComponent<PolygonCollider2D>();
            poly.pathCount = finalPaths.Count;
            for (int i = 0; i < finalPaths.Count; i++)
                poly.SetPath(i, finalPaths[i]);

            return go;
        }

        // ── Rectangle merging (full-tile only) ───────────────────────────────
        // Each input polygon is a unit square at integer tile-grid positions.
        // We union them via a greedy row-sweep: merge horizontally within each row,
        // then merge vertically adjacent strips of equal width/x-range.

        private static List<Vector2[]> MergeFullTileRects(List<Vector2[]> unitSquares)
        {
            // Recover integer tile coords from the bottom-left corner of each unit square.
            var cells = new HashSet<(int x, int y)>();
            foreach (var sq in unitSquares)
            {
                // bottom-left is the min x,y vertex; coords may be fractional due to centering offset.
                var minX = sq.Min(p => p.x);
                var minY = sq.Min(p => p.y);
                // Round to nearest 0.5 step to handle the -widthTiles*0.5f offset cleanly.
                var ix = Mathf.RoundToInt(minX * 2);
                var iy = Mathf.RoundToInt(minY * 2);
                cells.Add((ix, iy));
            }

            // Greedy rectangle decomposition in half-tile units, then convert back to world coords.
            var remaining = new HashSet<(int, int)>(cells);
            var rects = new List<(int x, int y, int w, int h)>();

            while (remaining.Count > 0)
            {
                var (cx, cy) = remaining.First();
                // Extend right.
                int w = 1;
                while (remaining.Contains((cx + w, cy))) w++;
                // Extend up while all cells in the row exist.
                int h = 1;
                while (true)
                {
                    bool rowFull = true;
                    for (int dx = 0; dx < w; dx++)
                        if (!remaining.Contains((cx + dx, cy + h))) { rowFull = false; break; }
                    if (!rowFull) break;
                    h++;
                }
                // Remove consumed cells.
                for (int dy = 0; dy < h; dy++)
                    for (int dx = 0; dx < w; dx++)
                        remaining.Remove((cx + dx, cy + dy));
                rects.Add((cx, cy, w, h));
            }

            // Convert each merged rect back to world-space polygon (half-tile units → world units).
            const float s = 0.5f; // 1 half-tile = 0.5 world units
            var result = new List<Vector2[]>(rects.Count);
            foreach (var (rx, ry, rw, rh) in rects)
            {
                var x0 = rx * s;
                var y0 = ry * s;
                var x1 = (rx + rw) * s;
                var y1 = (ry + rh) * s;
                result.Add(new Vector2[] {
                    new Vector2(x0, y0), new Vector2(x1, y0),
                    new Vector2(x1, y1), new Vector2(x0, y1)
                });
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

        private static VulcanusTilesetAsset.ObjectDefinition[] BuildObjectDefinitions(TilesetDto dto)
        {
            if (dto.Objects == null || dto.Objects.Count == 0)
                return Array.Empty<VulcanusTilesetAsset.ObjectDefinition>();

            var defs = new VulcanusTilesetAsset.ObjectDefinition[dto.Objects.Count];
            for (var i = 0; i < dto.Objects.Count; i++)
            {
                var src = dto.Objects[i];
                var tileDefs = new VulcanusTilesetAsset.ObjectTile[src.Tiles?.Count ?? 0];
                for (var t = 0; t < tileDefs.Length; t++)
                {
                    tileDefs[t] = new VulcanusTilesetAsset.ObjectTile
                    {
                        x = src.Tiles[t].X,
                        y = src.Tiles[t].Y,
                        tileIndex = src.Tiles[t].TileIndex
                    };
                }
                defs[i] = new VulcanusTilesetAsset.ObjectDefinition
                {
                    id = src.Id,
                    name = src.Name,
                    tiles = tileDefs
                };
            }
            return defs;
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
            var ti = AssetImporter.GetAtPath(assetPath) as TextureImporter;
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
