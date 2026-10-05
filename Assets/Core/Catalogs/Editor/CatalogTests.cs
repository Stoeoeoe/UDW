using System;
using System.Linq;
using System.Reflection;
using Core.Inventory;
using Core.Inventory.Editor;
using Core.Spawning;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Catalogs.Editor
{
    public sealed class CatalogTestDefinitionCatalog : DefinitionCatalog<ItemDefinition>
    {
        public string Folder;
        public override string Path => Folder;
        protected override string GetDefinitionId(ItemDefinition definition) => definition.ItemId;
    }

    public sealed class CatalogTests
    {
        private CatalogTestDefinitionCatalog _catalog;
        private InventoryTestItem _first;
        private InventoryTestItem _second;
        private string _folder;

        [SetUp]
        public void SetUp()
        {
            _folder = "Assets/__CatalogTests_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", _folder.Substring("Assets/".Length));
            _catalog = ScriptableObject.CreateInstance<CatalogTestDefinitionCatalog>();
            _catalog.Folder = _folder;
            _first = CreateItem("first");
            _second = CreateItem("second");
            AssetDatabase.CreateAsset(_first, _folder + "/First.asset");
        }

        private static InventoryTestItem CreateItem(string id)
        {
            var item = ScriptableObject.CreateInstance<InventoryTestItem>();
            typeof(ItemDefinition).GetField("<ItemId>k__BackingField", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(item, id);
            return item;
        }

        [TearDown]
        public void TearDown()
        {
            // This exact test-owned folder is created above, never an authored content folder.
            AssetDatabase.DeleteAsset(_folder);
            if (_second) Object.DestroyImmediate(_second);
            Object.DestroyImmediate(_catalog);
        }

        [Test]
        public void DiscoveryIsScopedAndNewEntriesDefaultToEnabled()
        {
            var discovered = CatalogDiscovery.Discover(_catalog);
            Assert.That(discovered, Is.EqualTo(new Object[] { _first }));
            _catalog.Synchronize(discovered);
            Assert.That(_catalog.Get("first"), Is.SameAs(_first));
            Assert.That(_catalog.Get("second"), Is.Null);
            Assert.That(_catalog.Entries.Single().Enabled, Is.True);
        }

        [Test]
        public void RefreshPreservesDisabledEntriesAndInvalidatesCachedLookup()
        {
            _catalog.Synchronize(new Object[] { _first });
            Assert.That(_catalog.Get("first"), Is.SameAs(_first));
            _catalog.SetEnabled(_first, false);
            Assert.That(_catalog.Get("first"), Is.Null);
            AssetDatabase.CreateAsset(_second, _folder + "/Second.asset");
            _catalog.Synchronize(CatalogDiscovery.Discover(_catalog));
            Assert.That(_catalog.Entries.Single(entry => entry.Definition == _first).Enabled, Is.False);
            Assert.That(_catalog.Get("second"), Is.SameAs(_second));
            Assert.That(_catalog.Synchronize(CatalogDiscovery.Discover(_catalog)), Is.False);
            _catalog.SetEnabled(_first, true);
            Assert.That(_catalog.Get("first"), Is.SameAs(_first));
        }

        [Test]
        public void MovingWithinTheDiscoveryPathPreservesSelectionAndDeletedAssetsArePruned()
        {
            _catalog.Synchronize(CatalogDiscovery.Discover(_catalog));
            _catalog.SetEnabled(_first, false);
            Assert.That(AssetDatabase.MoveAsset(_folder + "/First.asset", _folder + "/Renamed.asset"), Is.Empty);
            _catalog.Synchronize(CatalogDiscovery.Discover(_catalog));
            Assert.That(_catalog.Entries.Single().Enabled, Is.False);
            AssetDatabase.DeleteAsset(_folder + "/Renamed.asset");
            _catalog.Synchronize(CatalogDiscovery.Discover(_catalog));
            Assert.That(_catalog.Entries, Is.Empty);
        }

        [Test]
        public void InvalidDiscoveryDoesNotReplaceExistingEntries()
        {
            _catalog.Synchronize(CatalogDiscovery.Discover(_catalog));
            typeof(ItemDefinition).GetField("<ItemId>k__BackingField", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(_second, "first");
            AssetDatabase.CreateAsset(_second, _folder + "/Second.asset");
            Assert.Throws<InvalidOperationException>(() => CatalogDiscovery.Refresh(_catalog));
            Assert.That(_catalog.Entries.Count, Is.EqualTo(1));
            _catalog.Folder = _folder + "/Missing";
            Assert.Throws<InvalidOperationException>(() => CatalogDiscovery.Discover(_catalog));
        }

        [Test]
        public void MissingReferencesAreRejectedAtTheSharedAuthoringBoundary()
        {
            _catalog.Synchronize(new Object[] { null });
            Assert.Throws<InvalidOperationException>(() => CatalogValidation.Validate(_catalog,
                _catalog.Entries.Select(entry => entry.Definition).ToArray()));
        }

        [Test]
        public void PlantDiscoveryIncludesDefinitionsOutsideResources()
        {
            var plant = ScriptableObject.CreateInstance<Plants.PlantData>();
            AssetDatabase.CreateAsset(plant, _folder + "/Plant.asset");
            var catalog = ScriptableObject.CreateInstance<Plants.PlantCatalog>();
            try
            {
                Assert.That(CatalogAssetDiscovery.Find(catalog.Path, catalog.DefinitionType), Does.Contain(plant));
            }
            finally { Object.DestroyImmediate(catalog); }
        }

        [Test]
        public void ComponentDiscoveryUsesRootPrefabComponentsOnly()
        {
            var root = new GameObject("Root spawnable");
            var childOnly = new GameObject("Child-only spawnable");
            root.SetActive(false);
            childOnly.SetActive(false);
            try
            {
                root.AddComponent<SpawnedObject>();
                var child = new GameObject("Child");
                child.transform.SetParent(childOnly.transform);
                child.AddComponent<SpawnedObject>();
                var prefab = PrefabUtility.SaveAsPrefabAsset(root, _folder + "/Root.prefab");
                PrefabUtility.SaveAsPrefabAsset(childOnly, _folder + "/ChildOnly.prefab");
                Assert.That(CatalogAssetDiscovery.Find(_folder, typeof(SpawnedObject)),
                    Is.EqualTo(new Object[] { prefab.GetComponent<SpawnedObject>() }));
            }
            finally
            {
                Object.DestroyImmediate(root);
                Object.DestroyImmediate(childOnly);
            }
        }

        [Test]
        public void EnabledChoicesAreSerializedWithTheCatalogAsset()
        {
            _catalog.Synchronize(new Object[] { _first, _second });
            _catalog.SetEnabled(_first, false);
            var copy = ScriptableObject.CreateInstance<CatalogTestDefinitionCatalog>();
            try
            {
                EditorJsonUtility.FromJsonOverwrite(EditorJsonUtility.ToJson(_catalog), copy);
                Assert.That(copy.Get("first"), Is.Null);
                Assert.That(copy.Get("second"), Is.SameAs(_second));
            }
            finally { Object.DestroyImmediate(copy); }
        }
    }
}
