using System;
using System.Linq;
using System.Reflection;
using Character;
using Core.Common.Editor;
using Core.Game;
using Core.Location;
using Core.Spawning;
using Core.Tile;
using Core.Tile.Vulcanus;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Scripting;
using UnityEngine.Tilemaps;
using Object = UnityEngine.Object;

namespace Core.Scripting.Editor
{
    public sealed class FaceDirectionTests
    {
        private GameTestFixture _fixture;
        private MainCharacter _actor;
        private MapActorLuaApi _api;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Cardinal facing");
            _fixture.AddSingleton<GameStateManager>();
            _fixture.AddSingleton<CharacterManager>();
            _fixture.AddSingleton<Core.PlayerStateManager>();
            var level = _fixture.RegisterSingleton<LevelManager>();
            var maps = _fixture.RegisterSingleton<MapManager>();
            GameState.Time.daysSinceStart = 1;
            GameState.Player.Home = new PlayerHomeState("test:home", "test-bed");
            _actor = _fixture.CreateCharacter();
            _actor.EnsureRuntimeInitialized();
            _actor.transform.parent.gameObject.SetActive(true);
            // Facing and coordinate conversion need a valid map, not the playable map's textures/water bake.
            var mapRoot = new GameObject("Empty actor test map", typeof(Grid), typeof(VulcanusImportedMap));
            mapRoot.transform.SetParent(_fixture.Root.transform);
            var map = mapRoot.GetComponent<VulcanusImportedMap>();
            map.Configure("test:actors", "Actor test map", 32, 24, 16);
            Tilemap Layer(string name)
            {
                var layer = new GameObject(name, typeof(Tilemap));
                layer.transform.SetParent(mapRoot.transform, false);
                return layer.GetComponent<Tilemap>();
            }
            map.SetTilemaps(Layer("Terrain"), Layer("Farmland"), Layer("Plowed"), Layer("Irrigated"), Layer("Overlay"));
            map.SetTerrainCells(Array.Empty<VulcanusImportedMap.TerrainCell>());
            typeof(MapManager).GetField("_currentMap", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(maps, map);
            typeof(LevelManager).GetProperty(nameof(LevelManager.SceneReady)).SetValue(level, true);
            _fixture.Root.SetActive(true);
            _api = (MapActorLuaApi)typeof(MapActorLuaApi).GetConstructors(BindingFlags.Instance | BindingFlags.NonPublic).Single()
                .Invoke(new object[] { map, _actor, Array.Empty<SpawnedObject>() });
        }

        [TearDown]
        public void TearDown() => _fixture.Dispose();

