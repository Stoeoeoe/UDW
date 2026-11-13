using System.Collections.Generic;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Vulcanus;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    [Category("MapLoading")]
    public sealed class NavigationCostGridBuilderTests
    {
        // Tile indices: 0 road (1), 1 swamp (9), 2 decoration (no cost), 3 rug (5).
        private const int Road = 0, Swamp = 1, Decoration = 2, Rug = 3;
        private const int Width = 4, Height = 3, TileSize = 16;

        private readonly List<Object> _assets = new();
        private VulcanusTilesetAsset _tileset;

        [SetUp]
        public void SetUp()
        {
            var tiles = new[] { Tile(0, 1), Tile(1, 9), Tile(2, 0), Tile(3, 5) };
            _tileset = Create<VulcanusTilesetAsset>();
            _tileset.Configure("base:nav", "Nav", null, 1, 4, TileSize, tiles, new[]
            {
                new VulcanusTilesetAsset.ObjectDefinition
                {
                    id = "base:rug", tiles = new[]
                    {
                        new VulcanusTilesetAsset.ObjectTile { x = 0, y = 0, tileIndex = Rug },
                        new VulcanusTilesetAsset.ObjectTile { x = 1, y = 0, tileIndex = Decoration }
                    }
                }
            });
        }

        [TearDown]
        public void TearDown()
        {
            foreach (var asset in _assets) Object.DestroyImmediate(asset);
            _assets.Clear();
        }

        [Test]
        public void TileCostIsReadBackAndZeroMeansNotSet()
        {
            Assert.That(_tileset.Tiles[Road].TryGetNavigationCost(out var cost), Is.True);
            Assert.That(cost, Is.EqualTo(1));
            Assert.That(_tileset.Tiles[Decoration].TryGetNavigationCost(out _), Is.False);
        }

        [Test]
        public void CellsWithoutAnyCostUseTheDefault()
        {
            var grid = Build(Layer("terrain", 0, Rows((0, 0, null))));
            Assert.That(grid.GetCost(new Vector2Int(2, 1)), Is.EqualTo(NavigationCostGrid.DefaultCost));
        }

        [Test]
        public void CostsAreStoredInUnityCellsWithTheRowsFlipped()
        {
            // Vulcanus row 2 is the bottom row, which is Unity y 0.
            var grid = Build(Layer("terrain", 0, Rows((1, 2, Road), (3, 0, Swamp))));
            Assert.That(grid.GetCost(new Vector2Int(1, 0)), Is.EqualTo(1));
            Assert.That(grid.GetCost(new Vector2Int(3, 2)), Is.EqualTo(9));
        }

        [Test]
        public void AHigherLayerWithACostOverridesTerrainAndATileWithoutOneIsTransparent()
        {
            var grid = Build(
                Layer("terrain", 0, Rows((0, 2, Road), (1, 2, Road))),
                Layer("visual", 5, Rows((0, 2, Swamp), (1, 2, Decoration))));
            Assert.That(grid.GetCost(new Vector2Int(0, 0)), Is.EqualTo(9));
            Assert.That(grid.GetCost(new Vector2Int(1, 0)), Is.EqualTo(1));
        }

        [Test]
        public void TerrainIsTheBaseEvenWhenItsZOrderIsAboveOtherLayers()
        {
            var grid = Build(
                Layer("terrain", 50, Rows((0, 0, Road), (1, 0, Road))),
                Layer("visual", 1, Rows((0, 0, Swamp))));
            Assert.That(grid.GetCost(new Vector2Int(0, 2)), Is.EqualTo(9));
            Assert.That(grid.GetCost(new Vector2Int(1, 2)), Is.EqualTo(1));
        }

        [Test]
        public void LayersApplyInAscendingZOrderRegardlessOfArrayOrder()
        {
            var grid = Build(
                Layer("visual", 8, Rows((2, 0, Swamp))),
                Layer("visual", 2, Rows((2, 0, Rug))));
            Assert.That(grid.GetCost(new Vector2Int(2, 2)), Is.EqualTo(9));
        }

        [Test]
        public void InvisibleLayersAreIgnored()
        {
            var hidden = Layer("visual", 9, Rows((0, 0, Swamp)));
            hidden.Visible = false;
            var grid = Build(Layer("terrain", 0, Rows((0, 0, Road))), hidden);
            Assert.That(grid.GetCost(new Vector2Int(0, 2)), Is.EqualTo(1));
        }

        [Test]
        public void SparseLayersApplyLikeDenseLayers()
        {
            var sparse = new LayerDto
            {
                Kind = "visual", ZOrder = 1,
                Data = JToken.Parse("{\"sparse\":true,\"entries\":[{\"x\":3,\"y\":1,\"v\":" + Swamp + "}]}")
            };
            Assert.That(Build(sparse).GetCost(new Vector2Int(3, 1)), Is.EqualTo(9));
        }

        [Test]
        public void ObjectInstancesApplyTheirTileCostsAtTheInstanceOffsetAndSkipCostlessTiles()
        {
            var objects = new LayerDto
            {
                Kind = "object", ZOrder = 3,
                ObjectInstances = new List<MapObjectInstanceDto>
                {
                    new() { Id = "r", TilesetId = "base:nav", ObjectDefinitionId = "base:rug", X = 16, Y = 16 }
                }
            };
            var grid = Build(Layer("terrain", 0, Rows((2, 1, Road))), objects);
            Assert.That(grid.GetCost(new Vector2Int(1, 1)), Is.EqualTo(5)); // rug tile
            Assert.That(grid.GetCost(new Vector2Int(2, 1)), Is.EqualTo(1)); // decoration keeps the terrain below
        }

        private NavigationCostGrid Build(params LayerDto[] layers) =>
            NavigationCostGridBuilder.Build(layers, new[] { _tileset }, new List<MapCollisionDto>(), Width, Height, TileSize);

        private static LayerDto Layer(string kind, int zOrder, JArray data) =>
            new() { Kind = kind, ZOrder = zOrder, Data = data };

        // Dense Vulcanus data (top-down rows, tileset index 0 in the high bits) with the given tiles set.
        private static JArray Rows(params (int x, int y, int? tile)[] tiles)
        {
            var rows = new JArray();
            for (var y = 0; y < Height; y++)
            {
                var row = new JArray();
                for (var x = 0; x < Width; x++) row.Add(JValue.CreateNull());
                rows.Add(row);
            }
            foreach (var (x, y, tile) in tiles) rows[y][x] = tile.HasValue ? new JValue(tile.Value) : JValue.CreateNull();
            return rows;
        }

        private VulcanusTile Tile(int index, int cost)
        {
            var tile = Create<VulcanusTile>();
            tile.Configure(index, $"tile_{index}", null, TerrainType.Invalid, null, VulcanusCollisionKind.None,
                tileNavigationCost: cost);
            return tile;
        }

        private T Create<T>() where T : ScriptableObject
        {
            var asset = ScriptableObject.CreateInstance<T>();
            _assets.Add(asset);
            return asset;
        }
    }
}
