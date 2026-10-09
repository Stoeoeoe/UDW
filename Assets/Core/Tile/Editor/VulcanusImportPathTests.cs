using System;
using System.IO;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Core.Tile.Editor
{
    [Category("MapLoading")]
    public sealed class VulcanusImportPathTests
    {
        private string _root;
        private string _map;
        private string _project;

        [SetUp]
        public void SetUp()
        {
            // Keep disposable source files out of the import pipeline, then delete before refreshing.
            AssetDatabase.DisallowAutoRefresh();
            _root = "Assets/__MapLoaderTests_" + Guid.NewGuid().ToString("N");
            Directory.CreateDirectory(Absolute(_root + "/maps"));
            _map = _root + "/maps/map.vmap";
            _project = Write("game.vproj", "{\"tileSize\":24}");
        }

        [TearDown]
        public void TearDown()
        {
            try
            {
                if (_root == null) return;
                var absolute = Absolute(_root);
                var assets = Path.GetFullPath(Application.dataPath) + Path.DirectorySeparatorChar;
                Assert.That(absolute.StartsWith(assets, StringComparison.OrdinalIgnoreCase), Is.True);
                Assert.That(Path.GetFileName(absolute), Does.StartWith("__MapLoaderTests_"));
                if (Directory.Exists(absolute)) Directory.Delete(absolute, true);
                if (File.Exists(absolute + ".meta")) File.Delete(absolute + ".meta");
            }
            finally { AssetDatabase.AllowAutoRefresh(); }
        }

        [Test]
        public void AssetPathConversionAcceptsRootAndDescendants()
        {
            Assert.That(VulcanusImportHelpers.TryAbsoluteToAssetPath(Application.dataPath, out var root), Is.True);
            Assert.That(root, Is.EqualTo("Assets"));
            Assert.That(VulcanusImportHelpers.TryAbsoluteToAssetPath(Absolute(_map), out var path), Is.True);
            Assert.That(path, Is.EqualTo(_map));
        }

        [TestCase("Backup")]
        [TestCase("Other")]
        public void AssetPathConversionRejectsSiblingFoldersWithAssetsPrefix(string suffix)
        {
            var sibling = Application.dataPath + suffix + "/map.vmap";
            Assert.That(VulcanusImportHelpers.TryAbsoluteToAssetPath(sibling, out var path), Is.False);
            Assert.That(path, Is.Null);
        }

        [Test]
        public void AssetPathConversionNormalizesTraversalAndRejectsPathsOutsideAssets()
        {
            Assert.That(VulcanusImportHelpers.TryAbsoluteToAssetPath(Path.Combine(Application.dataPath, "..", "map.vmap"), out var path), Is.False);
            Assert.That(path, Is.Null);
        }

        [Test]
        public void ProjectDiscoveryUsesNearestAncestor()
        {
            Assert.That(VulcanusImportHelpers.FindProjectAssetPath(_map), Is.EqualTo(_project));
            var nearer = Write("maps/local.vproj", "{}");
            Assert.That(VulcanusImportHelpers.FindProjectAssetPath(_map), Is.EqualTo(nearer));
        }

        [Test]
        public void ProjectDiscoveryPrefersCanonicalFileOverNamedProjects()
        {
            var canonical = Write("vproj", "{}");
            Assert.That(VulcanusImportHelpers.FindProjectAssetPath(_map), Is.EqualTo(canonical));
        }

        [Test]
        public void TilesetLookupResolvesNamespacedIdRegardlessOfFilenameAndCase()
        {
            var tileset = Write("tilesets/villagetileset.vts", "{\"id\":\"base:villagetileset\"}");
            Assert.That(TilesetPath("BASE:VILLAGETILESET"), Is.EqualTo(tileset));
        }

        [Test]
        public void TilesetLookupSkipsMalformedCandidatesAndPreservesMissingSlots()
        {
            Write("tilesets/a.vts", "invalid json");
            var tileset = Write("tilesets/z.vts", "{\"id\":\"base:valid\"}");
            Assert.That(TilesetPath("base:valid"), Is.EqualTo(tileset));
            Assert.That(TilesetPath("base:missing"), Is.Null);
        }

        [Test]
        public void AssetReferencePrefersOwnerRelativePathOverProjectRelativePath()
        {
            var ownerAsset = Write("maps/sheet.txt", "owner");
            Write("sheet.txt", "project");
            Assert.That(VulcanusImportHelpers.ResolveAssetReferencePath(_map, "sheet.txt", _project), Is.EqualTo(ownerAsset));
        }

        [Test]
        public void AssetReferenceUsesProjectPathAndDoesNotGuessByFilename()
        {
            var projectAsset = Write("images/sheet.txt", "project");
            Assert.That(VulcanusImportHelpers.ResolveAssetReferencePath(_map, "images/sheet.txt", _project), Is.EqualTo(projectAsset));
            Assert.That(VulcanusImportHelpers.ResolveAssetReferencePath(_map, "old/folder/sheet.txt", _project), Is.Null);
        }

        [TestCase(null)]
        [TestCase("")]
        [TestCase(" ")]
        [TestCase("missing.txt")]
        public void MissingAssetReferencesReturnNull(string reference)
        {
            Assert.That(VulcanusImportHelpers.ResolveAssetReferencePath(_map, reference, _project), Is.Null);
        }

        [TestCase(32, 32)]
        [TestCase(0, 16)]
        [TestCase(-4, 16)]
        public void TileSizeUsesProjectValueOrDefaultForInvalidSize(int input, int expected)
        {
            Write("game.vproj", "{\"tileSize\":" + input + "}");
            Assert.That(VulcanusImportHelpers.GetProjectTileSize(_project), Is.EqualTo(expected));
        }

        [Test]
        public void TilesetFilenameDoesNotCreateAnAliasForItsAuthoredId()
        {
            Write("tilesets/village.vts", "{\"id\":\"base:village\"}");
            Assert.That(TilesetPath("village"), Is.Null);
            Assert.That(TilesetPath("base:village"), Is.Not.Null);
        }

        [Test]
        public void DuplicateTilesetIdsFailWithBothSourcePaths()
        {
            var first = Write("tilesets/a.vts", "{\"id\":\"base:village\"}");
            var second = Write("tilesets/b.vts", "{\"id\":\"BASE:VILLAGE\"}");
            var error = Assert.Throws<InvalidOperationException>(() => VulcanusImportHelpers.BuildTilesetIndex(_map, _project));
            Assert.That(error.Message, Does.Contain(first).And.Contain(second));
        }

        private string TilesetPath(string id) => VulcanusImportHelpers.BuildTilesetIndex(_map, _project)
            .TryGetValue(id, out var path) ? path : null;

        [Test]
        public void ImportDependenciesUseAuthoredIdsAndIncludeTheProjectBeforeLoadingAssets()
        {
            var tileset = Write("tilesets/arbitrary.vts", "{\"id\":\"base:tiles\"}");
            Write("maps/map.vmap", "{\"tilesetRefs\":[\"BASE:TILES\",\"base:tiles\",\"missing\"]}");
            Assert.That(VulcanusImporterCoordinator.GatherDependenciesFromSourceFile(_map),
                Is.EquivalentTo(new[] { _project, tileset }));
        }

        private string Write(string relativePath, string content)
        {
            var path = _root + "/" + relativePath;
            Directory.CreateDirectory(Path.GetDirectoryName(Absolute(path)));
            File.WriteAllText(Absolute(path), content);
            return path;
        }

        private static string Absolute(string path) => VulcanusImportHelpers.ToAbsolutePath(path);
    }
}
