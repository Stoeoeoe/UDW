using System.Collections.Generic;
using Core.Location;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    [Category("MapLoading")]
    public sealed class VulcanusWorldCatalogTests
    {
        private readonly List<Object> _objects = new();
        private VulcanusWorldCatalog _catalog;
        private LocationData _village;
        private GameObject _prefab;

        [SetUp]
        public void SetUp()
        {
            _catalog = Asset<VulcanusWorldCatalog>();
            _village = Location("base:village");
            _prefab = new GameObject("Map catalog test prefab");
            _prefab.SetActive(false);
            _objects.Add(_prefab);
            Sync(new VulcanusWorldCatalog.MapBinding("base:map-1", _prefab, _village));
        }

        [TearDown]
        public void TearDown()
        {
            foreach (var obj in _objects) Object.DestroyImmediate(obj);
            _objects.Clear();
        }

        [TestCase("base:map-1")]
        [TestCase("BASE:MAP-1")]
        public void MapLookupResolvesPrefabAndLocation(string id)
        {
            Assert.That(_catalog.TryGetMapPrefabByMapId(id, out var prefab), Is.True);
            Assert.That(prefab, Is.SameAs(_prefab));
            Assert.That(_catalog.TryGetLocationDataByMapId(id, out var location), Is.True);
            Assert.That(location, Is.SameAs(_village));
        }

        [TestCase(null)]
        [TestCase("")]
        [TestCase(" ")]
        [TestCase("missing")]
        [TestCase("map-1")]
        public void MissingMapIdsReturnFalseAndNullWithoutDroppingNamespaces(string id)
        {
            Assert.That(_catalog.TryGetMapPrefabByMapId(id, out var prefab), Is.False);
            Assert.That(prefab, Is.Null);
            Assert.That(_catalog.TryGetLocationDataByMapId(id, out var location), Is.False);
            Assert.That(location, Is.Null);
        }

        [Test]
        public void LocationLookupUsesLocationIdRatherThanMapIdOrAssetIdentity()
        {
            var otherAsset = Location("BASE:VILLAGE");
            Assert.That(_catalog.TryGetMapPrefabForLocation(otherAsset, out var prefab), Is.True);
            Assert.That(prefab, Is.SameAs(_prefab));
        }

        [TestCase(null)]
        [TestCase("")]
        [TestCase("Assets/Scenes/Maps/Other.unity")]
        public void SceneRoutingUsesExplicitPathOrHandAuthoredLocationId(string path)
        {
            _village.scenePath = path;
            Assert.That(_village.ScenePath, Is.EqualTo(string.IsNullOrEmpty(path) ? _village.id : path));
            Assert.That(_village.id, Is.EqualTo("base:village"));
        }

        [Test]
        public void LocationLookupFallsBackToMapIdWhenNoLocationIsBound()
        {
            Sync(new VulcanusWorldCatalog.MapBinding("base:village", _prefab, null));
            Assert.That(_catalog.TryGetMapPrefabForLocation(_village, out var prefab), Is.True);
            Assert.That(prefab, Is.SameAs(_prefab));
        }

        [Test]
        public void LocationLookupSupportsBoundAssetsWithoutAnId()
        {
            _village.id = null;
            Sync(new VulcanusWorldCatalog.MapBinding("base:map-1", _prefab, _village));
            Assert.That(_catalog.TryGetMapPrefabForLocation(_village, out var prefab), Is.True);
            Assert.That(prefab, Is.SameAs(_prefab));
        }

        [Test]
        public void NullAndUnmappedLocationsDoNotResolve()
        {
            Assert.That(_catalog.TryGetMapPrefabForLocation(null, out var prefab), Is.False);
            Assert.That(prefab, Is.Null);
            Assert.That(_catalog.TryGetMapPrefabForLocation(Location("base:missing"), out prefab), Is.False);
            Assert.That(prefab, Is.Null);
        }

        [Test]
        public void DuplicateMapIdsKeepFirstBindingAndIgnoreInvalidEntries()
        {
            Sync(null, new VulcanusWorldCatalog.MapBinding(" ", _prefab, null),
                new VulcanusWorldCatalog.MapBinding("base:map-1", _prefab, _village),
                new VulcanusWorldCatalog.MapBinding("BASE:MAP-1", null, Location("base:other")));
            Assert.That(_catalog.TryGetMapPrefabByMapId("base:map-1", out var prefab), Is.True);
            Assert.That(prefab, Is.SameAs(_prefab));
            Assert.That(_catalog.TryGetLocationDataByMapId("base:map-1", out var location), Is.True);
            Assert.That(location, Is.SameAs(_village));
        }

        [Test]
        public void DuplicateLocationIdsKeepFirstBinding()
        {
            Sync(new VulcanusWorldCatalog.MapBinding("base:map-1", _prefab, _village),
                new VulcanusWorldCatalog.MapBinding("base:map-2", null, Location("BASE:VILLAGE")));
            Assert.That(_catalog.TryGetMapPrefabForLocation(Location("base:village"), out var prefab), Is.True);
            Assert.That(prefab, Is.SameAs(_prefab));
        }

        [Test]
        public void MissingPrefabDoesNotPreventLocationResolution()
        {
            Sync(new VulcanusWorldCatalog.MapBinding("base:map-1", null, _village));
            Assert.That(_catalog.TryGetMapPrefabByMapId("base:map-1", out var prefab), Is.False);
            Assert.That(prefab, Is.Null);
            Assert.That(_catalog.TryGetLocationDataByMapId("base:map-1", out var location), Is.True);
            Assert.That(location, Is.SameAs(_village));
        }

        [Test]
        public void SyncReplacesBothLookupCachesAndNullSyncClearsThem()
        {
            var nextLocation = Location("base:next");
            Sync(new VulcanusWorldCatalog.MapBinding("base:next-map", _prefab, nextLocation));
            Assert.That(_catalog.TryGetMapPrefabByMapId("base:map-1", out _), Is.False);
            Assert.That(_catalog.TryGetMapPrefabForLocation(_village, out _), Is.False);
            Assert.That(_catalog.TryGetMapPrefabForLocation(nextLocation, out _), Is.True);
            _catalog.ApplySyncData(null, null);
            Assert.That(_catalog.TryGetMapPrefabByMapId("base:next-map", out _), Is.False);
            Assert.That(_catalog.TryGetMapPrefabForLocation(nextLocation, out _), Is.False);
            Assert.That(_catalog.GetMappedLocations(), Is.Empty);
        }

        [Test]
        public void SyncAndPublicArraysDoNotExposeArraySlots()
        {
            var bindings = new[] { new VulcanusWorldCatalog.MapBinding("base:map-1", _prefab, _village) };
            _catalog.ApplySyncData(null, bindings);
            bindings[0] = null;
            _catalog.MapBindings[0] = null;
            Assert.That(_catalog.MapBindings[0], Is.Not.Null);
            Assert.That(_catalog.TryGetMapPrefabByMapId("base:map-1", out var prefab), Is.True);
            Assert.That(prefab, Is.SameAs(_prefab));
        }

        [Test]
        public void MappedLocationsExcludeNullsAndDuplicateBindings()
        {
            var other = Location("base:other");
            Sync(null, new VulcanusWorldCatalog.MapBinding("base:map-1", _prefab, _village),
                new VulcanusWorldCatalog.MapBinding("base:again", _prefab, _village),
                new VulcanusWorldCatalog.MapBinding("base:other", null, other),
                new VulcanusWorldCatalog.MapBinding("base:empty", null, null));
            Assert.That(_catalog.GetMappedLocations(), Is.EquivalentTo(new[] { _village, other }));
        }

        private void Sync(params VulcanusWorldCatalog.MapBinding[] bindings) => _catalog.ApplySyncData(null, bindings);

        private LocationData Location(string id)
        {
            var location = Asset<LocationData>();
            location.id = id;
            return location;
        }

        private T Asset<T>() where T : ScriptableObject
        {
            var asset = ScriptableObject.CreateInstance<T>();
            _objects.Add(asset);
            return asset;
        }
    }
}
