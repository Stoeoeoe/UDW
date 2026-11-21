using System;
using System.Linq;
using Character.Animations;
using Core.Inventory;
using Core.Inventory.Editor;
using Core.Spawning;
using NUnit.Framework;
using Plants;
using UnityEditor;
using UnityEngine;

namespace Core.Catalogs.Editor
{
    public sealed class DefaultCatalogAssetsTests
    {
        private string _folder;

        [SetUp]
        public void SetUp()
        {
            _folder = "Assets/__DefaultCatalogTests_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", _folder.Substring("Assets/".Length));
        }

        [TearDown]
        public void TearDown() => AssetDatabase.DeleteAsset(_folder);

        [Test]
        public void ReturnsOnlyNewCatalogsAndDoesNotRecreateExistingAssets()
        {
            var created = DefaultCatalogAssets.CreateMissingCatalogs(_folder);
            Assert.That(created.Count, Is.EqualTo(1));
            Assert.That(created.Single(), Is.TypeOf<DefinitionCatalog>());
            Assert.That(DefaultCatalogAssets.CreateMissingCatalogs(_folder), Is.Empty);
            foreach (var catalog in created)
                Assert.That(AssetDatabase.LoadMainAssetAtPath(AssetDatabase.GetAssetPath(catalog)), Is.SameAs(catalog));
        }

        [Test]
        public void ExistingSelectionsAreNotTouched()
        {
            var catalog = DefaultCatalogAssets.CreateMissingCatalogs(_folder).Single();
            var item = ScriptableObject.CreateInstance<InventoryTestItem>();
            AssetDatabase.CreateAsset(item, _folder + "/Item.asset");
            catalog.Synchronize(new[] { item });
            catalog.SetEnabled(item, false);
            DefaultCatalogAssets.CreateMissingCatalogs(_folder);
            Assert.That(catalog.Entries.Single().Definition, Is.SameAs(item));
            Assert.That(catalog.Entries.Single().Enabled, Is.False);
        }

        [Test]
        public void AnOccupiedPathIsNotOverwritten()
        {
            var other = ScriptableObject.CreateInstance<PlantData>();
            var path = _folder + "/DefinitionCatalog.asset";
            AssetDatabase.CreateAsset(other, path);
            Assert.Throws<InvalidOperationException>(() => DefaultCatalogAssets.CreateMissingCatalogs(_folder));
            Assert.That(AssetDatabase.LoadMainAssetAtPath(path), Is.SameAs(other));
        }
    }
}
