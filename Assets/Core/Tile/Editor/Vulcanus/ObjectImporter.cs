using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Tile.Vulcanus;
using Core.Tile.Water;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Rendering;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// Imports a Vulcanus object (*.object.json): bakes its tiles from the tileset into one sprite and a prefab with a
    /// merged collider. Maps place the prefab by the object's ID.
    /// </summary>
    internal static class ObjectImporter
    {
        public static void ImportObject(AssetImportContext ctx)
        {
            var dto = VulcanusSchema.Read<ObjectDto>(ctx);
            var projectAssetPath = VulcanusImportHelpers.FindProjectAssetPath(ctx.assetPath);
            if (!VulcanusImportHelpers.BuildTilesetIndex(ctx.assetPath, projectAssetPath).TryGetValue(dto.TilesetId, out var tilesetPath))
                throw new InvalidOperationException($"Object '{dto.Id}' references missing tileset '{dto.TilesetId}'.");
            VulcanusImportHelpers.AddDependency(ctx, tilesetPath);
            var tileset = AssetDatabase.LoadAssetAtPath<VulcanusTilesetAsset>(tilesetPath);
            if (!tileset)
                throw new InvalidOperationException($"Tileset '{dto.TilesetId}' at '{tilesetPath}' has not imported successfully.");

            var tiles = dto.Tiles
                .Select(tile => new VulcanusObjectAsset.ObjectTile { x = tile.X, y = tile.Y, tileIndex = tile.TileIndex })
                .ToArray();
            int widthTiles = 0, heightTiles = 0;
            GameObject prefab = null;
            if (tiles.Length > 0)
            {
                var minX = tiles.Min(t => t.x);
                var maxX = tiles.Max(t => t.x);
                var minY = tiles.Min(t => t.y);
                var maxY = tiles.Max(t => t.y);
                widthTiles = maxX - minX + 1;
                heightTiles = maxY - minY + 1;
                var sprite = BakeSprite(ctx, tiles, tileset, minX, maxY, widthTiles, heightTiles, dto.Name);
                prefab = BuildObjectPrefab(tiles, tileset.Tiles, minX, maxX, minY, maxY, widthTiles, heightTiles, sprite, dto.Name);
                prefab.name = dto.Name + "_prefab";
                ctx.AddObjectToAsset(prefab.name, prefab);
            }

            var asset = ScriptableObject.CreateInstance<VulcanusObjectAsset>();
            asset.name = dto.Name;
            asset.Configure(dto.Id, dto.Name, tileset, tiles, widthTiles, heightTiles, prefab);
            ctx.AddObjectToAsset("object", asset);
            ctx.SetMainObject(asset);
        }

        // Copies the object's tiles from the sheet into one texture, with the pivot at the bottom-centre.
        private static Sprite BakeSprite(AssetImportContext ctx, VulcanusObjectAsset.ObjectTile[] tiles,
            VulcanusTilesetAsset tileset, int minX, int maxY, int widthTiles, int heightTiles, string name)
        {
            var texture = tileset.SpriteSheet;
            var tileSize = tileset.TileSize;
            var columns = tileset.Columns;
            var bakeWidth = widthTiles * tileSize;
            var bakeHeight = heightTiles * tileSize;
            var baked = new Texture2D(bakeWidth, bakeHeight, TextureFormat.RGBA32, false);
            baked.SetPixels32(new Color32[bakeWidth * bakeHeight]);

            foreach (var t in tiles)
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
            baked.name = name + "_bakedTexture";

            var sprite = Sprite.Create(baked, new Rect(0, 0, bakeWidth, bakeHeight),
                new Vector2(0.5f, 0f), tileSize, 0, SpriteMeshType.FullRect);
            sprite.name = name + "_bakedSprite";

            ctx.AddObjectToAsset(baked.name, baked);
            ctx.AddObjectToAsset(sprite.name, sprite);
            return sprite;
        }

        // Builds a GameObject prefab with SpriteRenderer + merged PolygonCollider2D.
        // All transforms are in world units (1 unit = 1 tile).
        // Object origin is bottom-center, matching the sprite pivot.
        private static GameObject BuildObjectPrefab(
            VulcanusObjectAsset.ObjectTile[] objectTiles,
            VulcanusTile[] tiles,
            int minX, int maxX, int minY, int maxY,
            int widthTiles, int heightTiles,
            Sprite sprite,
            string humanName)
        {
            var go = new GameObject(humanName);
            go.SetActive(false);

            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = sprite;
            sr.sortingLayerName = "Objects";
            sr.spriteSortPoint = SpriteSortPoint.Pivot;
            go.AddComponent<WaterReflectionSource>().Configure(go.transform, new[] { sr });

            var sg = go.AddComponent<SortingGroup>();
            sg.sortingLayerName = "Objects";

            var ySort = go.AddComponent<YSortByPosition>();
            ySort.Offset = -100;

            // Gather all per-tile collision shapes in object-local tile space.
            // Object local: x=0 is left edge, y=0 is bottom edge (matching sprite pivot).
            // Tile (gx, gy) in object grid (gx=0..widthTiles-1, gy=0..heightTiles-1, gy=0 at bottom).
            bool hasFull = false, hasComplex = false;
            var allPolygons = new List<Vector2[]>(); // already in world units

            foreach (var ot in objectTiles)
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
            {
                go.SetActive(true);
                return go;
            }

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

            go.SetActive(true);
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
    }
}
