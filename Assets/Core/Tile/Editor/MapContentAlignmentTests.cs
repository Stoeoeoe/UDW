using System.IO;
using System.Linq;
using Core.Tile.Vulcanus;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Tilemaps;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    /// <summary>
    /// Content Vulcanus places by map pixels (anchors, objects, triggers) must sit where Vulcanus shows it relative to
    /// the tiles. Unity draws tile sprites half a cell below their grid cell, so the comparison is with the drawn tiles.
    /// </summary>
    public sealed class MapContentAlignmentTests
    {
        private const string MapId = "test:map-1";
        private const string MapSource = "Assets/Tests/Vulcanus/maps/map-1.vmap";
        private const int TileSize = 16;

        private GameObject _map;
        private Tilemap _terrain;
        private int _height;
        private JObject _source;

        [SetUp]
        public void SetUp()
        {
            var world = AssetDatabase.LoadAssetAtPath<VulcanusWorldCatalog>("Assets/Tests/Vulcanus/vulcan.project.world.asset");
            _map = Object.Instantiate(world.MapBindings.Single(binding => binding.MapId == MapId).MapPrefab);
            var imported = _map.GetComponentInChildren<VulcanusImportedMap>(true);
            _terrain = imported.TerrainTilemap;
            _height = imported.NavigationCosts.Height;
            _source = JObject.Parse(File.ReadAllText(MapSource));
        }

        [TearDown]
        public void TearDown() => Object.DestroyImmediate(_map);

        /// <summary>World position of a Vulcanus map pixel within the tile Unity draws for it.</summary>
        private Vector2 DrawnPixel(float pixelX, float pixelY)
        {
            var tile = new Vector2Int(Mathf.FloorToInt(pixelX / TileSize), Mathf.FloorToInt(pixelY / TileSize));
            var cell = new Vector3Int(tile.x, _height - 1 - tile.y, 0);
            var sprite = _terrain.GetSprite(cell);
            Assert.That(sprite, Is.Not.Null, $"Map {MapId} draws a terrain tile at Vulcanus tile {tile}.");
            // The sprite's pivot sits at the cell's tile anchor; its rect then gives the drawn top-left corner.
            var pivot = (Vector2)_terrain.CellToWorld(cell) + Vector2.Scale(_terrain.tileAnchor, _terrain.layoutGrid.cellSize);
            var topLeft = pivot - sprite.pivot / sprite.pixelsPerUnit + new Vector2(0f, sprite.rect.height / sprite.pixelsPerUnit);
            return topLeft + new Vector2(pixelX / TileSize - tile.x, -(pixelY / TileSize - tile.y));
        }

        [Test]
        public void AnchorsSitWhereVulcanusShowsThemOnTheDrawnTiles()
        {
            var anchors = _map.GetComponentsInChildren<VulcanusMapAnchor>(true).ToDictionary(anchor => anchor.AnchorId);
            var authored = (JArray)_source["spatialPrimitives"]!["anchors"];
            Assert.That(authored!, Is.Not.Empty);
            foreach (var anchor in authored)
            {
                var id = (string)anchor["id"];
                var expected = DrawnPixel((float)anchor["position"]![0], (float)anchor["position"]![1]);
                Assert.That(Vector2.Distance(anchors[id!].transform.position, expected), Is.LessThan(0.001f), $"Anchor '{id}'.");
            }
        }

        [Test]
        public void ObjectsStandOnTheDrawnTilesVulcanusShowsThemOn()
        {
            var tree = _source["layers"]!.SelectMany(layer => layer["objectInstances"] ?? new JArray())
                .First(instance => (string)instance["objectDefinitionId"] == "tree");
            var renderer = _map.GetComponentsInChildren<SpriteRenderer>(true)
                .Single(each => each.name == $"tree_{(string)tree["id"]}");
            var heightTiles = renderer.bounds.size.y;
            // Its bottom edge is where Vulcanus draws the bottom of the object's footprint.
            var bottom = DrawnPixel((float)tree["x"]!, (float)tree["y"]! + heightTiles * TileSize - 0.01f).y;
            Assert.That(renderer.bounds.min.y, Is.EqualTo(bottom).Within(0.01f));
        }
    }
}
