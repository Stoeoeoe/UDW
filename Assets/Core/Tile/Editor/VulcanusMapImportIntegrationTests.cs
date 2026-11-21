using Core.Catalogs;
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Character;
using Core.Catalogs.Editor;
using Core.Common.Editor;
using Core.Inventory.Editor;
using Core.Location;
using Core.Music;
using Core.Music.Editor;
using Core.Spawning;
using Core.Spawning.Editor;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Vulcanus;
using Core.Tile.Water;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.Tilemaps;
using Object = UnityEngine.Object;
using LocationType = Core.Common.LocationType;
using static Core.Common.Editor.Reflect;

namespace Core.Tile.Editor
{
    [Category("MapLoading")]
    public sealed class VulcanusMapImportIntegrationTests : GameTest
    {

        private string _root;
        private string _mapPath;
        private string _scenePath;
        private string _tilesetPath;
        private EditorBuildSettingsScene[] _buildScenes;
        private string _sourcePrefabId;
        private LocationData _target;
        private VulcanusWorldCatalog _catalog;
        private JObject _mapJson;
        private readonly List<GameObject> _views = new();
        private readonly List<string> _extraScenePaths = new();
        private string _runnerScenePath;
        private string _musicFixturePath;

        [OneTimeSetUp]
        public void PrepareRunnerScene()
        {
            // Unity's scene APIs require a saved active scene before opening another additively.
            // The Test Runner supplies a disposable empty scene; never save an authored scene here.
            var scene = SceneManager.GetActiveScene();
            if (!string.IsNullOrEmpty(scene.path)) return;
            _runnerScenePath = "Assets/__MapImportRunner_" + Guid.NewGuid().ToString("N") + ".unity";
            Assert.That(EditorSceneManager.SaveScene(scene, _runnerScenePath), Is.True);
        }

        [OneTimeTearDown]
        public void RestoreRunnerScene()
        {
            if (_runnerScenePath == null) return;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            AssetDatabase.DeleteAsset(_runnerScenePath);
        }

        [SetUp]
        public void SetUp()
        {
            _buildScenes = EditorBuildSettings.scenes;
            _root = "Assets/__MapImportTests_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", Path.GetFileName(_root));
            _mapPath = _root + "/" + Path.GetFileName(_root) + ".vmap";
            _scenePath = VulcanusMapScenePostprocessor.GetScenePath(_mapPath);
            WriteAndImport(_root + "/fixture.vproj", Project("fixture"));

            var texture = new Texture2D(16, 16);
            texture.SetPixels(Enumerable.Repeat(Color.green, 256).ToArray());
            texture.Apply();
            File.WriteAllBytes(Absolute(_root + "/sheet.png"), texture.EncodeToPNG());
            Object.DestroyImmediate(texture);
            AssetDatabase.ImportAsset(_root + "/sheet.png", ImportAssetOptions.ForceSynchronousImport);
            var textureImporter = (TextureImporter)AssetImporter.GetAtPath(_root + "/sheet.png");
            textureImporter.isReadable = true;
            textureImporter.filterMode = FilterMode.Point;
            textureImporter.SaveAndReimport();
            _tilesetPath = _root + "/arbitrary-filename.vts";
            WriteAndImport(_tilesetPath, "{\"id\":\"test:tiles\",\"spriteSheet\":\"sheet.png\",\"columns\":1,\"tileCount\":1," +
                "\"tiles\":{\"0\":{\"collision\":{\"type\":\"full\"}}}," +
                "\"objects\":[{\"id\":\"test:chair\",\"tiles\":[{\"x\":0,\"y\":0,\"tileIndex\":0}]}]}");

            // Read the project's registered prefab; do not mutate a shared authoring catalog.
            var spawnCatalog = AssetDatabase.LoadAssetAtPath<DefinitionCatalog>(SpawnableCatalogEditor.CatalogPath);
            Assert.That(spawnCatalog, Is.Not.Null);
            var sourcePrefab = spawnCatalog.All<SpawnedObject>().FirstOrDefault();
            Assert.That(sourcePrefab, Is.Not.Null, "The shipped spawnable catalog must contain a persistent prefab.");
            _sourcePrefabId = sourcePrefab.Id;

            _target = ScriptableObject.CreateInstance<LocationData>();
            _target.SetId("test:target");
            AssetDatabase.CreateAsset(_target, _root + "/target.asset");
            _catalog = ScriptableObject.CreateInstance<VulcanusWorldCatalog>();
            _catalog.ApplySyncData(null, new[] { new VulcanusWorldCatalog.MapBinding("test:target", null, _target) });
            AssetDatabase.CreateAsset(_catalog, _root + "/fixture.project.world.asset");

            _mapJson = JObject.Parse(@"{
                'id':'test:map', 'name':'A display name', 'width':4, 'height':4,
                'tilesetRefs':['test:tiles'],
                'metadata':{'id':'override:forbidden','scenePath':'wrong','locationType':'Indoor','muteWeatherAudio':true},
                'layers':[
                    {'name':'Terrain','kind':'terrain','data':[[0]],'terrainData':[[0]],'terrainPalette':['dirt']},
                    {'name':'Furniture','kind':'object','zOrder':7,'objectInstances':[
                        {'id':'chair-1','tilesetId':'test:tiles','objectDefinitionId':'test:chair','x':16,'y':16},
                        {'id':'chair-2','tilesetId':'test:tiles','objectDefinitionId':'test:chair','x':32,'y':16}]}
                ],
                'entities':[{'id':'crate-1','typeId':'test:crate','position':[16,32],'rotation':90,'properties':{'prefabId':'wrong:identity'}}],
                'spatialPrimitives':{
                    'anchors':[{'id':'entry','position':[16,16],'facing':[0,-1]}],
                    'triggers':[{'id':'door','shape':'rectangle','position':[32,32],'size':[16,16]}]
                },
                'locationLinks':[{'id':'exit','triggerId':'door','targetMapId':'test:target','targetAnchorId':'spawn'}]
            }");
            _mapJson["entities"][0]["typeId"] = _sourcePrefabId;
        }

        [TearDown]
        public void TearDown()
        {
            foreach (var view in _views) if (view) Object.DestroyImmediate(view);
            _views.Clear();
            if (_scenePath != null)
            {
                var scene = SceneManager.GetSceneByPath(_scenePath);
                if (scene.IsValid() && scene.isLoaded) EditorSceneManager.CloseScene(scene, true);
                AssetDatabase.DeleteAsset(_scenePath);
            }
            foreach (var path in _extraScenePaths) AssetDatabase.DeleteAsset(path);
            _extraScenePaths.Clear();
            if (_buildScenes != null) EditorBuildSettings.scenes = _buildScenes;
            if (_root != null)
            {
                Assert.That(Path.GetFullPath(Absolute(_root)), Does.StartWith(Path.GetFullPath(Application.dataPath) + Path.DirectorySeparatorChar));
                Assert.That(Path.GetFileName(_root), Does.StartWith("__MapImportTests_"));
                AssetDatabase.DeleteAsset(_root);
            }
            // The imported maps depend on the cue, so they are removed first; otherwise they reimport against a missing cue.
            if (_musicFixturePath != null)
            {
                AssetDatabase.DeleteAsset(Path.GetDirectoryName(_musicFixturePath));
                _musicFixturePath = null;
                CatalogDiscovery.Refresh(Resources.Load<DefinitionCatalog>(DefinitionCatalog.ResourceName));
            }
        }

