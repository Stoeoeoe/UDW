using System;
using System.Linq;
using Core.Inventory;
using NUnit.Framework;
using UnityEditor;

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
            Assert.That(created.Select(catalog => catalog.GetType().Name),
                Is.EqualTo(new[] { "ItemCatalog", "SkillCatalog", "DeityCatalog", "PlantCatalog" }));
            Assert.That(DefaultCatalogAssets.CreateMissingCatalogs(_folder), Is.Empty);
            foreach (var catalog in created)
                Assert.That(AssetDatabase.LoadMainAssetAtPath(AssetDatabase.GetAssetPath(catalog)), Is.SameAs(catalog));
        }

        [Test]
        public void ExistingSelectionsAreNotTouched()
        {
            var catalog = (ItemCatalog)DefaultCatalogAssets.CreateMissingCatalogs(_folder)[0];
            var item = UnityEngine.ScriptableObject.CreateInstance<Core.Inventory.Editor.InventoryTestItem>();
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
            var other = UnityEngine.ScriptableObject.CreateInstance<Plants.PlantCatalog>();
            var path = _folder + "/ItemCatalog.asset";
            AssetDatabase.CreateAsset(other, path);
            Assert.Throws<InvalidOperationException>(() => DefaultCatalogAssets.CreateMissingCatalogs(_folder));
            Assert.That(AssetDatabase.LoadMainAssetAtPath(path), Is.SameAs(other));
        }
    }
}
