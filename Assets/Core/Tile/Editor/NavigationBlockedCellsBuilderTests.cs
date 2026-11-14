using System.Collections.Generic;
using System.Linq;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Vulcanus;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    /// <summary>The same cases as the Vulcanus route preview tests (app/src/lib/navigationPath.test.ts), baked by Unity.</summary>
    [Category("MapLoading")]
    public sealed class NavigationBlockedCellsBuilderTests
    {
        // Tile indices: 0 grass, 1 wall (full), 2 fence post (small centred polygon), 3 hedge (strip along the top edge),
        // 4 bench (rectangle across the middle).
        private const int Grass = 0, Wall = 1, Post = 2, Hedge = 3, Bench = 4;
        private const int Width = 4, Height = 2, TileSize = 16;

        private readonly List<Object> _assets = new();
        private VulcanusTilesetAsset _tileset;

        [SetUp]
        public void SetUp()
        {
            var tiles = new[]
            {
                Tile(Grass, VulcanusCollisionKind.None),
                Tile(Wall, VulcanusCollisionKind.Full),
                Tile(Post, VulcanusCollisionKind.Complex, Polygon(new Vector2(0.4f, 0.4f), new Vector2(0.6f, 0.4f), new Vector2(0.6f, 0.6f), new Vector2(0.4f, 0.6f))),
                Tile(Hedge, VulcanusCollisionKind.Complex, Polygon(new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(1f, 0.1f), new Vector2(0f, 0.1f))),
                Tile(Bench, VulcanusCollisionKind.Complex,
                    new VulcanusTile.CollisionShape { type = "rectangle", x = 0.1f, y = 0.45f, width = 0.8f, height = 0.1f })
            };
            _tileset = ScriptableObject.CreateInstance<VulcanusTilesetAsset>();
            _assets.Add(_tileset);
            _tileset.Configure("base:nav", "Nav", null, 1, 5, TileSize, tiles, null);
        }

        [TearDown]
        public void TearDown()
        {
            foreach (var asset in _assets) Object.DestroyImmediate(asset);
            _assets.Clear();
        }

        [Test]
        public void FullTilesAndShapesThatReachTheMiddleOfACellBlockIt()
        {
            var grid = Build(new[] { Layer("terrain", Row(Grass, Wall, Post, Hedge), Row(Bench, Grass, Grass, Grass)) });
            // A hedge along the tile's edge leaves the middle free.
            Assert.That(BlockedRow(grid, 0), Is.EqualTo(new[] { false, true, true, false }));
            Assert.That(BlockedRow(grid, 1), Is.EqualTo(new[] { true, false, false, false }), "Rectangle shapes count too.");
        }

        [Test]
        public void MapCollisionShapesBlockTheCellsUnderThem()
        {
            var collisions = new List<MapCollisionDto>
            {
                new() { Shape = "rectangle", Position = new List<float> { 0, 0 }, Size = new List<float> { 32, 16 } },
                new() { Shape = "circle", Position = new List<float> { 56, 24 }, Radius = 6 }
            };
            var grid = Build(new[] { Layer("terrain", Row(Grass, Grass, Grass, Grass), Row(Grass, Grass, Grass, Grass)) }, collisions);
            Assert.That(BlockedRow(grid, 0), Is.EqualTo(new[] { true, true, false, false }));
            Assert.That(BlockedRow(grid, 1), Is.EqualTo(new[] { false, false, false, true }));
        }

        [TestCase(0, 0, 4, 16, true)]
        [TestCase(12, 0, 4, 16, true)]
        [TestCase(0, 0, 16, 4, true)]
        [TestCase(0, 12, 16, 4, true)]
        [TestCase(0, 0, 4, 4, true)]
        [TestCase(0, 0, 3, 16, false)]
        [TestCase(13, 0, 3, 16, false)]
        public void MapCollisionTouchingTheFootprintBlocksButAGapStaysFree(int x, int y, int w, int h, bool expected)
        {
            var grid = Build(System.Array.Empty<LayerDto>(), new List<MapCollisionDto>
            {
                new() { Shape = "rectangle", Position = new List<float> { x, y }, Size = new List<float> { w, h } }
            });
            Assert.That(grid.IsBlocked(new Vector2Int(0, Height - 1)), Is.EqualTo(expected));
        }

        [Test]
        public void DrawnWaterBlocksCellsItMostlyCovers()
        {
            // Each pixel row: 25 water pixels (all of cell 0, 9 of 16 columns of cell 1), 7 dry, 7 water (cell 2), 25 dry.
            var rle = Enumerable.Repeat(new[] { 1, 25, 0, 7, 1, 7, 0, 25 }, Height * TileSize).SelectMany(run => run).ToList();
            var water = new LayerDto
            {
                Kind = "water", Visible = true,
                WaterBodies = new List<WaterBodyDto> { new() { Id = "pond" } },
                WaterMask = new WaterMaskDto { Width = Width * TileSize, Height = Height * TileSize, Rle = rle }
            };
            var grid = Build(new[] { water });
            Assert.That(BlockedRow(grid, 0), Is.EqualTo(new[] { true, true, false, false }));
            Assert.That(BlockedRow(grid, 1), Is.EqualTo(new[] { true, true, false, false }));
        }

        [Test]
        public void HiddenLayersAndCellsWithoutCollisionStayFree()
        {
            var hidden = Layer("terrain", Row(Wall, Wall, Wall, Wall), Row(Wall, Wall, Wall, Wall));
            hidden.Visible = false;
            var grid = Build(new[] { hidden });
            Assert.That(BlockedRow(grid, 0).Concat(BlockedRow(grid, 1)), Has.None.True);
        }

        [Test]
        public void BlockedCellsAreStoredInUnityCellsWithTheRowsFlipped()
        {
            var grid = Build(new[] { Layer("terrain", Row(Wall, Grass, Grass, Grass), Row(Grass, Grass, Grass, Grass)) });
            // Vulcanus row 0 is the top row, which is Unity y 1 here.
            Assert.That(grid.IsBlocked(new Vector2Int(0, 1)), Is.True);
            Assert.That(grid.IsBlocked(new Vector2Int(0, 0)), Is.False);
        }

        private NavigationCostGrid Build(LayerDto[] layers, List<MapCollisionDto> collisions = null) =>
            NavigationCostGridBuilder.Build(layers, new[] { _tileset }, collisions ?? new List<MapCollisionDto>(), Width, Height, TileSize);

        /// <summary>Blocked flags of one Vulcanus row (0 at the top).</summary>
        private static bool[] BlockedRow(NavigationCostGrid grid, int vulcanusRow) =>
            Enumerable.Range(0, Width).Select(x => grid.IsBlocked(new Vector2Int(x, Height - 1 - vulcanusRow))).ToArray();

        private static LayerDto Layer(string kind, params JArray[] rows) =>
            new() { Kind = kind, Visible = true, Data = new JArray(rows.Cast<object>().ToArray()) };

        private static JArray Row(params int[] tiles) => new(tiles.Cast<object>().ToArray());

        private static VulcanusTile.CollisionShape Polygon(params Vector2[] points) => new() { type = "polygon", points = points };

        private VulcanusTile Tile(int index, VulcanusCollisionKind collision, params VulcanusTile.CollisionShape[] shapes)
        {
            var tile = ScriptableObject.CreateInstance<VulcanusTile>();
            _assets.Add(tile);
            tile.Configure(index, $"tile_{index}", null, TerrainType.Invalid, null, collision, tileCollisionShapes: shapes);
            return tile;
        }
    }
}