        [Test]
        public void ImportCreatesTerrainLocationAndStableSceneBinding()
        {
            var map = ImportMap();
            var location = ImportedLocation();
            Assert.That(map.MapId, Is.EqualTo("test:map"));
            Assert.That(map.MapName, Is.EqualTo("A display name"));
            Assert.That(location.Id, Is.EqualTo(map.MapId));
            Assert.That(location.scenePath, Is.EqualTo(_scenePath));
            Assert.That(location.locationType, Is.EqualTo(LocationType.Indoor));
            Assert.That(location.muteWeatherAudio, Is.True);
            Assert.That(map.TerrainTilemap.GetTile(new Vector3Int(0, 3, 0)), Is.Not.Null);
            Assert.That(map.TryGetTerrainType(new Vector2Int(0, 3), out var terrain), Is.True);
            Assert.That(terrain, Is.EqualTo(TerrainType.Dirt));
            Assert.That(File.Exists(Absolute(_scenePath)), Is.True);
            Assert.That(EditorBuildSettings.scenes.Any(scene => scene.path == location.ScenePath), Is.True);
        }

        [Test]
        public void MapMusicUsesTheAuthoredCueAndPresetAcrossReimports()
        {
            var fixture = MusicFixture();
            _mapJson["metadata"]["musicCue"] = fixture.Id;
            _mapJson["metadata"]["musicPreset"] = "full";
            var music = ImportMap().GetComponent<MusicEnvironment>();
            Assert.That(music.cue.Id, Is.EqualTo(fixture.Id));
            Assert.That(music.preset, Is.EqualTo("full"));
            music.cue.RequireValidConfiguration();
            var dependencies = VulcanusImporterCoordinator.GatherDependenciesFromSourceFile(_mapPath);
            Assert.That(dependencies, Does.Contain(AssetDatabase.GetAssetPath(fixture)));
            Assert.That(dependencies, Does.Not.Contain("Assets/Resources/DefinitionCatalog.asset"), "The catalog is refreshed after imports.");
            var cue = music.cue;
            Assert.That(ImportMap().GetComponent<MusicEnvironment>().cue, Is.SameAs(cue));
        }

        [Test]
        public void WaterRegionsKeepCollisionAndGameplayTilesAndUseSeparateRenderers()
        {
            var tilesetJson = JObject.Parse(File.ReadAllText(Absolute(_tilesetPath)));
            tilesetJson["tiles"]["0"]["properties"] = JArray.Parse(
                "[{'key':'waterType','value':'Lake_1'},{'key':'isFreshwater','value':true}]");
            WriteAndImport(_tilesetPath, tilesetJson.ToString());
            _mapJson["layers"][0]["data"] = JArray.Parse("[[0,0,-1,0],[-1,0,-1,-1],[-1,-1,0,-1]]");
            _mapJson["layers"][0]["opacity"] = 0.6f;
            _mapJson["layers"][0]["zOrder"] = 5;
            var map = ImportMap();
            var bodies = map.GetComponentsInChildren<WaterBody>(true);
            Assert.That(bodies.Length, Is.EqualTo(3), "Diagonal contact must not join independent water bodies.");
            Assert.That(bodies.Select(body => body.name), Is.Unique);
            var source = map.TerrainTilemap;
            Assert.That(source.GetComponent<TilemapCollider2D>(), Is.Not.Null);
            var waterCells = new[] { new Vector3Int(0, 3, 0), new Vector3Int(1, 3, 0), new Vector3Int(3, 3, 0),
                new Vector3Int(1, 2, 0), new Vector3Int(2, 1, 0) };
            foreach (var cell in waterCells)
            {
                var tile = source.GetTile<VulcanusTile>(cell);
                Assert.That(tile.WaterType, Is.EqualTo("Lake_1"));
                Assert.That(tile.IsFreshwater, Is.True);
                Assert.That(source.GetColliderType(cell), Is.EqualTo(UnityEngine.Tilemaps.Tile.ColliderType.Grid));
                Assert.That(source.GetColor(cell).a, Is.Zero);
                var surface = bodies.Select(body => body.GetComponent<Tilemap>()).Single(layer => layer.HasTile(cell));
                Assert.That(surface.GetSprite(cell), Is.SameAs(tile.sprite));
                Assert.That(surface.GetTile(cell), Is.Not.InstanceOf<VulcanusTile>());
                Assert.That(surface.GetColliderType(cell), Is.EqualTo(UnityEngine.Tilemaps.Tile.ColliderType.None));
                Assert.That(surface.GetColor(cell).a, Is.EqualTo(1));
            }
            foreach (var body in bodies)
            {
                body.Validate();
                Assert.That(body.Profile.name, Is.EqualTo("Lake_1"));
                Assert.That(body.PixelsPerUnit, Is.EqualTo(16));
                Assert.That(body.GetComponent<Tilemap>().color.a, Is.EqualTo(0.6f));
                Assert.That(body.GetComponent<TilemapRenderer>().sortingOrder, Is.EqualTo(5));
                Assert.That(body.GetComponent<Collider2D>(), Is.Null);
            }
            var names = bodies.Select(body => body.name).ToArray();
            Assert.That(ImportMap().GetComponentsInChildren<WaterBody>(true).Select(body => body.name), Is.EqualTo(names));
        }

