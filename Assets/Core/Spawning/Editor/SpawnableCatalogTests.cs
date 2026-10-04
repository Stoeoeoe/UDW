using System.Reflection;
using NUnit.Framework;
using UnityEngine;

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
            Assert.That(_catalog.HasValidIds, Is.False);
        }

        [Test]
        public void DuplicateIdsAreRejected()
        {
            SetPrefabs(CreatePrefab("base:chest"), CreatePrefab("base:chest"));
            Assert.That(_catalog.HasValidIds, Is.False);
        }

        [Test]
        public void MissingReferencesAreRejected()
        {
            SetPrefabs(new SpawnedObject[] { null });
            Assert.That(_catalog.HasValidIds, Is.False);
        }

        [Test]
        public void UniqueNamespacedIdsAreValid()
        {
            SetPrefabs(CreatePrefab("base:chest"), CreatePrefab("base:crate_small"), CreatePrefab("mymod:chest"));
            Assert.That(_catalog.HasValidIds, Is.True);
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

        private void SetPrefabs(params SpawnedObject[] prefabs) =>
            typeof(SpawnableCatalog).GetField("prefabs", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_catalog, prefabs);
    }
}
