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
using UnityEngine.TestTools;
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
            var mapRoot = new GameObject("Empty character test map", typeof(Grid), typeof(VulcanusImportedMap));
            mapRoot.transform.SetParent(_fixture.Root.transform);
            var map = mapRoot.GetComponent<VulcanusImportedMap>();
            map.Configure("test:characters", "Character test map", 32, 24, 16);
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

        [TestCase(false)]
        [TestCase(true)]
        public void CinematicMovementCrossesAnObstacleAndRestoresCollisions(bool cancelDuringOverlap)
        {
            var simulationMode = Physics2D.simulationMode;
            Physics2D.simulationMode = SimulationMode2D.Script;
            try
            {
                var body = _actor.GetComponent<Rigidbody2D>();
                var solid = _actor.GetComponentsInChildren<Collider2D>().First(c => !c.isTrigger && c.attachedRigidbody == body);
                solid.excludeLayers = 1 << 31;
                solid.layerOverridePriority = 7;
                var start = body.position;
                var destination = start + Vector2.right * 3;
                var wall = new GameObject("Cinematic test obstacle", typeof(BoxCollider2D), typeof(Rigidbody2D));
                wall.transform.SetParent(_fixture.Root.transform);
                wall.transform.position = solid.bounds.center + Vector3.right * 1.5f;
                var mask = Physics2D.GetLayerCollisionMask(solid.gameObject.layer) & ~(1 << 31);
                Assert.That(mask, Is.Not.Zero, "The authored character must collide with at least one layer.");
                wall.layer = Enumerable.Range(0, 31).First(layer => (mask & (1 << layer)) != 0);
                wall.GetComponent<BoxCollider2D>().size = new Vector2(0.2f, 3);
                wall.GetComponent<Rigidbody2D>().constraints = RigidbodyConstraints2D.FreezeAll;
                Physics2D.SyncTransforms();

                using (var blocked = CharacterNavigation.MoveTo(_actor, destination))
                    Assert.That(blocked.Status, Is.EqualTo(NavigationMoveStatus.Unreachable));
                LogAssert.Expect(LogType.Warning, new System.Text.RegularExpressions.Regex(
                    "Collision ignored during movement:.*Cinematic test obstacle"));
                using (var move = CharacterNavigation.MoveTo(_actor, destination, true, true))
                {
                    Assert.That(solid.enabled, Is.True);
                    Assert.That(solid.isTrigger, Is.False);
                    for (var step = 0; step < 600 && move.Status == NavigationMoveStatus.Moving; step++)
                    {
                        move.Tick(Time.fixedDeltaTime);
                        GameTestFixture.Invoke(_actor.Controller, "FixedUpdate");
                        Assert.That(Physics2D.Simulate(Time.fixedDeltaTime), Is.True);
                        if (cancelDuringOverlap && body.position.x >= start.x + 1.5f)
                        {
                            move.Tick(0);
                            move.Dispose();
                        }
                    }
                    Assert.That(move.Status, Is.EqualTo(cancelDuringOverlap
                        ? NavigationMoveStatus.Cancelled : NavigationMoveStatus.Arrived));
                    if (!cancelDuringOverlap)
                        Assert.That(Vector2.Distance(body.position, destination), Is.LessThanOrEqualTo(0.04f));
                }
                Assert.That(solid.excludeLayers.value, Is.EqualTo(1 << 31));
                Assert.That(solid.layerOverridePriority, Is.EqualTo(7));
                Assert.That(_actor.Controller.IsMovementOwned, Is.False);
                LogAssert.NoUnexpectedReceived();
            }
            finally
            {
                Physics2D.simulationMode = simulationMode;
            }
        }

        [TestCase(true)]
        [TestCase(false)]
        public void CutsceneWalkSpeedUsesTheAuthoredAccelerationOption(bool immediate)
        {
            var body = _actor.GetComponent<Rigidbody2D>();
            var destination = body.position + Vector2.right;
            using var move = new MoveToAction(_actor, destination, immediate);
            move.Tick(0);
            GameTestFixture.Invoke(_actor.Controller, "FixedUpdate");
            if (immediate)
                Assert.That(body.linearVelocity.x, Is.EqualTo(_actor.Attributes.WalkSpeed).Within(0.001f));
            else
                Assert.That(body.linearVelocity.x, Is.InRange(0.001f, _actor.Attributes.WalkSpeed - 0.001f));

            body.position = destination - Vector2.right * 0.2f;
            move.Tick(0);
            GameTestFixture.Invoke(_actor.Controller, "FixedUpdate");
            Assert.That(body.linearVelocity.x, Is.EqualTo(immediate ? _actor.Attributes.WalkSpeed : 1.6f).Within(0.001f));
        }

        [Test]
        public void DefaultCutscenePathStartsEachSegmentAtFullSpeedAndStopsWithoutOvershooting()
        {
            var body = _actor.GetComponent<Rigidbody2D>();
            var first = body.position + Vector2.right;
            var second = first + Vector2.up;
            using var path = new WalkPathAction(_actor, new[] { first, second });
            path.Tick(0);
            GameTestFixture.Invoke(_actor.Controller, "FixedUpdate");
            Assert.That(body.linearVelocity, Is.EqualTo(Vector2.right * _actor.Attributes.WalkSpeed));
            body.position = first;
            path.Tick(0);
            GameTestFixture.Invoke(_actor.Controller, "FixedUpdate");
            Assert.That(body.linearVelocity, Is.EqualTo(Vector2.up * _actor.Attributes.WalkSpeed));

            // Less than one full-speed step remains, but more than the arrival tolerance.
            var remaining = 0.05f;
            body.position = second - Vector2.up * remaining;
            path.Tick(0);
            GameTestFixture.Invoke(_actor.Controller, "FixedUpdate");
            Assert.That(body.linearVelocity.y * Time.fixedDeltaTime, Is.EqualTo(remaining).Within(0.001f));
            body.position = second;
            path.Tick(0);
            Assert.That(path.IsCompleted, Is.True);
            Assert.That(body.linearVelocity, Is.EqualTo(Vector2.zero));
            Assert.That(_actor.Controller.IsMovementOwned, Is.False);
            _actor.Controller.SetMovementInput(Vector2.right, _actor.Attributes.WalkSpeed);
            GameTestFixture.Invoke(_actor.Controller, "FixedUpdate");
            Assert.That(body.linearVelocity.x, Is.LessThan(_actor.Attributes.WalkSpeed), "Normal movement regains acceleration after the cutscene.");
        }

        [TestCase(1f, 1f, 1, 0)]
        [TestCase(-1f, 1f, -1, 0)]
        [TestCase(1f, -1f, 1, 0)]
        [TestCase(-1f, -1f, -1, 0)]
        [TestCase(0.99f, 1f, 0, 1)]
        [TestCase(-0.99f, -1f, 0, -1)]
        [TestCase(1f, 0.99f, 1, 0)]
        [TestCase(-1f, -0.99f, -1, 0)]
        public void WalkingKeepsSegmentFacingAcrossDiagonalCorrections(float x, float y, int facingX, int facingY)
        {
            var body = _actor.GetComponent<Rigidbody2D>();
            var start = body.position;
            var destination = start + new Vector2(x, y);
            var expected = new Vector2(facingX, facingY);
            var changes = 0;
            _actor.Orientation.ForceDirection(-expected);
            _actor.Orientation.OnFacingDirectionChanged += _ => changes++;
            using (var move = new MoveToAction(_actor, destination))
            {
                move.Tick(0);
                Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(expected));
                for (var i = 0; i < 6; i++)
                {
                    // Cross the 45-degree boundary on successive frames, as small physics
                    // corrections do during a diagonal approach. Movement must still steer.
                    var remaining = new Vector2(Mathf.Sign(x) * (i % 2 == 0 ? 0.2f : 0.21f),
                        Mathf.Sign(y) * (i % 2 == 0 ? 0.21f : 0.2f));
                    body.position = destination - remaining;
                    move.Tick(0);
                    Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(expected));
                    GameTestFixture.Invoke(_actor.Controller, "FixedUpdate");
                    Assert.That(Vector2.Distance(_actor.Controller.CurrentVelocity.normalized, remaining.normalized),
                        Is.LessThan(0.001f));
                }
                body.position = destination;
                move.Tick(0);
                Assert.That(move.IsCompleted, Is.True);
                Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(expected));
                Assert.That(changes, Is.EqualTo(1));
            }

            // A subsequent path segment makes its own facing decision.
            using var next = new MoveToAction(_actor, destination - expected);
            next.Tick(0);
            Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(-expected));
        }

        [TestCase(168, 104, true)]
        [TestCase(171, 106, true)]
        [TestCase(171, 106, false)]
        public void CompletionPixelsAlignFeetAndCancellationRestoresOriginalStaging(int x, int y, bool completed)
        {
            _actor.Orientation.ForceDirection(Vector2.right);
            var original = _actor.Graphics.position;
            var point = new MapPosition(x, y);
            var lua = CutsceneSequenceCompiler.Compile(Sequence("East"), "endpoint.json", out var steps);
            var definition = _fixture.Own(ScriptableObject.CreateInstance<CutsceneDefinition>());
            definition.Configure("test:pixel-endpoint", "test:characters", lua, steps, true,
                new CutsceneCompletion(new[] { new CutsceneCharacterPlacement("player", point) }, "", "", Array.Empty<CutsceneStep>()),
                "", Array.Empty<CutsceneStep>());
            var type = typeof(CutsceneRun).Assembly.GetType("Core.Scripting.CutscenePlacement");
            var placement = type.GetMethod("PrepareActor", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { definition, _api, "player" });
            _api.Place("player", new MapPosition(32, 32));
            _actor.Orientation.ForceDirection(Vector2.up);
            type.GetMethod("Apply", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(placement, new object[] { completed });
            var expected = completed ? point.ToWorld(MapManager.Instance.CurrentMap) : original;
            Assert.That(Vector3.Distance(_actor.Graphics.position, expected), Is.LessThan(0.0001f));
            Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(completed ? Vector2.up : Vector2.right));
        }

        [TestCase(true, null)]
        [TestCase(false, null)]
        [TestCase(true, "West")]
        [TestCase(false, "West")]
        [TestCase(true, "preserve")]
        public void CompletionKeepsLiveFacingUnlessAnEndpointOverridesIt(bool completed, string facing)
        {
            _actor.Orientation.ForceDirection(Vector2.right);
            var original = _actor.transform.position;
            var lua = CutsceneSequenceCompiler.Compile(Sequence("North"), "facing.json", out var steps);
            var definition = _fixture.Own(ScriptableObject.CreateInstance<CutsceneDefinition>());
            var endpoints = facing == null ? Array.Empty<CutsceneCharacterPlacement>() : new[] { new CutsceneCharacterPlacement("player", new MapPosition(168, 104), facing) };
            definition.Configure("test:completion-facing", "test:characters", lua, steps, true,
                new CutsceneCompletion(endpoints, "", "", Array.Empty<CutsceneStep>()), "", Array.Empty<CutsceneStep>());
            var type = typeof(CutsceneRun).Assembly.GetType("Core.Scripting.CutscenePlacement");
            var placement = type.GetMethod("PrepareActor", BindingFlags.Static | BindingFlags.NonPublic).Invoke(null, new object[] { definition, _api, "player" });
            _api.Place("player", new MapPosition(32, 32));
            _actor.Orientation.ForceDirection(Vector2.up);
            type.GetMethod("Apply", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(placement, new object[] { completed });
            var expected = !completed ? Vector2.right : facing == "West" ? Vector2.left : Vector2.up;
            Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(expected));
            if (facing == null || !completed) Assert.That(_actor.transform.position, Is.EqualTo(original));
        }

        [TestCase(null, 0, 1)]
        [TestCase("preserve", -1, 0)]
        [TestCase("South", 0, -1)]
        public void AnchorFinalFacingCanBeUsedPreservedOrOverridden(string facing, int x, int y)
        {
            var map = MapManager.Instance.CurrentMap;
            var anchor = new GameObject("Meeting", typeof(VulcanusMapAnchor)).GetComponent<VulcanusMapAnchor>();
            anchor.transform.SetParent(map.transform);
            anchor.transform.position = new Vector3(5, 8, 0);
            anchor.Configure("meeting", "Meeting", Vector2.up, Array.Empty<string>());
            var lua = CutsceneSequenceCompiler.Compile(Sequence("North"), "facing.json", out var steps);
            _api = (MapActorLuaApi)typeof(MapActorLuaApi).GetConstructors(BindingFlags.Instance | BindingFlags.NonPublic).Single()
                .Invoke(new object[] { map, _actor, Array.Empty<SpawnedObject>() });
            var definition = _fixture.Own(ScriptableObject.CreateInstance<CutsceneDefinition>());
            definition.Configure("test:anchor-facing", "test:characters", lua, steps, true,
                new CutsceneCompletion(new[] { new CutsceneCharacterPlacement("player", "meeting", facing) }, "", "", Array.Empty<CutsceneStep>()), "", Array.Empty<CutsceneStep>());
            var type = typeof(CutsceneRun).Assembly.GetType("Core.Scripting.CutscenePlacement");
            var placement = type.GetMethod("PrepareActor", BindingFlags.Static | BindingFlags.NonPublic).Invoke(null, new object[] { definition, _api, "player" });
            _actor.Orientation.ForceDirection(Vector2.left);
            type.GetMethod("Apply", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(placement, new object[] { true });
            Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(new Vector2(x, y)));
        }

        [TestCase(false, false)]
        [TestCase(true, false)]
        [TestCase(false, true)]
        [TestCase(true, true)]
        public void EndingACutsceneReleasesOnlyItsOwnHeldPose(bool completed, bool preexisting)
        {
            _actor.Graphics.gameObject.SetActive(true);
            GameTestFixture.Invoke(_actor.Animator, "Awake");
            GameTestFixture.Invoke(_actor.GetComponentInChildren<Animancer.NamedAnimancerComponent>(true), "Awake");
            _actor.Animator.OnLocationEnter(null);
            var lua = CutsceneSequenceCompiler.Compile(Sequence("North"), "hold-rollback.json", out var steps);
            var definition = _fixture.Own(ScriptableObject.CreateInstance<CutsceneDefinition>());
            definition.Configure("test:hold-rollback", "test:characters", lua, steps, true,
                new CutsceneCompletion(Array.Empty<CutsceneCharacterPlacement>(), "", "", Array.Empty<CutsceneStep>()), "", Array.Empty<CutsceneStep>());
            var type = typeof(CutsceneRun).Assembly.GetType("Core.Scripting.CutscenePlacement");
            object PreparePlacement() => type.GetMethod("PrepareActor", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { definition, _api, "player" });
            var placement = preexisting ? null : PreparePlacement();
            using var action = new PlayAnimationAction(_actor, _actor.PassOutAnimation, true);
            var field = typeof(UrCharacterAnimator).GetField("_interactionState", BindingFlags.Instance | BindingFlags.NonPublic);
            var state = (Animancer.AnimancerState)field.GetValue(_actor.Animator);
            state.Time = state.Length;
            action.Dispose();
            Assert.That(field.GetValue(_actor.Animator), Is.SameAs(state));
            if (preexisting) placement = PreparePlacement();
            type.GetMethod("Apply", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(placement, new object[] { completed });
            if (preexisting)
            {
                Assert.That(field.GetValue(_actor.Animator), Is.SameAs(state));
                return;
            }
            Assert.That(field.GetValue(_actor.Animator), Is.Null);
            var animancer = _actor.GetComponentInChildren<Animancer.NamedAnimancerComponent>(true);
            Assert.That(animancer.States.Current.Clip, Is.SameAs(
                _actor.Animator.AnimationLibrary.GetDirectional("Idle", _actor.Orientation.FacingDirection)));
        }

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

        [Test]
        public void ComputedPlayerReferenceBindsStagingWithoutRejectingTheRunsOwnControlClaim()
        {
            var variables = new[] { new CutsceneVariableDefinition("actor", "string", "\"player\"") };
            var source = JArray.Parse("[{id:'turn',action:'characters.faceDirection',arguments:{direction:'North'},argumentVariables:{character:'actor'}}]");
            var lua = CutsceneSequenceCompiler.Compile(source, "computed-player", out var steps, variables: variables);
            var definition = _fixture.Own(ScriptableObject.CreateInstance<CutsceneDefinition>());
            definition.Configure("test:computed-player", "test:characters", lua, steps, true,
                new CutsceneCompletion(Array.Empty<CutsceneCharacterPlacement>(), "", "", Array.Empty<CutsceneStep>()),
                "", Array.Empty<CutsceneStep>(), localVariables: variables);
            var bindings = CutsceneBindings.BindSequence(steps, "cutscene", (typeof(MapActorLuaApi), () => _api));
            var state = new CutsceneVariables(variables);
            using var session = VulcanusLuaEngine.StartSession(bindings, lua, "computed-player", variables: state);
            var owner = _fixture.RegisterSingleton<CutsceneRunner>();
            var placementType = typeof(CutsceneRun).Assembly.GetType("Core.Scripting.CutscenePlacement");
            var run = (CutsceneRun)typeof(CutsceneRun).GetConstructors(BindingFlags.Instance | BindingFlags.NonPublic).Single()
                .Invoke(new object[] { owner, definition, session, Array.CreateInstance(placementType, 0), bindings, _api, state });
            var callback = typeof(LuaBindingRegistry).GetField("DynamicActionBound", BindingFlags.Instance | BindingFlags.NonPublic);
            callback.SetValue(bindings, Delegate.CreateDelegate(callback.FieldType, run,
                typeof(CutsceneRun).GetMethod("BindDynamicAction", BindingFlags.Instance | BindingFlags.NonPublic)));
            _actor.SetControlBlocked(run, true);
            try
            {
                session.Tick(0);
                Assert.That(session.IsRunning, Is.False);
                Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(Vector2.up));
                var placements = (System.Collections.ICollection)typeof(CutsceneRun).GetProperty("Placements", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(run);
                Assert.That(placements.Count, Is.EqualTo(1));
            }
            finally { _actor.SetControlBlocked(run, false); }
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
        [TestCase("{'anchor':''}")]
        [TestCase("{'anchor':'meeting','x':1,'y':2}")]
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
        [TestCase("{ anchor = '' }")]
        [TestCase("{ anchor = 'meeting', x = 1, y = 2 }")]
        public void DirectLuaRejectsMalformedPositionTables(string literal)
        {
            var before = _actor.transform.position;
            using var run = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(_api), $"Characters.Place('player', {literal})", "bad-position");
            Assert.That(() => run.Tick(0), Throws.InvalidOperationException);
            Assert.That(_actor.transform.position, Is.EqualTo(before));
        }

        [Test]
        public void PositionOutsideMapIsRejectedBeforePlacement()
        {
            var map = MapManager.Instance.CurrentMap;
            var before = _actor.transform.position;
            Assert.That(() => _api.ValidatePlace("player", new MapPosition((double)map.Width * map.TileSize + 1, 0)),
                Throws.TypeOf<ArgumentOutOfRangeException>().With.Message.Contains("outside map"));
            Assert.That(_actor.transform.position, Is.EqualTo(before));
        }

        [Test]
        public void ATextArgumentCannotSilentlyBecomeTheMapOrigin()
        {
            var steps = new[] { new CutsceneStep("place-player", "characters.place", new[]
            {
                new CutsceneArgument("character", "player"), new CutsceneArgument("position", "168,104")
            }) };
            Assert.That(() => CutsceneBindings.BindSequence(steps, "cutscene", (typeof(MapActorLuaApi), () => _api)),
                Throws.InvalidOperationException.With.Message.Contains("position").And.Message.Contains("not a position"));
        }

        [Test]
        public void PositionHintsAndVersionTwoPreviewAreExported()
        {
            var method = VulcanusLuaEngine.DescribeBindings().modules.Single(module => module.path == "Characters")
                .methods.Single(method => method.name == "Place");
            var parameter = method.parameters.Single(parameter => parameter.name == "position");
            Assert.That(parameter.type, Is.EqualTo("position"));
            Assert.That(parameter.picker, Is.EqualTo("mapPosition"));
            Assert.That(parameter.coordinateSpace, Is.EqualTo("mapPixels"));
            Assert.That(parameter.origin, Is.EqualTo("topLeft"));
            Assert.That(parameter.placementModes, Is.EqualTo(new[] { "tile", "pixel", "anchor" }));
            Assert.That(parameter.tileAnchor, Is.EqualTo("center"));
            Assert.That(parameter.characterPivot, Is.EqualTo("feet"));
            Assert.That(method.action.phases, Is.EqualTo(new[] { "completion", "sequence", "setup" }));
            Assert.That(method.action.preview.version, Is.EqualTo(2));
            var effect = method.action.preview.effects.Single();
            Assert.That(effect.kind, Is.EqualTo("setCharacterPosition"));
            Assert.That(effect.positionParameter, Is.EqualTo("position"));
            Assert.That(effect.facing, Is.EqualTo("preserve"));
        }

        private static JArray PlaceStep(JToken position) => new(new JObject
        {
            ["id"] = "place-player", ["action"] = "characters.place",
            ["arguments"] = new JObject { ["character"] = "player", ["position"] = position }
        });

        [Test]
        public void AnchorPositionsRoundTripAndPlaceFeetWithoutApplyingAnchorFacing()
        {
            var map = MapManager.Instance.CurrentMap;
            var anchor = new GameObject("Meeting", typeof(VulcanusMapAnchor)).GetComponent<VulcanusMapAnchor>();
            anchor.transform.SetParent(map.transform);
            anchor.transform.position = new Vector3(5, 8, 0);
            anchor.Configure("meeting", "Meeting", Vector2.up, Array.Empty<string>());
            _actor.Orientation.ForceDirection(Vector2.right);
            var lua = CutsceneSequenceCompiler.Compile(PlaceStep(new JObject { ["anchor"] = "meeting" }), "anchor.json", out var steps);
            var restored = JsonUtility.FromJson<CutsceneStep>(JsonUtility.ToJson(steps.Single()));
            Assert.That(restored.Arguments.Single(argument => argument.Name == "position").Position.Anchor, Is.EqualTo("meeting"));
            var bindings = CutsceneBindings.BindSequence(steps, "cutscene", (typeof(MapActorLuaApi), () => _api));
            using var session = VulcanusLuaEngine.StartSession(bindings, lua, "anchor.json");
            session.Tick(0);
            Assert.That(Vector3.Distance(_actor.Graphics.position, anchor.transform.position), Is.LessThan(0.0001f));
            Assert.That(_actor.Orientation.FacingDirection, Is.EqualTo(Vector2.right));
            Assert.That(() => _api.ValidatePlace("player", new MapPosition("missing")),
                Throws.InvalidOperationException.With.Message.Contains("missing"));
        }

        [Test]
        public void SpawnPreflightDeclaresRolesWithoutCreatingWorldObjects()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Content/Spawnables/CutscenePrototypeHost.prefab").GetComponent<SpawnedObject>();
            var catalog = _fixture.Own(ScriptableObject.CreateInstance<SpawnableCatalog>());
            catalog.Synchronize(new[] { prefab });
            var spawner = _fixture.AddSingleton<WorldObjectSpawner>(value =>
                typeof(WorldObjectSpawner).GetField("catalog", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(value, catalog));
            _api.ValidateSpawn("guest", "base:cutscene-prototype-host", new MapPosition(168, 104));
            _api.ValidateFaceDirection("guest", "North");
            _api.ValidateFace("player", "guest");
            _api.ValidatePlace("guest", new MapPosition(171, 106));
            Assert.That(spawner.SpawnedObjects, Is.Empty);
            Assert.That(() => _api.ValidateSpawn("guest", "base:cutscene-prototype-host", new MapPosition(1, 1)),
                Throws.InvalidOperationException.With.Message.Contains("unique"));
            Assert.That(() => _api.ValidateSpawn("player", "base:cutscene-prototype-host", new MapPosition(1, 1)),
                Throws.InvalidOperationException.With.Message.Contains("unique"));
            Assert.That(() => _api.ValidateFaceDirection("not-declared", "North"), Throws.InvalidOperationException);
            Assert.That(() => _api.ValidateSpawn("other", "base:cutscene-prototype-host", new MapPosition("missing")),
                Throws.InvalidOperationException.With.Message.Contains("missing"));
            Assert.That(() => _api.ValidateFaceDirection("other", "North"), Throws.InvalidOperationException);
        }

        [Test]
        public void SpawnExportsResourceAndRoleDeclarationAndIsLimitedToSetup()
        {
            var method = VulcanusLuaEngine.DescribeBindings().modules.Single(module => module.path == "Characters")
                .methods.Single(method => method.name == "Spawn");
            Assert.That(method.parameters.Single(parameter => parameter.name == "character").semanticType, Is.EqualTo("characterDeclaration"));
            Assert.That(method.parameters.Single(parameter => parameter.name == "definition").resourceType, Is.EqualTo("character"));
            Assert.That(method.action.phases, Is.EqualTo(new[] { "setup" }));
            Assert.That(method.action.preview.effects.Single().definitionParameter, Is.EqualTo("definition"));
            var source = new JArray(new JObject { ["id"] = "create-guest", ["action"] = "characters.spawn",
                ["arguments"] = new JObject { ["character"] = "guest", ["definition"] = "base:cutscene-prototype-host",
                    ["position"] = new JObject { ["x"] = 168, ["y"] = 104 } } });
            Assert.That(() => CutsceneSequenceCompiler.Compile(source, "spawn.json"), Throws.TypeOf<FormatException>());
            Assert.That(CutsceneSequenceCompiler.Compile(source, "spawn.json", out _, "setup"), Does.Contain("Characters.Spawn"));
        }

        [TestCase(true)]
        [TestCase(false)]
        public void SpawnCreatesPlacedControlledActorAndKeepsOrRemovesItsSavedRecord(bool keep)
        {
            var holder = new GameObject("Spawn fixture templates");
            holder.SetActive(false);
            holder.transform.SetParent(_fixture.Root.transform);
            var template = Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(
                "Assets/Content/Spawnables/CutscenePrototypeHost.prefab"), holder.transform);
            Object.DestroyImmediate(template.GetComponent<SpawnedObject>());
            var prefab = template.AddComponent<EditModeSpawnedActor>();
            typeof(SpawnedObject).GetField("prefabId", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(prefab, "base:cutscene-prototype-host");
            var catalog = _fixture.Own(ScriptableObject.CreateInstance<SpawnableCatalog>());
            catalog.Synchronize(new SpawnedObject[] { prefab });
            var spawner = _fixture.AddSingleton<WorldObjectSpawner>(value =>
                typeof(WorldObjectSpawner).GetField("catalog", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(value, catalog));
            spawner.gameObject.SetActive(true);
            var location = _fixture.Own(ScriptableObject.CreateInstance<LocationData>());
            location.id = "test:characters";
            spawner.EnterLocation(location, Array.Empty<AuthoredSpawnPlacement>());
            var point = new MapPosition(168, 104);
            _api.ValidateSpawn("guest", "base:cutscene-prototype-host", point);
            var bindings = new LuaBindingRegistry(_api);
            var lua = CutsceneSequenceCompiler.Compile(new JArray(new JObject { ["id"] = "turn", ["action"] = "characters.faceDirection",
                ["arguments"] = new JObject { ["character"] = "guest", ["direction"] = "East" } }), "spawn.json", out var steps);
            var definition = _fixture.Own(ScriptableObject.CreateInstance<CutsceneDefinition>());
            definition.Configure("test:spawn", location.id, lua, steps, true,
                new CutsceneCompletion(Array.Empty<CutsceneCharacterPlacement>(), "", "", Array.Empty<CutsceneStep>()), "", Array.Empty<CutsceneStep>());
            var variables = new CutsceneVariables(definition.Variables);
            using var sequence = VulcanusLuaEngine.StartSession(bindings, lua, "spawn.json", variables: variables);
            var owner = _fixture.RegisterSingleton<CutsceneRunner>();
            var placementType = typeof(CutsceneRun).Assembly.GetType("Core.Scripting.CutscenePlacement");
            var run = (CutsceneRun)typeof(CutsceneRun).GetConstructors(BindingFlags.Instance | BindingFlags.NonPublic).Single()
                .Invoke(new object[] { owner, definition, sequence, Array.CreateInstance(placementType, 0), bindings, _api, variables });
            typeof(MapActorLuaApi).GetMethod("BeginRun", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(_api, new object[] { run });
            using (var setup = VulcanusLuaEngine.StartSession(bindings,
                "Characters.Spawn('guest', 'base:cutscene-prototype-host', { x = 168, y = 104 })", "spawn.json:setup", phase: "setup"))
            {
                setup.Tick(0);
                Assert.That(setup.IsRunning, Is.False);
            }
            var spawn = spawner.SpawnedObjects.Single();
            var character = spawn.GetComponentInChildren<GameCharacter>(true);
            Assert.That(character.IsRuntimeInitialized, Is.True);
            Assert.That(character.IsControlBlocked, Is.True);
            Assert.That(Vector3.Distance(character.Graphics.position, point.ToWorld(MapManager.Instance.CurrentMap)), Is.LessThan(0.0001f));
            sequence.Tick(0);
            Assert.That(character.Orientation.FacingDirection, Is.EqualTo(Vector2.right));
            var id = spawn.PersistentId;
            Assert.That(GameState.World.TryGet(location.id, id, out SpawnedObjectState state), Is.True);
            Assert.That(state.position, Is.EqualTo(spawn.transform.position));
            character.SetControlBlocked(run, false);
            // These callbacks were invoked explicitly in OnStateBound, so release their EditMode bindings explicitly too.
            GameTestFixture.Invoke(character.PerformPrimaryAction, "OnDestroy");
            GameTestFixture.Invoke(character, "OnDestroy");
            typeof(MapActorLuaApi).GetMethod("FinishSpawns", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(_api, new object[] { keep });
            Assert.That(GameState.World.TryGet(location.id, id, out SpawnedObjectState _), Is.EqualTo(keep));
            Assert.That(spawner.SpawnedObjects.Count, Is.EqualTo(keep ? 1 : 0));
        }

        [Test]
        public void ManifestExportsDirectionResourceAndPreviewArgumentMapping()
        {
            var manifest = VulcanusLuaEngine.DescribeBindings();
            var method = manifest.modules.Single(module => module.path == "Characters").methods.Single(method => method.name == "FaceDirection");
            Assert.That(method.action.id, Is.EqualTo("characters.faceDirection"));
            Assert.That(method.action.execution, Is.EqualTo("immediate"));
            Assert.That(method.action.contexts, Is.EqualTo(new[] { "cutscene", "npcRoutine" }));
            Assert.That(method.action.phases, Is.EqualTo(new[] { "completion", "sequence", "setup" }));
            Assert.That(method.parameters.Single(parameter => parameter.name == "direction").resourceType, Is.EqualTo("direction"));
            var effect = method.action.preview.effects.Single();
            Assert.That(effect.kind, Is.EqualTo("faceCharacterDirection"));
            Assert.That(effect.characterParameter, Is.EqualTo("character"));
            Assert.That(effect.directionParameter, Is.EqualTo("direction"));
            var catalog = Resources.Load<Character.Animations.CharacterAnimationCatalog>(Character.Animations.CharacterAnimationCatalog.ResourceName);
            LuaBindingManifestExporter.PopulateResources(manifest, catalog, new[] { _actor.Animator.AnimationLibrary }, Resources.Load<SoundCatalog>(SoundCatalog.ResourceName), Resources.Load<Core.TimeAndWeather.WeatherCatalog>(Core.TimeAndWeather.WeatherCatalog.ResourceName));
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
            ["id"] = "turn", ["action"] = "characters.faceDirection",
            ["arguments"] = new JObject { ["character"] = "player", ["direction"] = direction }
        });

        [LuaModule("WrongResource")]
        private sealed class WrongResource
        {
            [LuaAction("test.wrongDirection", "Wrong", "Test", "Wrong resource mapping.", "cutscene", Phases = new[] { "sequence" }, Validator = nameof(Check))]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.FaceCharacterDirection, CharacterParameter = "character", DirectionParameter = "direction")]
            public void Run([LuaReference("characterRef", "mapCharacter")] string character, [LuaResource("animation")] string direction) { }
            [Preserve] public void Check(string character, string direction) { }
        }
    }

    // EditMode does not run Awake on instantiated characters. Establish the same required bindings before Spawn returns.
    public sealed class EditModeSpawnedActor : SpawnedObject
    {
        protected override void OnStateBound()
        {
            var character = GetComponentInChildren<GameCharacter>(true);
            GameTestFixture.Invoke(character.GetComponent<Controller2D>(), "Awake");
            character.MainInventory.EnsureInitialized();
            GameTestFixture.Invoke(character, "Awake");
            foreach (var ability in character.GetComponentsInChildren<Character.Abilities.CharacterAbility>(true))
                typeof(Character.Abilities.CharacterAbility).GetField("Character", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(ability, character);
            typeof(Character.Abilities.CharacterPerformPrimaryActionAbility).GetProperty("ActionExecutor")
                .SetValue(character.PerformPrimaryAction, new Interaction.ActionExecutor(character,
                    () => Core.Context.PlayerInteractionContext.Instance.CurrentSnapshot));
            GameTestFixture.Invoke(character.Occupation, "Awake");
            character.EnsureRuntimeInitialized();
        }
    }
}
