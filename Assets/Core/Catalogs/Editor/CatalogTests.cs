using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Reflection;
using Core.Inventory;
using Core.Inventory.Editor;
using Core.Spawning;
using Core.Location;
using Interaction.Dialog;
using NUnit.Framework;
using Plants;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;
using TestConfiguration = Core.Common.Editor.ConfigurationTestData;
using Object = UnityEngine.Object;

namespace Core.Catalogs.Editor
{
    public sealed class CatalogTests
    {
        private DefinitionCatalog _catalog;
        private InventoryTestItem _first;
        private InventoryTestItem _second;
        private string _folder;

        [SetUp]
        public void SetUp()
        {
            _folder = "Assets/__CatalogTests_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", _folder.Substring("Assets/".Length));
            _catalog = ScriptableObject.CreateInstance<DefinitionCatalog>();
            _first = CreateItem("first");
            _second = CreateItem("second");
            AssetDatabase.CreateAsset(_first, _folder + "/First.asset");
        }

        private static InventoryTestItem CreateItem(string id)
        {
            var item = ScriptableObject.CreateInstance<InventoryTestItem>();
            typeof(Core.Catalogs.DefinitionScriptableObject).GetField("<Id>k__BackingField", BindingFlags.NonPublic | BindingFlags.Instance)
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
        public void FamiliesHaveIndependentIdsAndIncludeDerivedDefinitions()
        {
            var location = ScriptableObject.CreateInstance<LocationData>();
            location.SetId("first");
            try
            {
                _catalog.Synchronize(new Object[] { _first, location });
                Assert.DoesNotThrow(() => CatalogValidation.Validate(_catalog, new Object[] { _first, location }));
                Assert.That(_catalog.Get<ItemDefinition>("first"), Is.SameAs(_first));
                Assert.That(_catalog.Get<InventoryTestItem>("first"), Is.SameAs(_first));
                Assert.That(_catalog.Get<LocationData>("first"), Is.SameAs(location));
                Assert.That(_catalog.All<ItemDefinition>(), Is.EqualTo(new[] { _first }));
                _catalog.SetEnabled(_first, false);
                Assert.That(_catalog.Get<ItemDefinition>("first"), Is.Null);
                Assert.That(_catalog.Require<LocationData>("first"), Is.SameAs(location));
                Assert.Throws<InvalidOperationException>(() => _catalog.Require<ItemDefinition>("first"));
            }
            finally { Object.DestroyImmediate(location); }
        }

        [Test]
        public void DiscoveryIsScopedAndNewEntriesDefaultToEnabled()
        {
            var discovered = CatalogDiscovery.Discover(typeof(ItemDefinition), _folder);
            Assert.That(discovered, Is.EqualTo(new Object[] { _first }));
            _catalog.Synchronize(discovered);
            Assert.That(_catalog.Get<ItemDefinition>("first"), Is.SameAs(_first));
            Assert.That(_catalog.Get<ItemDefinition>("second"), Is.Null);
            Assert.That(_catalog.Entries.Single().Enabled, Is.True);
        }

        [Test]
        public void RefreshPreservesDisabledEntriesAndInvalidatesCachedLookup()
        {
            _catalog.Synchronize(new Object[] { _first });
            Assert.That(_catalog.Get<ItemDefinition>("first"), Is.SameAs(_first));
            _catalog.SetEnabled(_first, false);
            Assert.That(_catalog.Get<ItemDefinition>("first"), Is.Null);
            AssetDatabase.CreateAsset(_second, _folder + "/Second.asset");
            _catalog.Synchronize(CatalogDiscovery.Discover(typeof(ItemDefinition), _folder));
            Assert.That(_catalog.Entries.Single(entry => entry.Definition == _first).Enabled, Is.False);
            Assert.That(_catalog.Get<ItemDefinition>("second"), Is.SameAs(_second));
            Assert.That(_catalog.Synchronize(CatalogDiscovery.Discover(typeof(ItemDefinition), _folder)), Is.False);
            _catalog.SetEnabled(_first, true);
            Assert.That(_catalog.Get<ItemDefinition>("first"), Is.SameAs(_first));
        }

        [Test]
        public void MovingWithinTheDiscoveryPathPreservesSelectionAndDeletedAssetsArePruned()
        {
            _catalog.Synchronize(CatalogDiscovery.Discover(typeof(ItemDefinition), _folder));
            _catalog.SetEnabled(_first, false);
            Assert.That(AssetDatabase.MoveAsset(_folder + "/First.asset", _folder + "/Renamed.asset"), Is.Empty);
            _catalog.Synchronize(CatalogDiscovery.Discover(typeof(ItemDefinition), _folder));
            Assert.That(_catalog.Entries.Single().Enabled, Is.False);
            AssetDatabase.DeleteAsset(_folder + "/Renamed.asset");
            _catalog.Synchronize(CatalogDiscovery.Discover(typeof(ItemDefinition), _folder));
            Assert.That(_catalog.Entries, Is.Empty);
        }

        [Test]
        public void InvalidDiscoveryDoesNotReplaceExistingEntries()
        {
            _catalog.Synchronize(CatalogDiscovery.Discover(typeof(ItemDefinition), _folder));
            typeof(Core.Catalogs.DefinitionScriptableObject).GetField("<Id>k__BackingField", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(_second, "first");
            AssetDatabase.CreateAsset(_second, _folder + "/Second.asset");
            Assert.Throws<InvalidOperationException>(() => CatalogDiscovery.Refresh(_catalog));
            Assert.That(_catalog.Entries.Count, Is.EqualTo(1));
            Assert.Throws<InvalidOperationException>(() => CatalogDiscovery.Discover(typeof(ItemDefinition), _folder + "/Missing"));
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
            var plant = ScriptableObject.CreateInstance<PlantData>();
            AssetDatabase.CreateAsset(plant, _folder + "/Plant.asset");
            Assert.That(CatalogDiscovery.Discover(typeof(PlantData)), Does.Contain(plant));
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
            AssetDatabase.CreateAsset(_second, _folder + "/Second.asset");
            _catalog.Synchronize(new Object[] { _first, _second });
            _catalog.SetEnabled(_first, false);
            var copy = ScriptableObject.CreateInstance<DefinitionCatalog>();
            try
            {
                EditorJsonUtility.FromJsonOverwrite(EditorJsonUtility.ToJson(_catalog), copy);
                Assert.That(copy.Get<ItemDefinition>("first"), Is.Null);
                Assert.That(copy.Get<ItemDefinition>("second"), Is.SameAs(_second));
            }
            finally { Object.DestroyImmediate(copy); }
        }

        [Test]
        public void TypewriterSoundLookupUsesItsIdNotTheAssetName()
        {
            var catalog = ScriptableObject.CreateInstance<DefinitionCatalog>();
            var sound = ScriptableObject.CreateInstance<TypewriterSound>();
            try
            {
                sound.name = "Different asset name";
                TestConfiguration.Set(sound, "Id", "test:voice");
                catalog.Synchronize(new Object[] { sound });
                Assert.That(catalog.Get<TypewriterSound>("test:voice"), Is.SameAs(sound));
                Assert.That(catalog.Get<TypewriterSound>(sound.name), Is.Null);
                catalog.SetEnabled(sound, false);
                Assert.That(catalog.Get<TypewriterSound>("test:voice"), Is.Null);
            }
            finally { Object.DestroyImmediate(catalog); Object.DestroyImmediate(sound); }
        }

        [UnityTest]
        public IEnumerator ImportedItemsRefreshCatalogAndInvalidateIdsWithoutManualRefresh()
        {
            var catalog = DefaultCatalogAssets.Load();
            var projectPath = _folder + "/Project.vproj";
            File.WriteAllText(projectPath,
                "{ \"version\": \"1.0\", \"name\": \"Items\", \"tileSize\": 16, \"defaultMapWidth\": 32, \"defaultMapHeight\": 32, " +
                "\"itemClasses\": [{ \"id\": \"test\", \"name\": \"Test\", \"className\": \"Plants.ProduceItem\", \"properties\": [] }] }");
            AssetDatabase.ImportAsset(projectPath, ImportAssetOptions.ForceSynchronousImport);
            var itemPath = _folder + "/Imported.vitm";
            WriteImportedItem(itemPath, "test:imported");
            yield return WaitFor(() => catalog.Get<ItemDefinition>("test:imported"));
            Assert.That(catalog.Get<ItemDefinition>("test:imported").Name, Is.EqualTo("Imported item"));

            WriteImportedItem(itemPath, "test:updated");
            yield return WaitFor(() => catalog.Get<ItemDefinition>("test:updated"));
            Assert.That(catalog.Get<ItemDefinition>("test:imported"), Is.Null);

            Assert.That(AssetDatabase.DeleteAsset(itemPath), Is.True);
            yield return WaitFor(() => catalog.Get<ItemDefinition>("test:updated") is null);
            Assert.That(catalog.Get<ItemDefinition>("test:updated"), Is.Null);
        }

        private static void WriteImportedItem(string path, string id)
        {
            File.WriteAllText(path,
                $"{{\"id\":\"{id}\",\"name\":\"Imported item\",\"category\":\"Test\",\"icon\":\"\",\"description\":\"\",\"classId\":\"test\",\"maxStackSize\":99}}");
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
        }

        private static IEnumerator WaitFor(Func<bool> ready)
        {
            var deadline = EditorApplication.timeSinceStartup + 10;
            while (!ready() && EditorApplication.timeSinceStartup < deadline) yield return null;
            Assert.That(ready(), Is.True, "The delayed automatic catalog refresh did not complete.");
        }
    }
}
