using System.Reflection;
using System;
using System.Linq;
using Core.Catalogs.Editor;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Spawning.Editor
{
    public sealed class SpawnableCatalogTests
    {
        private SpawnableCatalog _catalog;
        private GameObject _holder;

        [SetUp]
        public void SetUp()
        {
            _catalog = ScriptableObject.CreateInstance<SpawnableCatalog>();
            _holder = new GameObject("Catalog test prefabs");
            _holder.SetActive(false);
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_holder);
            Object.DestroyImmediate(_catalog);
        }

        [TestCase("")]
        [TestCase("chest")]
        [TestCase(":chest")]
        [TestCase("base:")]
        [TestCase("Base:chest")]
        [TestCase("base:big chest")]
        [TestCase("base:chest:extra")]
        public void InvalidIdsAreRejected(string id)
        {
            SetPrefabs(CreatePrefab(id));
            Assert.Throws<InvalidOperationException>(Validate);
        }

        [Test]
        public void UniqueNamespacedIdsAreValid()
        {
            SetPrefabs(CreatePrefab("base:chest"), CreatePrefab("base:crate_small"), CreatePrefab("mymod:chest"));
            Assert.DoesNotThrow(Validate);
        }

        private SpawnedObject CreatePrefab(string id)
        {
            var root = new GameObject("Test prefab");
            root.transform.SetParent(_holder.transform);
            var prefab = root.AddComponent<SpawnedObject>();
            typeof(SpawnedObject).GetField("prefabId", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(prefab, id);
            return prefab;
        }

        [Test]
        public void DisabledPrefabsAreExcludedFromSpawnerEnumeration()
        {
            var prefab = CreatePrefab("base:chest");
            SetPrefabs(prefab);
            _catalog.SetEnabled(prefab, false);
            Assert.That(_catalog.Prefabs, Is.Empty);
        }

        private void Validate() => CatalogValidation.Validate(_catalog,
            _catalog.Entries.Select(entry => entry.Definition).ToArray());

        private void SetPrefabs(params SpawnedObject[] prefabs) => _catalog.Synchronize(prefabs);
    }
}
