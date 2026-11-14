using System.Linq;
using Core.Catalogs.Editor;
using NUnit.Framework;
using UnityEditor;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>Every file of the test Vulcanus project imports; a failure logs an import error, which fails the test.</summary>
    public sealed class VulcanusFixtureImportTests
    {
        private const string Project = CatalogAssetDiscovery.TestFolder + "/Vulcanus";

        [Test]
        public void EveryFixtureFileImports()
        {
            var sources = AssetDatabase.FindAssets("", new[] { Project }).Select(AssetDatabase.GUIDToAssetPath).Distinct()
                .Where(path => AssetImporter.GetAtPath(path) is VulcanusImporterCoordinator).ToArray();
            Assert.That(sources, Is.Not.Empty);
            foreach (var path in sources)
            {
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
                Assert.That(AssetDatabase.LoadMainAssetAtPath(path), Is.Not.Null, path);
            }
        }
    }
}
