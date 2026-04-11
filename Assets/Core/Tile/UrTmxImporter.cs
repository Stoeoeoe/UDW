#if UNITY_EDITOR && USE_SUPERTILED2UNITY
using System.Linq;
using MoreMountains.Tools;
using SuperTiled2Unity;
using SuperTiled2Unity.Editor;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile
{
    [AutoCustomTmxImporter()]
    public class UrTmxImporter : CustomTmxImporter
    {
        private readonly Color _plowedTilemapColor = new(1.0f, 1.0f, 1.0f, 0.5f);
        private readonly Color _irrigatedTilemapColor = new(1.0f, 1.0f, 1.0f, 0.5f);
        private readonly Color _overlayTilemapColor = new(1.0f, 1.0f, 1.0f, 0.5f);

        public override void TmxAssetImported(TmxAssetImportedArgs args)
        {
            // Replace tmx tiles with our own hierarchy:
            // We replace FarmLand with a top game object and then layer the different states
            var map = args.ImportedSuperMap;
            var layers = map.GetComponentsInChildren<SuperLayer>();
            var grid = map.transform.GetComponentInChildren<Grid>();
            var farmLandTilemapTransform = map.transform.MMFindDeepChildBreadthFirst("FarmLand");

            // New tilemaps for different farm states
            var farmLandPlowedTilemap = CreateAdditionalTilemap(grid, "FarmLand_Plowed", 10, _plowedTilemapColor);
            var farmLandIrrigatedTilemap =
                CreateAdditionalTilemap(grid, "FarmLand_Irrigated", 11, _irrigatedTilemapColor);

            // Overlay tilemap
            var overlayTilemap = CreateAdditionalTilemap(grid, "Overlay", 999, _overlayTilemapColor);

            if (!farmLandTilemapTransform)
            {
                return;
                // throw new Exception("No Terrain tilemap found in the imported map.");
            }


            var tilemap = farmLandTilemapTransform.GetComponent<Tilemap>();
            for (int x = 0; x < tilemap.size.x; x++)
            {
                for (int y = 0; y < tilemap.size.y; y++)
                {
                    // If the terrain_type == "FarmLand" we are on a farm tile
                    var tilePosition = new Vector3Int(x + tilemap.origin.x, y + tilemap.origin.y, 0);
                    if (tilemap.GetTile<TileBase>(tilePosition) is SuperTile superTile &&
                        superTile.GetPropertyValueAsEnum<TerrainType>("terrain_type") == TerrainType.FarmLand)
                    {
                        // TODO: Allow for pre-plowed, pre-irrigated tiles in Tiled, read from custom property here then
                    }

                    // Replace with our own farm tiles
                    // TODO: Not doing anything right now
                }
            }


            // Custom prefab imports (prefab replacement already took place)
            var entityLayer = layers.FirstOrDefault(l => l.name == "Entities") as SuperObjectLayer;
            if (entityLayer == null) return;

            //     
            // var locationLinks = map.GetComponentsInChildren<LocationLink>();
            // foreach (var locationLink in locationLinks)
            // {
            //     
            //     Object.DestroyImmediate(locationLink);
            // }
        }

        private Tilemap CreateAdditionalTilemap(Grid grid, string tilemapName, int sortOrder, Color color)
        {
            var tilemapGo = new GameObject(tilemapName);
            tilemapGo.transform.SetParent(grid.transform);
            tilemapGo.transform.localPosition = new Vector3(0, -1, 0); // Offset for grid (?)
            var tilemap = tilemapGo.AddComponent<Tilemap>();
            tilemap.color = color;
            var tilemapRenderer = tilemapGo.AddComponent<TilemapRenderer>();
            tilemapRenderer.sortingOrder = sortOrder;
            tilemapRenderer.sortOrder = TilemapRenderer.SortOrder.TopLeft;
            return tilemap;
        }
    }
}
#endif