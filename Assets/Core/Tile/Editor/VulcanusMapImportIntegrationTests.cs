using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Core.Location;
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
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;
using LocationType = Core.Common.LocationType;

namespace Core.Tile.Editor
{
    [Category("MapLoading")]
    public sealed class VulcanusMapImportIntegrationTests
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
            WriteAndImport(_root + "/fixture.vproj", "{\"id\":\"fixture\",\"tileSize\":16}");

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
            var spawnCatalog = AssetDatabase.LoadAssetAtPath<SpawnableCatalog>(SpawnableCatalogEditor.CatalogPath);
            Assert.That(spawnCatalog, Is.Not.Null);
            var sourcePrefab = spawnCatalog.Prefabs.FirstOrDefault();
            Assert.That(sourcePrefab, Is.Not.Null, "The shipped spawnable catalog must contain a persistent prefab.");
            _sourcePrefabId = sourcePrefab.PrefabId;

            _target = ScriptableObject.CreateInstance<LocationData>();
            _target.id = "test:target";
            AssetDatabase.CreateAsset(_target, _root + "/target.asset");
            _catalog = ScriptableObject.CreateInstance<VulcanusWorldCatalog>();
            _catalog.ApplySyncData(null, new[] { new VulcanusWorldCatalog.MapBinding("test:target", null, _target) });
            AssetDatabase.CreateAsset(_catalog, _root + "/fixture.project.world.asset");

            _mapJson = JObject.Parse(@"{
                'id':'test:map', 'name':'A display name', 'width':4, 'height':4,
                'tilesetRefs':['TEST:TILES'],
                'metadata':{'id':'override:forbidden','scenePath':'wrong','locationType':'Indoor'},
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
        }

