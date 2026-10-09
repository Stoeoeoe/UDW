using System.Collections.Generic;
using System.Reflection;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Vulcanus;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Tilemaps;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    [Category("MapLoading")]
    public sealed class VulcanusMapImporterTests
    {
        private readonly List<Object> _assets = new();
        private GameObject _root;
        private Tilemap _tilemap;
        private VulcanusTile _first;
        private VulcanusTile _second;
        private VulcanusTilesetAsset[] _tilesets;

        [SetUp]
        public void SetUp()
        {
            _root = new GameObject("Map importer tests", typeof(Grid));
            var child = new GameObject("Tiles", typeof(Tilemap));
            child.transform.SetParent(_root.transform, false);
            _tilemap = child.GetComponent<Tilemap>();
            _first = Asset<VulcanusTile>();
            _second = Asset<VulcanusTile>();
            var firstSet = Asset<VulcanusTilesetAsset>();
            firstSet.Configure("base:first", "First", null, 2, 2, 16, new[] { _first, _second });
            var lastSet = Asset<VulcanusTilesetAsset>();
            lastSet.Configure("base:last", "Last", null, 1, 1, 16, new[] { _second });
            // An unresolved reference must occupy its original index.
            _tilesets = new[] { firstSet, null, lastSet };
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_root);
            foreach (var asset in _assets) Object.DestroyImmediate(asset);
            _assets.Clear();
        }

        [TestCase("[[0,1],[-1,0]]")]
        [TestCase("{\"sparse\":true,\"entries\":[{\"x\":0,\"y\":0,\"v\":0},{\"x\":1,\"y\":0,\"v\":1},{\"x\":0,\"y\":1,\"v\":-1},{\"x\":1,\"y\":1,\"v\":0}]}")]
        public void DenseAndSparseDataDecodeTilesAndConvertTopDownCoordinates(string json)
        {
            Populate(JToken.Parse(json), 2);
            Assert.That(_tilemap.GetTile(new Vector3Int(0, 1, 0)), Is.SameAs(_first));
            Assert.That(_tilemap.GetTile(new Vector3Int(1, 1, 0)), Is.SameAs(_second));
            Assert.That(_tilemap.GetTile(new Vector3Int(0, 0, 0)), Is.Null);
            Assert.That(_tilemap.GetTile(new Vector3Int(1, 0, 0)), Is.SameAs(_first));
        }

        [Test]
        public void MissingTilesetSlotDoesNotShiftLaterEncodedReferences()
        {
            Populate(JToken.Parse("[[65536,131072]]"), 1);
            Assert.That(_tilemap.GetTile(Vector3Int.zero), Is.Null);
            Assert.That(_tilemap.GetTile(new Vector3Int(1, 0, 0)), Is.SameAs(_second));
        }

        [Test]
        public void InvalidTileNumbersAndMalformedDenseRowsAreSkipped()
        {
            Populate(JToken.Parse("[[2,196608,null,{},0],null]"), 2);
            for (var x = 0; x < 4; x++)
                Assert.That(_tilemap.GetTile(new Vector3Int(x, 1, 0)), Is.Null);
            Assert.That(_tilemap.GetTile(new Vector3Int(4, 1, 0)), Is.SameAs(_first));
            Assert.That(_tilemap.GetTile(Vector3Int.zero), Is.Null);
        }

        [Test]
        public void MalformedSparseEntriesAreSkippedWithoutLosingValidTiles()
        {
            Populate(JToken.Parse("{\"sparse\":true,\"entries\":[null,5,{\"x\":0,\"v\":0},{\"x\":1,\"y\":0},{\"x\":{},\"y\":0,\"v\":0},{\"x\":3,\"y\":0,\"v\":1}]}"), 1);
            Assert.That(_tilemap.GetUsedTilesCount(), Is.EqualTo(1));
            Assert.That(_tilemap.GetTile(new Vector3Int(3, 0, 0)), Is.SameAs(_second));
        }

        [TestCase("null")]
        [TestCase("{}")]
        [TestCase("{\"sparse\":false,\"entries\":[{\"x\":0,\"y\":0,\"v\":0}]}")]
        [TestCase("{\"sparse\":true}")]
        public void AbsentOrUnsupportedTileDataLeavesTilemapEmpty(string json)
        {
            Populate(JToken.Parse(json), 1);
            Assert.That(_tilemap.GetUsedTilesCount(), Is.Zero);
        }

        private void Populate(JToken data, int height)
        {
            // Exercise production import logic without invoking scene-generating asset postprocessors.
            typeof(MapImporter).GetMethod("PopulateTileLayer", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { _tilemap, data, height, _tilesets });
        }

        private T Asset<T>() where T : ScriptableObject
        {
            var asset = ScriptableObject.CreateInstance<T>();
            _assets.Add(asset);
            return asset;
        }
    }
}