        [Test]
        public void ShorelineFollowsSpriteAlphaHolesAndIgnoresArtificialMapEdges()
        {
            var tilesetJson = JObject.Parse(File.ReadAllText(Absolute(_tilesetPath)));
            tilesetJson["tiles"]["0"]["properties"] = JArray.Parse("[{'key':'waterType','value':'Lake_1'}]");
            WriteAndImport(_tilesetPath, tilesetJson.ToString());
            _mapJson["width"] = _mapJson["height"] = 1;
            _mapJson["layers"] = JArray.Parse("[{'name':'Water','kind':'terrain','data':[[0]]}]");
            _mapJson.Remove("entities");
            _mapJson.Remove("spatialPrimitives");
            _mapJson.Remove("locationLinks");
            var openWater = ImportMap().GetComponentInChildren<WaterBody>(true);
            Assert.That(SampleShoreline(openWater.Shoreline, new Vector2Int(0, -8)), Is.EqualTo(32));

            var texture = new Texture2D(16, 16);
            texture.SetPixels(Enumerable.Repeat(Color.green, 256).ToArray());
            for (var y = 7; y <= 8; y++)
                for (var x = 7; x <= 8; x++) texture.SetPixel(x, y, Color.clear);
            texture.Apply();
            File.WriteAllBytes(Absolute(_root + "/sheet.png"), texture.EncodeToPNG());
            Object.DestroyImmediate(texture);
            AssetDatabase.ImportAsset(_root + "/sheet.png", ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
            AssetDatabase.ImportAsset(_tilesetPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
            var island = ImportMap().GetComponentInChildren<WaterBody>(true);
            Assert.That(SampleShoreline(island.Shoreline, new Vector2Int(6, -1)), Is.EqualTo(0.5f).Within(0.001));
            Assert.That(SampleShoreline(island.Shoreline, new Vector2Int(0, -8)), Is.EqualTo(Mathf.Sqrt(84.5f)).Within(0.001));
        }

        // A mask over a size x size pixel map (top-down, like Vulcanus): bodyAt gives each pixel's body value.
        private static JObject DrawnMask(int size, Func<int, int, int> bodyAt)
        {
            var rle = new List<int>();
            var value = bodyAt(0, 0);
            var run = 0;
            for (var i = 0; i < size * size; i++)
            {
                var current = bodyAt(i % size, i / size);
                if (current != value) { rle.Add(value); rle.Add(run); run = 0; value = current; }
                run++;
            }
            rle.Add(value);
            rle.Add(run);
            return new JObject { ["width"] = size, ["height"] = size, ["rle"] = new JArray(rle) };
        }

        private static JObject DrawnBody(string id, bool freshwater = false, string type = "Lake_1") => new()
        {
            ["id"] = id, ["name"] = id, ["waterType"] = type, ["isFreshwater"] = freshwater, ["flow"] = new JArray()
        };

        private static JObject DrawnLayer(JObject mask, params JObject[] bodies) => new()
        {
            ["name"] = "Pond", ["kind"] = "water", ["zOrder"] = 3, ["opacity"] = 1,
            ["waterBodies"] = new JArray(bodies), ["waterMask"] = mask
        };

        private void UseDrawnWaterMap(int width, int height, JObject layer)
        {
            _mapJson["width"] = width;
            _mapJson["height"] = height;
            _mapJson["layers"] = new JArray(layer);
            _mapJson.Remove("entities");
            _mapJson.Remove("spatialPrimitives");
            _mapJson.Remove("locationLinks");
        }

        // Two lakes side by side on a 2x2 tile map: A is pixels x 4..15 and B x 16..27, both y 2..21 (top-down).
        private static JObject TwoLakes(bool aFreshwater = true) => DrawnLayer(
            DrawnMask(32, (x, y) => y is >= 2 and <= 21 ? (x is >= 4 and <= 15 ? 1 : x is >= 16 and <= 27 ? 2 : 0) : 0),
            DrawnBody("a", aFreshwater), DrawnBody("b"));

        [Test]
        public void DrawnWaterBodiesImportAsSeparateBodiesWithPixelAccurateShoresAndCellGameplay()
        {
            UseDrawnWaterMap(2, 2, TwoLakes());
            var map = ImportMap();
            var bodies = map.GetComponentsInChildren<WaterBody>(true);
            Assert.That(bodies.Select(body => body.name), Is.EquivalentTo(new[] { "Water_a", "Water_b" }));
            var a = bodies.Single(body => body.name == "Water_a");
            var b = bodies.Single(body => body.name == "Water_b");
            a.Validate();
            b.Validate();
            Assert.That(a.Profile.name, Is.EqualTo("Lake_1"));

            // Each body renders only its own pixels: A is the left tile column, B the right one.
            var left = a.GetComponent<Tilemap>();
            var right = b.GetComponent<Tilemap>();
            foreach (var cell in new[] { new Vector3Int(0, 0), new Vector3Int(0, 1) })
            {
                Assert.That(left.HasTile(cell), Is.True);
                Assert.That(right.HasTile(cell), Is.False);
            }
            foreach (var cell in new[] { new Vector3Int(1, 0), new Vector3Int(1, 1) })
            {
                Assert.That(right.HasTile(cell), Is.True);
                Assert.That(left.HasTile(cell), Is.False);
            }

            // Mask pixel (4,10) is A's first pixel in its row. (15,10) touches B, which is water, not a coast:
            // its nearest land is the top shore, 8.5 pixels up. (16,16) sits 5.5 above the bottom shore.
            Assert.That(SampleShoreline(a.Shoreline, new Vector2Int(4, 13)), Is.EqualTo(0.5f).Within(0.001));
            Assert.That(SampleShoreline(a.Shoreline, new Vector2Int(15, 13)), Is.EqualTo(8.5f).Within(0.001));
            Assert.That(SampleShoreline(b.Shoreline, new Vector2Int(16, 7)), Is.EqualTo(5.5f).Within(0.001));
            Assert.That(SampleShoreline(a.Shoreline, new Vector2Int(2, 13)), Is.Zero, "Left of the lakes is land.");

            // Only the top tile row is mostly water: both of its cells block movement, but only the cell
            // dominated by the freshwater body refills the watering jar.
            var source = map.GetComponentsInChildren<Tilemap>(true).Single(layer => layer.name == "Pond");
            var fresh = source.GetTile<VulcanusTile>(new Vector3Int(0, 1));
            var salt = source.GetTile<VulcanusTile>(new Vector3Int(1, 1));
            Assert.That(fresh.IsFreshwater, Is.True);
            Assert.That(salt, Is.Not.Null);
            Assert.That(salt.IsFreshwater, Is.False);
            foreach (var cell in new[] { new Vector3Int(0, 1), new Vector3Int(1, 1) })
                Assert.That(source.GetColliderType(cell), Is.EqualTo(UnityEngine.Tilemaps.Tile.ColliderType.Grid));
            Assert.That(source.GetTile(new Vector3Int(0, 0)), Is.Null);
            Assert.That(source.GetTile(new Vector3Int(1, 0)), Is.Null);
        }

        [Test]
        public void ABodyWithNoPixelsCreatesNoWaterObject()
        {
            UseDrawnWaterMap(2, 2, DrawnLayer(DrawnMask(32, (x, _) => x < 16 ? 1 : 0), DrawnBody("used"), DrawnBody("empty")));
            Assert.That(ImportMap().GetComponentsInChildren<WaterBody>(true).Select(body => body.name), Is.EqualTo(new[] { "Water_used" }));
        }

        [TestCase("size", "mask is 31x32")]
        [TestCase("body", "uses body 3")]
        [TestCase("bank", "requires a BankProfile")]
        [TestCase("type", "requires a waterType")]
        [TestCase("duplicate", "unique id")]
        [TestCase("stroke", "at least two")]
        public void InvalidDrawnWaterFailsAtTheImportBoundary(string defect, string expected)
        {
            var layer = TwoLakes();
            switch (defect)
            {
                case "size": layer["waterMask"]["width"] = 31; break;
                case "body": layer["waterMask"] = DrawnMask(32, (_, _) => 3); break;
                case "bank": layer["waterBodies"][0]["bankProfile"] = "__NoSuchBank"; break;
                case "type": layer["waterBodies"][0]["waterType"] = "None"; break;
                case "duplicate": layer["waterBodies"][1]["id"] = "a"; break;
                case "stroke": layer["waterBodies"][0]["flow"] = JArray.Parse("[{'id':'s','points':[[1,1]],'width':8,'speed':1}]"); break;
            }
            UseDrawnWaterMap(2, 2, layer);
            var messages = new List<string>();
            Application.LogCallback capture = (message, stack, type) => messages.Add(message);
            var previous = LogAssert.ignoreFailingMessages;
            LogAssert.ignoreFailingMessages = true;
            Application.logMessageReceived += capture;
            try { WriteAndImport(_mapPath, _mapJson.ToString()); }
            finally { Application.logMessageReceived -= capture; LogAssert.ignoreFailingMessages = previous; }
            Assert.That(messages.Any(message => message.Contains(expected)), Is.True, string.Join("\n", messages));
        }

        [Test]
        public void ABodyWithABankProfileGetsABakedBankOnItsOwnTilemap()
        {
            const string name = "__BankTest";
            var path = WaterBankImporter.ProfileFolder + "/" + name + ".asset";
            if (!AssetDatabase.IsValidFolder(WaterBankImporter.ProfileFolder))
                AssetDatabase.CreateFolder("Assets/Content/Water", "Banks");
            var profile = ScriptableObject.CreateInstance<BankProfile>();
            profile.edgeNoisePixels = 0;
            profile.layers = new[] { new BankLayer { kind = BankLayerKind.Band, startPixels = 0, endPixels = 2, color = Color.red } };
            AssetDatabase.CreateAsset(profile, path);
            try
            {
                // One lake at mask pixels 8..23 in both directions of a 2x2 tile map.
                var body = DrawnBody("a");
                body["bankProfile"] = name;
                UseDrawnWaterMap(2, 2, DrawnLayer(DrawnMask(32, (x, y) => x is >= 8 and <= 23 && y is >= 8 and <= 23 ? 1 : 0), body));
                var map = ImportMap();
                Assert.That(map.GetComponentInChildren<WaterBody>(true), Is.Not.Null);
                var bank = map.GetComponentsInChildren<Tilemap>(true).Single(layer => layer.name == "Bank_a");
                var tile = bank.GetTile<UnityEngine.Tilemaps.Tile>(new Vector3Int(0, 0));
                Assert.That(tile, Is.Not.Null, "The cell left of the lake carries bank pixels.");

                // Mask pixel (7,16) is the first land pixel left of the lake: grid row 31 - 16 = 15 of cell (0,0).
                var sprite = tile.sprite;
                Color32 Pixel(int x, int y) => ReadPixel(sprite.texture, (int)sprite.rect.x + x, (int)sprite.rect.y + y);
                Assert.That(Pixel(7, 15), Is.EqualTo(new Color32(255, 0, 0, 255)), "Depth 0 is the first band.");
                Assert.That(Pixel(6, 15), Is.EqualTo(new Color32(255, 0, 0, 255)), "Depth 1 is still in the band.");
                Assert.That(Pixel(5, 15).a, Is.Zero, "Depth 2 is past the band, so the ground shows.");
                Assert.That(Pixel(8, 15).a, Is.Zero, "The water itself is not bank.");
            }
            finally
            {
                AssetDatabase.DeleteAsset(_mapPath);
                AssetDatabase.DeleteAsset(path);
            }
        }

        // A throwaway profile with currents enabled; the map goes first so deleting the profile cannot trigger a failing reimport.
        private void WithFlowingProfile(Action<string> test)
        {
            const string type = "__FlowTestLake";
            var profilePath = WaterTilemapImporter.ProfileFolder + "/" + type + ".asset";
            var profile = Object.Instantiate(AssetDatabase.LoadAssetAtPath<WaterProfile>("Assets/Content/Water/Lake_1.asset"));
            profile.flowEnabled = true;
            AssetDatabase.CreateAsset(profile, profilePath);
            try { test(type); }
            finally
            {
                AssetDatabase.DeleteAsset(_mapPath);
                AssetDatabase.DeleteAsset(profilePath);
            }
        }

        [Test]
        public void DrawnCurrentsShapeTheFlowOfFlowingBodiesOnly()
        {
            WithFlowingProfile(type =>
            {
                // One body fills a 1x3 tile map. A double-speed current runs from its top edge to its bottom edge.
                var body = DrawnBody("river", type: type);
                body["flow"] = JArray.Parse("[{'id':'s','points':[[8,0],[8,47]],'width':8,'speed':2}]");
                UseDrawnWaterMap(1, 3, DrawnLayer(DrawnMask(16, (_, _) => 1), body));
                _mapJson["layers"][0]["waterMask"]["height"] = 48;
                _mapJson["layers"][0]["waterMask"]["rle"] = new JArray(1, 16 * 48);

                var river = ImportMap().GetComponentInChildren<WaterBody>(true);
                river.Validate();
                Assert.That(river.Flow, Is.Not.Null);
                Assert.That(river.Flow.SpeedScale, Is.EqualTo(2));
                var map = river.Flow.Map;
                Assert.That((map.width, map.height), Is.EqualTo((16, 48)));
                var middle = ReadPixel(map, 8, 24);
                Assert.That(middle.g, Is.LessThan(30), "The current flows down, from the top edge to the bottom edge.");
                Assert.That(Mathf.Abs(middle.r - 128), Is.LessThan(10));
                Assert.That(middle.b, Is.GreaterThan(200));

                body["flow"] = new JArray();
                _mapJson["layers"][0]["waterBodies"] = new JArray(body);
                Assert.That(ImportMap().GetComponentInChildren<WaterBody>(true).Flow, Is.Null, "Without strokes the uniform current stays.");
            });
        }

        [Test]
        public void ACurrentDrawnOnLandFailsTheImport()
        {
            WithFlowingProfile(type =>
            {
                // Water fills only the left half of the map, but the current is drawn down its right half.
                var body = DrawnBody("river", type: type);
                body["flow"] = JArray.Parse("[{'id':'s','points':[[28,2],[28,29]],'width':4,'speed':1}]");
                UseDrawnWaterMap(2, 2, DrawnLayer(DrawnMask(32, (x, _) => x < 12 ? 1 : 0), body));
                var messages = new List<string>();
                Application.LogCallback capture = (message, stack, logType) => messages.Add(message);
                var previous = LogAssert.ignoreFailingMessages;
                LogAssert.ignoreFailingMessages = true;
                Application.logMessageReceived += capture;
                try { WriteAndImport(_mapPath, _mapJson.ToString()); }
                finally { Application.logMessageReceived -= capture; LogAssert.ignoreFailingMessages = previous; }
                Assert.That(messages.Any(message => message.Contains("on land")), Is.True, string.Join("\n", messages));
            });
        }

        private static Color32 ReadPixel(Texture2D texture, int x, int y)
        {
            // Imported flow maps are not CPU readable; copy through a linear target to keep exact bytes.
            var target = RenderTexture.GetTemporary(texture.width, texture.height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear);
            var previous = RenderTexture.active;
            try
            {
                Graphics.Blit(texture, target);
                RenderTexture.active = target;
                var copy = new Texture2D(texture.width, texture.height, TextureFormat.RGBA32, false, true);
                copy.ReadPixels(new Rect(0, 0, texture.width, texture.height), 0, 0);
                var pixel = (Color32)copy.GetPixel(x, y);
                Object.DestroyImmediate(copy);
                return pixel;
            }
            finally
            {
                RenderTexture.active = previous;
                RenderTexture.ReleaseTemporary(target);
            }
        }

        private static float SampleShoreline(WaterShorelineData data, Vector2Int pixel)
        {
            var relative = pixel - data.OriginPixels;
            var pageX = relative.x / WaterShorelineData.ChunkSize;
            var pageY = relative.y / WaterShorelineData.ChunkSize;
            var pages = AsyncGPUReadback.Request(data.Pages, 0);
            pages.WaitForCompletion();
            Assert.That(pages.hasError, Is.False);
            var slice = Mathf.RoundToInt(pages.GetData<float>()[pageY * data.Pages.width + pageX]) - 1;
            Assert.That(slice, Is.GreaterThanOrEqualTo(0));
            var distances = AsyncGPUReadback.Request(data.Distances, 0);
            distances.WaitForCompletion();
            Assert.That(distances.hasError, Is.False);
            return distances.GetData<float>(slice)[relative.y % WaterShorelineData.ChunkSize * WaterShorelineData.ChunkSize + relative.x % WaterShorelineData.ChunkSize];
        }

        [Test]
        public void WaterProfileRejectsInvalidSettingsAtTheBoundary()
        {
            var profile = ScriptableObject.CreateInstance<WaterProfile>();
            try
            {
                Assert.That(Assert.Throws<InvalidOperationException>(() => profile.Validate()).Message, Does.Contain("material"));
                profile.material = AssetDatabase.LoadAssetAtPath<WaterProfile>("Assets/Content/Water/Lake_1.asset").material;
                profile.Validate();
                profile.waveScale = 0;
                Assert.Throws<InvalidOperationException>(() => profile.Validate());
                profile.waveScale = 1;
                profile.causticIntensity = float.NaN;
                Assert.Throws<InvalidOperationException>(() => profile.Validate());
                profile.causticIntensity = 0;
                profile.baseColor = Color.clear;
                Assert.Throws<InvalidOperationException>(() => profile.Validate());
            }
            finally { Object.DestroyImmediate(profile); }
        }

        [Test]
        public void ImportRejectsWaterTypesWithoutAnAuthoredProfile()
        {
            var tilesetJson = JObject.Parse(File.ReadAllText(Absolute(_tilesetPath)));
            tilesetJson["tiles"]["0"]["properties"] = JArray.Parse("[{'key':'waterType','value':'__MissingWaterProfile'}]");
            WriteAndImport(_tilesetPath, tilesetJson.ToString());
            var messages = new List<string>();
            Application.LogCallback capture = (message, stack, type) => messages.Add(message);
            var previous = LogAssert.ignoreFailingMessages;
            LogAssert.ignoreFailingMessages = true;
            Application.logMessageReceived += capture;
            try { WriteAndImport(_mapPath, _mapJson.ToString()); }
            finally { Application.logMessageReceived -= capture; LogAssert.ignoreFailingMessages = previous; }
            Assert.That(messages.Any(message => message.Contains("__MissingWaterProfile.asset")), Is.True);
            Assert.That(AssetDatabase.LoadAssetAtPath<GameObject>(_mapPath), Is.Null);
        }

        [Test]
        public void ObjectInstancesShareTilesetSpriteAndKeepPrefabCollidersAndPlacement()
        {
            var map = ImportMap();
            var objects = map.transform.Find("Furniture");
            var tileset = AssetDatabase.LoadAssetAtPath<VulcanusTilesetAsset>(_tilesetPath);
            var definition = tileset.ObjectDefinitions.Single();
            Assert.That(objects.childCount, Is.EqualTo(2));
            Assert.That(objects.GetChild(0).localPosition, Is.EqualTo(new Vector3(1.5f, 2f, 0f) + (Vector3)Core.Tile.MapManager.TileVisualOffset));
            foreach (Transform obj in objects)
            {
                Assert.That(obj.GetComponent<SpriteRenderer>().sprite, Is.SameAs(definition.sprite));
                Assert.That(obj.GetComponent<SpriteRenderer>().sortingOrder, Is.EqualTo(7));
                Assert.That(obj.GetComponent<PolygonCollider2D>(), Is.Not.Null);
                Assert.That(obj.GetComponent<YSortByPosition>(), Is.Not.Null);
            }
            Assert.That(AssetDatabase.LoadAllAssetsAtPath(_mapPath).OfType<Texture2D>(), Is.Empty);
        }

        [Test]
        public void TilesetImportsNavigationCostAndLeavesAbsentCostsUnset()
        {
            var tileset = ImportNavigationTileset("{\"navigationCost\":1}");
            Assert.That(tileset.Tiles[0].TryGetNavigationCost(out var cost), Is.True);
            Assert.That(cost, Is.EqualTo(1));
            Assert.That(tileset.Tiles[1].TryGetNavigationCost(out _), Is.False);
        }

        [TestCase(0)]
        [TestCase(101)]
        public void TilesetRejectsOutOfRangeNavigationCost(int cost)
        {
            var errors = new List<string>();
            Application.LogCallback capture = (text, stack, type) => { if (type == LogType.Error) errors.Add(text); };
            var previous = LogAssert.ignoreFailingMessages;
            LogAssert.ignoreFailingMessages = true;
            Application.logMessageReceived += capture;
            try { ImportNavigationTileset("{\"navigationCost\":" + cost + "}"); }
            finally { Application.logMessageReceived -= capture; LogAssert.ignoreFailingMessages = previous; }
            Assert.That(errors.Any(error => error.Contains("navigationCost must be")), Is.True, string.Join("\n", errors));
        }

        [Test]
        public void MapImportBakesTheNavigationCostGridFromTilesetCostsWithTheRowsFlipped()
        {
            ImportNavigationTileset("{\"navigationCost\":1}", "{\"navigationCost\":9}");
            // 4x3 map; tile 0 = cost 1, tile 1 = cost 9, tile 2 = no cost. Vulcanus rows are top-down.
            JArray Rows(params (int x, int y, int tile)[] tiles)
            {
                var rows = new JArray(Enumerable.Range(0, 3).Select(_ => new JArray(Enumerable.Repeat((object)null, 4))));
                foreach (var (x, y, tile) in tiles) rows[y][x] = tile;
                return rows;
            }
            _mapJson = new JObject
            {
                ["id"] = "test:navmap", ["name"] = "Nav", ["width"] = 4, ["height"] = 3,
                ["tilesetRefs"] = new JArray("test:nav"),
                ["layers"] = new JArray(
                    new JObject { ["name"] = "Terrain", ["kind"] = "terrain", ["zOrder"] = 0, ["data"] = Rows((1, 2, 0), (2, 2, 0)) },
                    new JObject { ["name"] = "Over", ["kind"] = "visual", ["zOrder"] = 5, ["data"] = Rows((1, 2, 1), (2, 2, 2)) },
                    new JObject { ["name"] = "Hidden", ["kind"] = "visual", ["zOrder"] = 9, ["visible"] = false, ["data"] = Rows((3, 2, 1)) })
            };
            var grid = ImportMap().NavigationCosts;
            Assert.That(grid.Width, Is.EqualTo(4));
            Assert.That(grid.Height, Is.EqualTo(3));
            Assert.That(grid.GetCost(new Vector2Int(0, 0)), Is.EqualTo(NavigationCostGrid.DefaultCost));
            Assert.That(grid.GetCost(new Vector2Int(1, 0)), Is.EqualTo(9)); // overridden by the higher layer
            Assert.That(grid.GetCost(new Vector2Int(2, 0)), Is.EqualTo(1)); // cost-less tile above is transparent
            Assert.That(grid.GetCost(new Vector2Int(3, 0)), Is.EqualTo(NavigationCostGrid.DefaultCost)); // invisible layer
            Assert.That(grid.GetCost(new Vector2Int(1, 2)), Is.EqualTo(NavigationCostGrid.DefaultCost)); // top row is Unity y 2
        }

        // Four-tile tileset; tile 0 and 1 carry the given meta JSON, tiles 2 and 3 carry none.
        private VulcanusTilesetAsset ImportNavigationTileset(string tile0Meta, string tile1Meta = "{}")
        {
            var texture = new Texture2D(16, 64);
            texture.SetPixels(Enumerable.Repeat(Color.green, 16 * 64).ToArray());
            texture.Apply();
            File.WriteAllBytes(Absolute(_root + "/navsheet.png"), texture.EncodeToPNG());
            Object.DestroyImmediate(texture);
            AssetDatabase.ImportAsset(_root + "/navsheet.png", ImportAssetOptions.ForceSynchronousImport);
            var sheetImporter = (TextureImporter)AssetImporter.GetAtPath(_root + "/navsheet.png");
            sheetImporter.isReadable = true;
            sheetImporter.filterMode = FilterMode.Point;
            sheetImporter.SaveAndReimport();
            var path = _root + "/nav.vts";
            WriteAndImport(path, "{\"id\":\"test:nav\",\"spriteSheet\":\"navsheet.png\",\"columns\":1,\"tileCount\":4," +
                "\"tiles\":{\"0\":" + tile0Meta + ",\"1\":" + tile1Meta + "}}");
            return AssetDatabase.LoadAssetAtPath<VulcanusTilesetAsset>(path);
        }

        [Test]
        public void PersistentEntitiesAreInactiveTemplatesWithStablePlacementAndPrefabIdentity()
        {
            var map = ImportMap();
            var placement = map.PersistentEntities.Single();
            Assert.That(placement.id, Is.EqualTo("crate-1"));
            Assert.That(placement.template.Id, Is.EqualTo(_sourcePrefabId));
            Assert.That(placement.template.gameObject.activeSelf, Is.True);
            Assert.That(placement.template.transform.parent.gameObject.activeSelf, Is.False);
            Assert.That(placement.template.State, Is.Null);
            Assert.That(placement.template.transform.localPosition, Is.EqualTo(new Vector3(1, 2, 0) + (Vector3)Core.Tile.MapManager.TileVisualOffset));
            Assert.That(Quaternion.Angle(placement.template.transform.localRotation, Quaternion.Euler(0, 0, -90)), Is.LessThan(0.01f));
        }

        [Test]
        public void SceneValidationRejectsActivatingPersistentTemplatesEvenUnderAnInactiveMap()
        {
            var staging = new GameObject("Inactive map staging");
            staging.SetActive(false);
            _views.Add(staging);
            var map = Game.InjectObject(Object.Instantiate(ImportMap(), staging.transform));
            Assert.DoesNotThrow(() => ContainerConfigurationValidation.Check(staging));
            var template = map.PersistentEntities.Single().template;
            template.transform.parent.gameObject.SetActive(true);
            Assert.That(template.gameObject.activeInHierarchy, Is.False);
            var error = Assert.Throws<InvalidOperationException>(() =>
                ContainerConfigurationValidation.Check(staging));
            StringAssert.Contains("crate-1", error.Message);
            StringAssert.Contains("inactive parent", error.Message);
        }

        [Test]
        public void LocationLinksResolveCatalogTargetsAndAnchors()
        {
            var map = ImportMap();
            var link = map.GetComponentInChildren<LocationLink>(true);
            Assert.That(link, Is.Not.Null);
            Assert.That(link.TargetLocation, Is.SameAs(_target));
            Assert.That(link.TargetLocationId, Is.EqualTo("test:target"));
            Assert.That(link.TargetEntryKey, Is.EqualTo("spawn"));
            Assert.That(link.RequiresButtonPress, Is.True, "Links default to doors.");
            var anchor = map.GetComponentInChildren<VulcanusMapAnchor>(true);
            Assert.That(anchor.transform.localPosition, Is.EqualTo(new Vector3(1, 3, 0) + (Vector3)Core.Tile.MapManager.TileVisualOffset));
        }

        [Test]
        public void ReimportUpdatesLinkActivationFromOpenToDoor()
        {
            _mapJson["locationLinks"][0]["linkType"] = "open";
            Assert.That(ImportMap().GetComponentInChildren<LocationLink>(true).RequiresButtonPress, Is.False);
            _mapJson["locationLinks"][0]["linkType"] = "door";
            Assert.That(ImportMap().GetComponentInChildren<LocationLink>(true).RequiresButtonPress, Is.True);
        }

        [Test]
        public void UnknownLinkActivationFailsImport()
        {
            var dto = new LocationLinkDto { Id = "exit", LinkType = "invalid" };
            var build = typeof(VulcanusMapTriggerImporter).GetMethod("BuildLocationLinkData", BindingFlags.Static | BindingFlags.NonPublic);
            var error = Assert.Throws<TargetInvocationException>(() => build.Invoke(null, new object[]
            {
                dto, new MapTriggerDto(), new Dictionary<string, VulcanusMapAnchor>()
            }));
            Assert.That(error.InnerException, Is.TypeOf<InvalidOperationException>());
            StringAssert.Contains("invalid linkType", error.InnerException.Message);
        }

        [Test]
        public void LinkWithoutArrivalAnchorFailsImport()
        {
            var build = typeof(VulcanusMapTriggerImporter).GetMethod("BuildLocationLinkData", BindingFlags.Static | BindingFlags.NonPublic);
            var error = Assert.Throws<TargetInvocationException>(() => build.Invoke(null, new object[]
            {
                new LocationLinkDto { Id = "exit" }, new MapTriggerDto(), new Dictionary<string, VulcanusMapAnchor>()
            }));
            Assert.That(error.InnerException, Is.TypeOf<InvalidOperationException>());
            StringAssert.Contains("requires an arrival anchor", error.InnerException.Message);
        }

        [Test]
        public void ReimportKeepsSubassetIdentityAndSceneWrapperWhileUpdatingContent()
        {
            ImportMap();
            var oldLocationId = AssetDatabase.LoadAllAssetsAtPath(_mapPath).OfType<LocationData>().Single();
            Assert.That(AssetDatabase.TryGetGUIDAndLocalFileIdentifier(oldLocationId, out string oldGuid, out long oldFileId), Is.True);
            var sceneText = File.ReadAllText(Absolute(_scenePath));
            // Also verify that importing an existing wrapper repairs missing build registration.
            EditorBuildSettings.scenes = EditorBuildSettings.scenes.Where(scene => scene.path != _scenePath).ToArray();
            _mapJson["name"] = "Renamed display name";
            _mapJson["width"] = 8;
            var map = ImportMap();
            var location = ImportedLocation();
            Assert.That(AssetDatabase.TryGetGUIDAndLocalFileIdentifier(location, out string newGuid, out long newFileId), Is.True);
            Assert.That(newGuid, Is.EqualTo(oldGuid));
            Assert.That(newFileId, Is.EqualTo(oldFileId));
            Assert.That(location.scenePath, Is.EqualTo(_scenePath));
            Assert.That(map.Width, Is.EqualTo(8));
            Assert.That(File.ReadAllText(Absolute(_scenePath)), Is.EqualTo(sceneText));
            Assert.That(EditorBuildSettings.scenes.Any(scene => scene.path == _scenePath), Is.True);
            var scene = EditorSceneManager.OpenScene(_scenePath, OpenSceneMode.Additive);
            Assert.That(scene.GetRootGameObjects().Single().GetComponent<VulcanusImportedMap>().Width, Is.EqualTo(8));
        }

        [Test]
        public void SceneLookupUsesImportedScenePathRatherThanMapIdOrDisplayName()
        {
            ImportMap();
            var location = ImportedLocation();
            var systemsScene = SceneManager.GetActiveScene();
            var scene = EditorSceneManager.OpenScene(_scenePath, OpenSceneMode.Additive);
            var root = new GameObject("Isolated level manager");
            var loadedScene = typeof(LevelManager).GetMethod("GetLoadedScene", BindingFlags.Static | BindingFlags.NonPublic);
            Assert.That(loadedScene.Invoke(null, new object[] { location.ScenePath }), Is.EqualTo(scene));
            Assert.That(loadedScene.Invoke(null, new object[] { scene.name }), Is.EqualTo(scene));
            root.SetActive(false);
            _views.Add(root);
            var manager = Game.Add<LevelManager>(root);
            Set(manager, "_locationByScenePath", new Dictionary<string, LocationData>(StringComparer.OrdinalIgnoreCase) { [location.scenePath] = location });
            var resolved = Call(manager, "GetLocationForScene", scene);
            Assert.That(resolved, Is.SameAs(location));
            Assert.That(Call(manager, "ResolveInitialLocation"), Is.SameAs(location));

            var listenerRoot = new GameObject("Inactive location listener");
            listenerRoot.SetActive(false);
            _views.Add(listenerRoot);
            var listener = Game.Add<LocationListenerProbe>(listenerRoot);
            SceneManager.MoveGameObjectToScene(listenerRoot, scene);
            var canReceive = typeof(LevelManager).GetMethod("CanReceiveLocation", BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(canReceive.Invoke(manager, new object[] { listener, location }), Is.EqualTo(true));
            Assert.That(canReceive.Invoke(manager, new object[] { listener, _target }), Is.EqualTo(false));
            SceneManager.MoveGameObjectToScene(listenerRoot, systemsScene);
            Assert.That(canReceive.Invoke(manager, new object[] { listener, _target }), Is.EqualTo(true));
        }

        [Test]
        public void FreshProjectTilesetAndMapImportTogetherInDependencyOrder()
        {
            AssetDatabase.CreateFolder(_root, "cold");
            var folder = _root + "/cold";
            var mapPath = folder + "/" + Path.GetFileName(_root) + "_cold.vmap";
            _extraScenePaths.Add(VulcanusMapScenePostprocessor.GetScenePath(mapPath));
            File.WriteAllText(Absolute(folder + "/fixture.vproj"), Project("cold"));
            File.WriteAllText(Absolute(folder + "/tiles.vts"), "{\"id\":\"test:cold\",\"spriteSheet\":\"../sheet.png\",\"columns\":1,\"tileCount\":1}");
            File.WriteAllText(Absolute(mapPath), "{\"id\":\"test:cold-map\",\"width\":1,\"height\":1,\"tilesetRefs\":[\"test:cold\"],\"layers\":[{\"kind\":\"terrain\",\"data\":[[0]]}]}");
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(mapPath);
            Assert.That(prefab, Is.Not.Null);
            Assert.That(prefab.GetComponent<VulcanusImportedMap>().TerrainTilemap.GetTile(Vector3Int.zero), Is.Not.Null);
        }

        [TestCase("missing-tileset")]
        [TestCase("missing-object")]
        [TestCase("missing-persistent-id")]
        [TestCase("duplicate-persistent-id")]
        [TestCase("missing-music-cue")]
        [TestCase("missing-music-preset")]
        [TestCase("unknown-music-preset")]
        public void InvalidRequiredContentFailsImportInsteadOfProducingATextAsset(string fault)
        {
            string message;
            switch (fault)
            {
                case "missing-tileset": _mapJson["tilesetRefs"] = new JArray("missing"); message = "references missing tileset"; break;
                case "missing-object": _mapJson["layers"][1]["objectInstances"][0]["objectDefinitionId"] = "missing"; message = "requires imported prefab"; break;
                case "missing-persistent-id": _mapJson["entities"][0]["id"] = ""; message = "needs an authored instance ID"; break;
                case "missing-music-cue":
                    _mapJson["metadata"]["musicCue"] = "test:missing-music";
                    _mapJson["metadata"]["musicPreset"] = "full";
                    message = "references missing music cue"; break;
                case "missing-music-preset":
                    _mapJson["metadata"]["musicCue"] = MusicFixture().Id;
                    message = "requires musicPreset"; break;
                case "unknown-music-preset":
                    _mapJson["metadata"]["musicCue"] = MusicFixture().Id;
                    _mapJson["metadata"]["musicPreset"] = "missing";
                    message = "references unknown music preset"; break;
                default: ((JArray)_mapJson["entities"]).Add(_mapJson["entities"][0].DeepClone()); message = "Duplicate persistent entity ID"; break;
            }
            var errors = new List<string>();
            Application.LogCallback capture = (text, stack, type) => { if (type == LogType.Error) errors.Add(text); };
            var previous = LogAssert.ignoreFailingMessages;
            LogAssert.ignoreFailingMessages = true;
            Application.logMessageReceived += capture;
            try { WriteAndImport(_mapPath, _mapJson.ToString()); }
            finally { Application.logMessageReceived -= capture; LogAssert.ignoreFailingMessages = previous; }
            Assert.That(errors.Any(error => error.Contains(message)), Is.True, string.Join("\n", errors));
            Assert.That(AssetDatabase.LoadAssetAtPath<GameObject>(_mapPath), Is.Null);
            Assert.That(AssetDatabase.LoadAssetAtPath<TextAsset>(_mapPath), Is.Null);
            Assert.That(File.Exists(Absolute(_scenePath)), Is.False);
        }

        [UnityTest]
        public IEnumerator LocationCatalogAutomaticallyTracksImportedMapsWithoutManagerAssignments()
        {
            var catalog = DefaultCatalogAssets.Load();
            ImportMap();
            yield return AwaitCatalog(() => catalog.Get<LocationData>("test:map"));
            Assert.That(catalog.Get<LocationData>("test:map"), Is.SameAs(ImportedLocation()));

            var owner = new GameObject("Location lookup");
            owner.SetActive(false);
            _views.Add(owner);
            var manager = Game.Add<LevelManager>(owner);
            Set(manager, "_locations", catalog);
            Assert.That(manager.GetLocationDataById("test:map"), Is.SameAs(ImportedLocation()));

            _mapJson["id"] = "test:renamed";
            ImportMap();
            yield return AwaitCatalog(() => catalog.Get<LocationData>("test:renamed") && !catalog.Get<LocationData>("test:map"));
            Assert.That(catalog.Get<LocationData>("test:renamed"), Is.SameAs(ImportedLocation()));
            AssetDatabase.DeleteAsset(_mapPath);
            yield return AwaitCatalog(() => !catalog.Get<LocationData>("test:renamed"));
        }

        [UnityTest]
        public IEnumerator CatalogAutomaticallyDiscoversImportsAndReimportsWithoutChangingManualAssignments()
        {
            BindCatalogProject();
            var prefab = AssetDatabase.LoadAssetAtPath<DefinitionCatalog>(SpawnableCatalogEditor.CatalogPath).All<SpawnedObject>().First().gameObject;
            var manualEntity = new VulcanusProject.EntityPrefabMapping { entityTypeId = "test:manual", prefab = prefab };
            _catalog.ApplySyncData(new[] { manualEntity }, _catalog.MapBindings);
            ImportMap();
            yield return AwaitCatalog(() => _catalog.TryGetLocationDataByMapId("test:map", out _));
            Assert.That(_catalog.MapBindings.Single(row => row.MapId == "test:map").SourceAssetGuid,
                Is.EqualTo(AssetDatabase.AssetPathToGUID(_mapPath)));
            Assert.That(_catalog.TryGetLocationDataByMapId("test:target", out var target), Is.True);
            Assert.That(target, Is.SameAs(_target));
            Assert.That(_catalog.EntityPrefabMappings.Single(), Is.SameAs(manualEntity));
            var catalogPath = AssetDatabase.GetAssetPath(_catalog);
            var bytes = File.ReadAllBytes(Absolute(catalogPath));
            var writtenAt = File.GetLastWriteTimeUtc(Absolute(catalogPath));
            Assert.That(VulcanusWorldCatalogDiscovery.Refresh(_catalog), Is.False);
            Assert.That(File.ReadAllBytes(Absolute(catalogPath)), Is.EqualTo(bytes));
            Assert.That(File.GetLastWriteTimeUtc(Absolute(catalogPath)), Is.EqualTo(writtenAt));

            _mapJson["id"] = "test:renamed";
            ImportMap();
            yield return AwaitCatalog(() => _catalog.TryGetLocationDataByMapId("test:renamed", out _));
            Assert.That(_catalog.TryGetLocationDataByMapId("test:map", out _), Is.False);
            Assert.That(_catalog.EntityPrefabMappings.Single().prefab, Is.SameAs(prefab));
        }

        [UnityTest]
        public IEnumerator CatalogTracksMovedSourcesAndRemovesDeletedMapsButKeepsManualRows()
        {
            BindCatalogProject();
            ImportMap();
            yield return AwaitCatalog(() => _catalog.TryGetLocationDataByMapId("test:map", out _));
            var guid = AssetDatabase.AssetPathToGUID(_mapPath);
            AssetDatabase.CreateFolder(_root, "moved");
            var movedPath = _root + "/moved/" + Path.GetFileName(_mapPath);
            Assert.That(AssetDatabase.MoveAsset(_mapPath, movedPath), Is.Empty);
            _mapPath = movedPath;
            yield return AwaitCatalog(() => _catalog.MapBindings.Any(row => row.MapId == "test:map" &&
                AssetDatabase.GetAssetPath(row.MapPrefab) == movedPath));
            Assert.That(_catalog.MapBindings.Single(row => row.MapId == "test:map").SourceAssetGuid, Is.EqualTo(guid));
            Assert.That(VulcanusWorldCatalogDiscovery.Refresh(_catalog), Is.False);
            Assert.That(AssetDatabase.DeleteAsset(_mapPath), Is.True);
            yield return AwaitCatalog(() => _catalog.MapBindings.All(row => row.MapId != "test:map"));
            Assert.That(_catalog.MapBindings.Single().LocationData, Is.SameAs(_target));
        }

        [UnityTest]
        public IEnumerator MovingAMapIntoAnotherProjectRemovesItFromTheOriginalCatalog()
        {
            BindCatalogProject();
            ImportMap();
            yield return AwaitCatalog(() => _catalog.TryGetLocationDataByMapId("test:map", out _));
            AssetDatabase.CreateFolder(_root, "nested");
            WriteAndImport(_root + "/nested/nested.vproj", Project("nested"));
            // A source move changes ownership to the nearest project. Keep the destination map
            // valid without relying on the original project's entities or tilesets.
            _mapJson = JObject.Parse("{\"id\":\"test:map\",\"width\":1,\"height\":1}");
            ImportMap();
            var movedPath = _root + "/nested/" + Path.GetFileName(_mapPath);
            Assert.That(AssetDatabase.MoveAsset(_mapPath, movedPath), Is.Empty);
            _mapPath = movedPath;
            yield return AwaitCatalog(() => _catalog.MapBindings.All(row => row.MapId != "test:map"));
            Assert.That(_catalog.MapBindings.Single().LocationData, Is.SameAs(_target));
        }

        [Test]
        public void DuplicateMapIdsRejectRefreshWithoutReplacingTheCatalog()
        {
            ImportMap();
            var duplicatePath = _root + "/" + Path.GetFileName(_root) + "_duplicate.vmap";
            _extraScenePaths.Add(VulcanusMapScenePostprocessor.GetScenePath(duplicatePath));
            WriteAndImport(duplicatePath, _mapJson.ToString());
            BindCatalogProject();
            try
            {
                Assert.That(Assert.Throws<InvalidOperationException>(() => VulcanusWorldCatalogDiscovery.Refresh(_catalog)).Message,
                    Does.Contain("Duplicate map ID"));
                Assert.That(_catalog.MapBindings.Single().LocationData, Is.SameAs(_target));
            }
            finally { BindCatalogProject(null); }
        }

        private MusicCue MusicFixture()
        {
            var cue = ApolloCueImporterTests.CreateFixture("map-import-" + Guid.NewGuid().ToString("N"));
            _musicFixturePath = AssetDatabase.GetAssetPath(cue);
            CatalogDiscovery.Refresh(Resources.Load<DefinitionCatalog>(DefinitionCatalog.ResourceName));
            return cue;
        }

        private static string Project(string id) =>
            $"{{ \"id\": \"{id}\", \"version\": \"1.0\", \"name\": \"{id}\", \"tileSize\": 16, \"defaultMapWidth\": 32, \"defaultMapHeight\": 32 }}";

        private void BindCatalogProject(string path = "fixture.vproj")
        {
            var serialized = new SerializedObject(_catalog);
            serialized.FindProperty("project").objectReferenceValue = path == null ? null :
                AssetDatabase.LoadAssetAtPath<VulcanusProject>(_root + "/" + path);
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static IEnumerator AwaitCatalog(Func<bool> ready)
        {
            var deadline = EditorApplication.timeSinceStartup + 15;
            while (!ready() && EditorApplication.timeSinceStartup < deadline) yield return null;
            Assert.That(ready(), Is.True, "Automatic world catalog refresh did not complete.");
        }

        private VulcanusImportedMap ImportMap()
        {
            WriteAndImport(_mapPath, _mapJson.ToString());
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(_mapPath);
            Assert.That(prefab, Is.Not.Null);
            return prefab.GetComponent<VulcanusImportedMap>();
        }

        private LocationData ImportedLocation() => AssetDatabase.LoadAllAssetsAtPath(_mapPath).OfType<LocationData>().Single();

        private static void WriteAndImport(string path, string json)
        {
            File.WriteAllText(Absolute(path), json);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
        }

        private static string Absolute(string path) => VulcanusImportHelpers.ToAbsolutePath(path);

        private sealed class LocationListenerProbe : MonoBehaviour, ILocationLifecycle
        {
            public void OnLocationEnter(LocationData location) { }
            public void OnLocationLeave(LocationData location) { }
        }
    }
}