        [Test]
        public void ImportCreatesTerrainLocationAndStableSceneBinding()
        {
            var map = ImportMap();
            var location = ImportedLocation();
            Assert.That(map.MapId, Is.EqualTo("test:map"));
            Assert.That(map.MapName, Is.EqualTo("A display name"));
            Assert.That(location.id, Is.EqualTo(map.MapId));
            Assert.That(location.scenePath, Is.EqualTo(_scenePath));
            Assert.That(location.locationType, Is.EqualTo(LocationType.Indoor));
            Assert.That(map.TerrainTilemap.GetTile(new Vector3Int(0, 3, 0)), Is.Not.Null);
            Assert.That(map.TryGetTerrainType(new Vector2Int(0, 3), out var terrain), Is.True);
            Assert.That(terrain, Is.EqualTo(TerrainType.Dirt));
            Assert.That(File.Exists(Absolute(_scenePath)), Is.True);
            Assert.That(EditorBuildSettings.scenes.Any(scene => scene.path == location.ScenePath), Is.True);
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
            Assert.That(source.GetComponent<UnityEngine.Tilemaps.TilemapCollider2D>(), Is.Not.Null);
            var waterCells = new[] { new Vector3Int(0, 3, 0), new Vector3Int(1, 3, 0), new Vector3Int(3, 3, 0),
                new Vector3Int(1, 2, 0), new Vector3Int(2, 1, 0) };
            foreach (var cell in waterCells)
            {
                var tile = source.GetTile<VulcanusTile>(cell);
                Assert.That(tile.WaterType, Is.EqualTo("Lake_1"));
                Assert.That(tile.IsFreshwater, Is.True);
                Assert.That(source.GetColliderType(cell), Is.EqualTo(UnityEngine.Tilemaps.Tile.ColliderType.Grid));
                Assert.That(source.GetColor(cell).a, Is.Zero);
                var surface = bodies.Select(body => body.GetComponent<UnityEngine.Tilemaps.Tilemap>()).Single(layer => layer.HasTile(cell));
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
                Assert.That(body.GetComponent<UnityEngine.Tilemaps.Tilemap>().color.a, Is.EqualTo(0.6f));
                Assert.That(body.GetComponent<UnityEngine.Tilemaps.TilemapRenderer>().sortingOrder, Is.EqualTo(5));
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
            Assert.That(objects.GetChild(0).localPosition, Is.EqualTo(new Vector3(1.5f, 2f, 0f)));
            foreach (Transform obj in objects)
            {
                Assert.That(obj.GetComponent<SpriteRenderer>().sprite, Is.SameAs(definition.sprite));
                Assert.That(obj.GetComponent<SpriteRenderer>().sortingOrder, Is.EqualTo(7));
                Assert.That(obj.GetComponent<PolygonCollider2D>(), Is.Not.Null);
                Assert.That(obj.GetComponent<Character.YSortByPosition>(), Is.Not.Null);
            }
            Assert.That(AssetDatabase.LoadAllAssetsAtPath(_mapPath).OfType<Texture2D>(), Is.Empty);
        }

        [Test]
        public void PersistentEntitiesAreInactiveTemplatesWithStablePlacementAndPrefabIdentity()
        {
            var map = ImportMap();
            var placement = map.PersistentEntities.Single();
            Assert.That(placement.id, Is.EqualTo("crate-1"));
            Assert.That(placement.template.PrefabId, Is.EqualTo(_sourcePrefabId));
            Assert.That(placement.template.gameObject.activeSelf, Is.True);
            Assert.That(placement.template.transform.parent.gameObject.activeSelf, Is.False);
            Assert.That(placement.template.State, Is.Null);
            Assert.That(placement.template.transform.localPosition, Is.EqualTo(new Vector3(1, 2, 0)));
            Assert.That(Quaternion.Angle(placement.template.transform.localRotation, Quaternion.Euler(0, 0, -90)), Is.LessThan(0.01f));
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
            var anchor = map.GetComponentInChildren<VulcanusMapAnchor>(true);
            Assert.That(anchor.transform.localPosition, Is.EqualTo(new Vector3(1, 3, 0)));
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
            var manager = root.AddComponent<LevelManager>();
            typeof(LevelManager).GetField("_locationByScenePath", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(manager, new Dictionary<string, LocationData>(StringComparer.OrdinalIgnoreCase) { [location.scenePath] = location });
            var resolved = typeof(LevelManager).GetMethod("GetLocationForScene", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(manager, new object[] { scene });
            Assert.That(resolved, Is.SameAs(location));
            Assert.That(typeof(LevelManager).GetMethod("ResolveInitialLocation", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(manager, null), Is.SameAs(location));

            var listenerRoot = new GameObject("Inactive location listener");
            listenerRoot.SetActive(false);
            _views.Add(listenerRoot);
            var listener = listenerRoot.AddComponent<WorldObjectSpawner>();
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
            File.WriteAllText(Absolute(folder + "/fixture.vproj"), "{\"id\":\"cold\",\"tileSize\":16}");
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
        public void InvalidRequiredContentFailsImportInsteadOfProducingATextAsset(string fault)
        {
            string message;
            switch (fault)
            {
                case "missing-tileset": _mapJson["tilesetRefs"] = new JArray("missing"); message = "references missing tileset"; break;
                case "missing-object": _mapJson["layers"][1]["objectInstances"][0]["objectDefinitionId"] = "missing"; message = "requires imported prefab"; break;
                case "missing-persistent-id": _mapJson["entities"][0]["id"] = ""; message = "needs an authored instance ID"; break;
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
        public IEnumerator CatalogAutomaticallyDiscoversImportsAndReimportsWithoutChangingManualAssignments()
        {
            BindCatalogProject();
            var prefab = AssetDatabase.LoadAssetAtPath<SpawnableCatalog>(SpawnableCatalogEditor.CatalogPath).Prefabs.First().gameObject;
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
            yield return AwaitCatalog(() => !_catalog.MapBindings.Any(row => row.MapId == "test:map"));
            Assert.That(_catalog.MapBindings.Single().LocationData, Is.SameAs(_target));
        }

        [UnityTest]
        public IEnumerator MovingAMapIntoAnotherProjectRemovesItFromTheOriginalCatalog()
        {
            BindCatalogProject();
            ImportMap();
            yield return AwaitCatalog(() => _catalog.TryGetLocationDataByMapId("test:map", out _));
            AssetDatabase.CreateFolder(_root, "nested");
            WriteAndImport(_root + "/nested/nested.vproj", "{\"id\":\"nested\",\"tileSize\":16}");
            // A source move changes ownership to the nearest project. Keep the destination map
            // valid without relying on the original project's entities or tilesets.
            _mapJson = JObject.Parse("{\"id\":\"test:map\",\"width\":1,\"height\":1}");
            ImportMap();
            var movedPath = _root + "/nested/" + Path.GetFileName(_mapPath);
            Assert.That(AssetDatabase.MoveAsset(_mapPath, movedPath), Is.Empty);
            _mapPath = movedPath;
            yield return AwaitCatalog(() => !_catalog.MapBindings.Any(row => row.MapId == "test:map"));
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
    }
}
