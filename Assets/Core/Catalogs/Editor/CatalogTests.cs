using TestConfiguration = Core.Common.Editor.ConfigurationTestData;
using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Reflection;
using Core.Inventory;
using Core.Inventory.Editor;
using Core.Spawning;
using Interaction.Dialog;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Core.Catalogs.Editor
{
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
            typeof(ItemDefinition).GetField("_itemId", BindingFlags.NonPublic | BindingFlags.Instance)
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
            typeof(ItemDefinition).GetField("_itemId", BindingFlags.NonPublic | BindingFlags.Instance)
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
            AssetDatabase.CreateAsset(_second, _folder + "/Second.asset");
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

        [Test]
        public void SpeakerIdentityLookupIgnoresAssetNamesAndPreservesCaseInsensitiveMatching()
        {
            var catalog = ScriptableObject.CreateInstance<TypewriterSoundCatalog>();
            var sound = ScriptableObject.CreateInstance<TypewriterSound>();
            try
            {
                sound.name = "Different asset name";
                TestConfiguration.Set(sound, "ActorId", "Player");
                catalog.Synchronize(new Object[] { sound });
                Assert.That(catalog.Get("player"), Is.SameAs(sound));
                Assert.That(catalog.Get(sound.name), Is.Null);
                catalog.SetEnabled(sound, false);
                Assert.That(catalog.Get("PLAYER"), Is.Null);
            }
            finally { Object.DestroyImmediate(catalog); Object.DestroyImmediate(sound); }
        }

        [Test]
        public void SpeakerIdsThatDifferOnlyInCaseAreRejectedBeforeLookup()
        {
            var catalog = ScriptableObject.CreateInstance<TypewriterSoundCatalog>();
            var first = ScriptableObject.CreateInstance<TypewriterSound>();
            var second = ScriptableObject.CreateInstance<TypewriterSound>();
            try
            {
                TestConfiguration.Set(first, "ActorId", "Player");
                TestConfiguration.Set(second, "ActorId", "player");
                Assert.Throws<InvalidOperationException>(() =>
                    CatalogValidation.Validate(catalog, new Object[] { first, second }));
            }
            finally
            {
                Object.DestroyImmediate(catalog);
                Object.DestroyImmediate(first);
                Object.DestroyImmediate(second);
            }
        }

        [UnityTest]
        public IEnumerator ImportedItemsRefreshCatalogAndInvalidateIdsWithoutManualRefresh()
        {
            AssetDatabase.CreateAsset(_catalog, _folder + "/Catalog.asset");
            var projectPath = _folder + "/Project.vproj";
            File.WriteAllText(projectPath,
                "{\"itemClasses\":[{\"id\":\"test\",\"className\":\"Core.Inventory.Editor.InventoryTestItem\"}]}");
            AssetDatabase.ImportAsset(projectPath, ImportAssetOptions.ForceSynchronousImport);
            var itemPath = _folder + "/Imported.vitm";
            WriteImportedItem(itemPath, "imported");
            yield return WaitFor(() => _catalog.Get("imported"));
            Assert.That(_catalog.Get("imported").ItemName, Is.EqualTo("Imported item"));

            WriteImportedItem(itemPath, "updated");
            yield return WaitFor(() => _catalog.Get("updated"));
            Assert.That(_catalog.Get("imported"), Is.Null);

            Assert.That(AssetDatabase.DeleteAsset(itemPath), Is.True);
            yield return WaitFor(() => _catalog.Entries.Count == 1);
            Assert.That(_catalog.Get("updated"), Is.Null);
        }

        private static void WriteImportedItem(string path, string id)
        {
            File.WriteAllText(path,
                $"{{\"id\":\"{id}\",\"name\":\"Imported item\",\"classId\":\"test\",\"maxStackSize\":99}}");
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