        [TestCase("North", 0, 1)]
        [TestCase("East", 1, 0)]
        [TestCase("South", 0, -1)]
        [TestCase("West", -1, 0)]
        public void CompiledActionTurnsImmediatelyWithoutMoving(string direction, int x, int y)
        {
            var position = _actor.transform.position;
            var initialFacing = _actor.Orientation.FacingDirection;
            var lua = CutsceneSequenceCompiler.Compile(Sequence(direction), "facing.json", out var steps);
            var bindings = CutsceneBindings.BindSequence(steps, "cutscene", (typeof(MapActorLuaApi), () => _api));
            Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(initialFacing), "Binding must not execute actions.");
            using var run = VulcanusLuaEngine.StartSession(bindings, lua, "facing.json");
            run.Tick(0);
            Assert.That(run.IsRunning, Is.False);
            Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(new Vector2(x, y)));
            Assert.That(_actor.transform.position, Is.EqualTo(position));
            Assert.That(_actor.Controller.IsMovementOwned, Is.False);
        }

        [TestCase("north")]
        [TestCase("NorthEast")]
        [TestCase("0")]
        [TestCase(" North")]
        public void BindingRejectsUnsupportedDirectionWithStepIdentity(string direction)
        {
            CutsceneSequenceCompiler.Compile(Sequence(direction), "facing.json", out var steps);
            var initial = _actor.Orientation.FacingDirection;
            Assert.That(() => CutsceneBindings.BindSequence(steps, "cutscene", (typeof(MapActorLuaApi), () => _api)),
                Throws.InvalidOperationException.With.Message.Contains("step 'turn'").And.Message.Contains("Unknown direction"));
            Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(initial));
        }

        [Test]
        public void UnknownActorsFailBeforePlayback()
        {
            Assert.That(() => _api.ValidateFaceDirection("missing", "North"), Throws.InvalidOperationException.With.Message.Contains("missing"));
        }

        [TestCase(168, 104)]
        [TestCase(171, 106)]
        public void PlaceAlignsFeetInTransformedMapSpaceAndPreservesFacing(double x, double y)
        {
            var map = MapManager.Instance.CurrentMap;
            map.transform.position = new Vector3(7, -3, 0);
            map.transform.rotation = Quaternion.Euler(0, 0, 15);
            map.transform.localScale = new Vector3(1.5f, 1.5f, 1);
            var expected = map.transform.TransformPoint(new Vector3((float)(x / map.TileSize), (float)(map.Height - y / map.TileSize), 0));
            _actor.Orientation.ForceDirection(Vector2.right);
            var before = _actor.transform.position;
            var lua = CutsceneSequenceCompiler.Compile(PlaceStep(new JObject { ["x"] = x, ["y"] = y }), "place.json", out var steps);
            var bindings = CutsceneBindings.BindSequence(steps, "cutscene", (typeof(MapActorLuaApi), () => _api));
            Assert.That(_actor.transform.position, Is.EqualTo(before));
            var restored = JsonUtility.FromJson<CutsceneStep>(JsonUtility.ToJson(steps.Single()));
            Assert.That(restored.Arguments.Single(argument => argument.Name == "position").Position.X, Is.EqualTo(x));
            Assert.That(restored.Arguments.Single(argument => argument.Name == "position").Position.Y, Is.EqualTo(y));
            using var run = VulcanusLuaEngine.StartSession(bindings, lua, "place.json");
            run.Tick(0);
            Assert.That(run.IsRunning, Is.False);
            Assert.That(Vector3.Distance(_actor.Graphics.position, expected), Is.LessThan(0.0001f));
            Assert.That(Vector2.Distance(_actor.GetComponent<Rigidbody2D>().position, _actor.transform.position), Is.LessThan(0.0001f));
            Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(Vector2.right));
        }

        [TestCase("{'x':1}")]
        [TestCase("{'x':'1','y':2}")]
        [TestCase("{'x':-1,'y':2}")]
        [TestCase("{'x':NaN,'y':2}")]
        [TestCase("{'x':1,'y':Infinity}")]
        [TestCase("{'x':1,'y':2,'mode':'tile'}")]
        [TestCase("[1,2]")]
        public void InvalidPositionsFailCompilationWithStepIdentity(string json)
        {
            Assert.That(() => CutsceneSequenceCompiler.Compile(PlaceStep(JToken.Parse(json)), "place.json"),
                Throws.TypeOf<FormatException>().With.Message.Contains("place.json: sequence[0] (place-player)"));
        }

        [TestCase("{ x = 1 }")]
        [TestCase("{ x = '1', y = 2 }")]
        [TestCase("{ x = 0/0, y = 2 }")]
        [TestCase("{ x = 1, y = 2, mode = 'tile' }")]
        public void DirectLuaRejectsMalformedPositionTables(string literal)
        {
            var before = _actor.transform.position;
            using var run = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(_api), $"Actors.Place('player', {literal})", "bad-position");
            Assert.That(() => run.Tick(0), Throws.InvalidOperationException);
            Assert.That(_actor.transform.position, Is.EqualTo(before));
        }

        [Test]
        public void PositionOutsideMapIsRejectedBeforePlacement()
        {
            var map = MapManager.Instance.CurrentMap;
            var before = _actor.transform.position;
            Assert.That(() => _api.ValidatePlace("player", new MapPixelPosition((double)map.Width * map.TileSize + 1, 0)),
                Throws.TypeOf<ArgumentOutOfRangeException>().With.Message.Contains("outside map"));
            Assert.That(_actor.transform.position, Is.EqualTo(before));
        }

        [Test]
        public void ATextArgumentCannotSilentlyBecomeTheMapOrigin()
        {
            var steps = new[] { new CutsceneStep("place-player", "actors.place", new[]
            {
                new CutsceneArgument("actor", "player"), new CutsceneArgument("position", "168,104")
            }) };
            Assert.That(() => CutsceneBindings.BindSequence(steps, "cutscene", (typeof(MapActorLuaApi), () => _api)),
                Throws.InvalidOperationException.With.Message.Contains("position").And.Message.Contains("not a position"));
        }

        [Test]
        public void PositionHintsAndVersionTwoPreviewAreExported()
        {
            var method = VulcanusLuaEngine.DescribeBindings().modules.Single(module => module.path == "Actors")
                .methods.Single(method => method.name == "Place");
            var parameter = method.parameters.Single(parameter => parameter.name == "position");
            Assert.That(parameter.type, Is.EqualTo("position"));
            Assert.That(parameter.picker, Is.EqualTo("mapPosition"));
            Assert.That(parameter.coordinateSpace, Is.EqualTo("mapPixels"));
            Assert.That(parameter.origin, Is.EqualTo("topLeft"));
            Assert.That(parameter.placementModes, Is.EqualTo(new[] { "tile", "pixel" }));
            Assert.That(parameter.tileAnchor, Is.EqualTo("center"));
            Assert.That(parameter.actorPivot, Is.EqualTo("feet"));
            Assert.That(method.action.phases, Is.EqualTo(new[] { "completion", "sequence", "setup" }));
            Assert.That(method.action.preview.version, Is.EqualTo(2));
            var effect = method.action.preview.effects.Single();
            Assert.That(effect.kind, Is.EqualTo("setActorPosition"));
            Assert.That(effect.positionParameter, Is.EqualTo("position"));
            Assert.That(effect.facing, Is.EqualTo("preserve"));
        }

        private static JArray PlaceStep(JToken position) => new(new JObject
        {
            ["id"] = "place-player", ["action"] = "actors.place",
            ["arguments"] = new JObject { ["actor"] = "player", ["position"] = position }
        });

        [Test]
        public void ManifestExportsDirectionResourceAndPreviewArgumentMapping()
        {
            var manifest = VulcanusLuaEngine.DescribeBindings();
            var method = manifest.modules.Single(module => module.path == "Actors").methods.Single(method => method.name == "FaceDirection");
            Assert.That(method.action.id, Is.EqualTo("actors.faceDirection"));
            Assert.That(method.action.execution, Is.EqualTo("immediate"));
            Assert.That(method.action.contexts, Is.EqualTo(new[] { "cutscene", "npcRoutine" }));
            Assert.That(method.action.phases, Is.EqualTo(new[] { "completion", "sequence", "setup" }));
            Assert.That(method.parameters.Single(parameter => parameter.name == "direction").resourceType, Is.EqualTo("direction"));
            var effect = method.action.preview.effects.Single();
            Assert.That(effect.kind, Is.EqualTo("faceActorDirection"));
            Assert.That(effect.actorParameter, Is.EqualTo("actor"));
            Assert.That(effect.directionParameter, Is.EqualTo("direction"));
            var catalog = Resources.Load<Character.Animations.CharacterAnimationCatalog>(Character.Animations.CharacterAnimationCatalog.ResourceName);
            LuaBindingManifestExporter.PopulateResources(manifest, catalog, new[] { _actor.Animator.AnimationLibrary });
            Assert.That(manifest.resources["direction"].Select(resource => resource.id), Is.EquivalentTo(new[] { "North", "East", "South", "West" }));
        }

        [Test]
        public void DirectionPreviewRejectsAnUnrelatedResourceType()
        {
            Assert.That(() => LuaBindingRegistry.DescribeTypes(typeof(WrongResource)),
                Throws.InvalidOperationException.With.Message.Contains("resource type 'direction'"));
        }

        private static JArray Sequence(string direction) => new(new JObject
        {
            ["id"] = "turn", ["action"] = "actors.faceDirection",
            ["arguments"] = new JObject { ["actor"] = "player", ["direction"] = direction }
        });

        [LuaModule("WrongResource")]
        private sealed class WrongResource
        {
            [LuaAction("test.wrongDirection", "Wrong", "Test", "Wrong resource mapping.", "cutscene", Phases = new[] { "sequence" }, Validator = nameof(Check))]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.FaceActorDirection, ActorParameter = "actor", DirectionParameter = "direction")]
            public void Run([LuaReference("actorRef", "mapActor")] string actor, [LuaResource("animation")] string direction) { }
            [Preserve] public void Check(string actor, string direction) { }
        }
    }
}
