using System;
using System.Collections;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Linq;
using Character;
using Core.Game;
using Core.Catalogs;
using Core.Spawning;
using Core.Dialogue.Vulcanus;
using Core.Location;
using Core.Tile;
using Core.Tile.Vulcanus;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UI.Shared;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.UIElements;
using Object = UnityEngine.Object;

namespace Core.Scripting.Editor
{
    [Explicit("Uses the playable map and real dialogue UI across Unity frames.")]
    public sealed class DialogueActionPlayTests
    {
        private GameObject _root;
        private VulcanusDialogueRunner _runner;
        private UIDocument _document;
        private VulcanusDialogueDatabase _database;
        private VulcanusDialogueAsset _talk, _end, _error;

        [UnitySetUp]
        public IEnumerator SetUp()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/Maps/map-1.unity", OpenSceneMode.Single);
            yield return new EnterPlayMode();
            var deadline = Time.realtimeSinceStartup + 15f;
            while (!LevelManager.Instance || !LevelManager.Instance.SceneReady)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The map must finish initialization.");
                yield return null;
            }
            Assert.That(VulcanusDialogueRunner.Instance, Is.Not.Null, "The Systems prefab must provide the shared dialogue UI.");
            _talk = CreateDialogue("fixture:talk",
                new VulcanusDialogueLineNode("entry", "", "", "Hello", "", "choice"),
                new VulcanusDialogueChoiceNode("choice", new[] { new VulcanusDialogueChoiceOption("bye", "Goodbye", "", "", "end") }),
                new VulcanusDialogueEndNode("end"));
            _end = CreateDialogue("fixture:end", new VulcanusDialogueEndNode("entry"));
            _error = CreateDialogue("fixture:error", new VulcanusDialogueActionNode("entry", "error('Broken fixture script')", ""));
            _database = ScriptableObject.CreateInstance<VulcanusDialogueDatabase>();
            var authored = AssetDatabase.LoadAssetAtPath<VulcanusDialogueDatabase>("Assets/Vulcan/0204project/VulcanusDialogueDatabase.asset");
            _database.Configure(authored.Project, new[] { _talk, _end, _error }.Concat(authored.Dialogues).ToArray());

            _runner = VulcanusDialogueRunner.Instance;
            _root = _runner.gameObject;
            _document = _root.GetComponent<UIDocument>();
            Set(_runner, "database", _database);
            Set(_root.GetComponent<VulcanusDialogueUIDocumentPresenter>(), "charactersPerSecond", 0f);
        }

        [UnityTest]
        public IEnumerator LuaWaitsForLineAndGoodbyeChoiceThenContinues()
        {
            var api = new DialogueLuaApi(_runner, MainCharacter.CurrentMainCharacter);
            Assert.That(() => api.ValidatePlay("missing"), Throws.InvalidOperationException);
            using var run = Start(api, "Dialogue.Play('fixture:talk'); Dialogue.Play('fixture:end')");
            run.Tick(0);
            for (var frame = 0; frame < 3; frame++) { yield return null; run.Tick(Time.unscaledDeltaTime); }
            Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Running));
            Assert.That(_runner.ActiveContext.CurrentNode, Is.TypeOf<VulcanusDialogueLineNode>());
            Assert.That(_runner.TryAdvanceActiveDialogue(), Is.True);
            for (var frame = 0; frame < 10 && _runner.ActiveContext.CurrentNode is not VulcanusDialogueChoiceNode; frame++)
                yield return null;
            Assert.That(_runner.ActiveContext.CurrentNode, Is.TypeOf<VulcanusDialogueChoiceNode>());
            run.Tick(0);
            Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Running));
            using (var key = KeyDownEvent.GetPooled('\0', KeyCode.Alpha1, EventModifiers.None))
            {
                key.target = _document.rootVisualElement.Q("dialogue-overlay");
                ((VisualElement)key.target).SendEvent(key);
            }
            for (var frame = 0; frame < 10 && run.Status == LuaExecutionStatus.Running; frame++)
            { yield return null; run.Tick(Time.unscaledDeltaTime); }
            Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Succeeded), run.Error);
            AssertClosed();
        }

        [UnityTest]
        public IEnumerator CutsceneOwnsInputClockAndSavesUntilTerminalCommit()
        {
            var service = CutsceneRunner.Instance;
            Assert.That(service, Is.Not.Null, "The authored Systems prefab must include the cutscene runner.");
            var definition = CreateCutscene("fixture:terminal", true, "fixture_intro_done", "fixture:end");
            try
            {
                Assert.That(service.TryStart(definition, out var run), Is.True);
                Assert.That(service.TryStart(definition, out _), Is.False, "A busy start cannot replace or queue the active run.");
                Assert.That(UrGUIManager.IsGameClockPaused, Is.True);
                Assert.That(Core.Context.PlayerInteractionContext.Instance.CurrentSnapshot.WorldInteractionBlocked, Is.True);
                Assert.That(Input.InputManager.Instance.PlayerControls.enabled, Is.False);
                Assert.That(Input.InputManager.Instance.Actions.FindActionMap("Global").enabled, Is.False);
                Assert.That(Input.InputManager.Instance.Actions.FindActionMap("UI").enabled, Is.True);
                Assert.That(Time.timeScale, Is.EqualTo(1f), "Calendar pause must not freeze physics.");
                Assert.That(() => GameState.Save("cutscene_staging_rejected"), Throws.InvalidOperationException);
                var deadline = Time.realtimeSinceStartup + 5;
                while (service.IsRunning && Time.realtimeSinceStartup < deadline) yield return null;
                Assert.That(run.Status, Is.EqualTo(CutsceneRunStatus.Completed), run.Error);
                Assert.That(GameState.Story.CompletedCutscenes["fixture:terminal"], Is.EqualTo("fixture_intro_done"));
                Assert.That(service.TryStart(definition, out _), Is.False, "Completion is tracked by the cutscene ID.");
                Assert.That(MainCharacter.CurrentMainCharacter.IsControlBlocked, Is.False);
                Assert.That(Input.InputManager.Instance.PlayerControls.enabled, Is.True);
                AssertClosed();
                var slot = "cutscene_test_" + Guid.NewGuid().ToString("N");
                try
                {
                    GameState.Save(slot);
                    Assert.That(GameSaveService.TryLoad(slot, out var saved), Is.True);
                    Assert.That(saved.story.CompletedCutscenes["fixture:terminal"], Is.EqualTo("fixture_intro_done"));
                }
                finally { System.IO.File.Delete(GameSaveService.GetSavePath(slot)); }
            }
            finally { service.Cancel(); Object.Destroy(definition); }
        }

        [UnityTest]
        public IEnumerator CutsceneCancellationAndSkipSettleBeforeCallbacksAndIgnoreOldHandles()
        {
            var service = CutsceneRunner.Instance;
            Assert.That(service, Is.Not.Null);
            var cancelled = CreateCutscene("fixture:cancel", true, "fixture_cancelled", "fixture:talk");
            var skipped = CreateCutscene("fixture:skip", true, "fixture_skipped", "fixture:talk");
            try
            {
                Assert.That(service.TryStart(cancelled, out var old), Is.True);
                yield return null;
                Assert.That(_runner.IsDialogueActive, Is.True);
                old.Cancel(); old.Dispose();
                Assert.That(old.Status, Is.EqualTo(CutsceneRunStatus.Cancelled));
                Assert.That(GameState.Story.CompletedCutscenes.ContainsKey("fixture:cancel"), Is.False);
                AssertClosed();
                Assert.That(service.TryStart(skipped, out var run), Is.True);
                old.Cancel();
                Assert.That(service.ActiveRun, Is.SameAs(run));
                yield return null;
                var finished = 0;
                Action<CutsceneRun> observer = terminal =>
                {
                    finished++;
                    Assert.That(service.IsRunning, Is.False);
                    Assert.That(GameState.Story.CompletedCutscenes["fixture:skip"], Is.EqualTo("fixture_skipped"));
                    Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
                    terminal.Cancel();
                };
                service.Finished += observer;
                try
                {
                    Assert.That(run.Skip(), Is.True);
                    Assert.That(run.Skip(), Is.False);
                    Assert.That(finished, Is.EqualTo(1));
                }
                finally { service.Finished -= observer; }
                Assert.That(run.Status, Is.EqualTo(CutsceneRunStatus.Skipped));
                AssertClosed();
            }
            finally { service.Cancel(); Object.Destroy(cancelled); Object.Destroy(skipped); }
        }

        private static CutsceneDefinition CreateCutscene(string id, bool skip, string outcome, string dialogue,
            params CutsceneStep[] beforeDialogue)
        {
            var steps = beforeDialogue.Append(Step("talk", "dialogue.play", ("dialogue", dialogue))).ToArray();
            var sequence = new JArray(steps.Select(step => new JObject { ["id"] = step.Id, ["action"] = step.ActionId,
                ["arguments"] = new JObject(step.Arguments.Select(argument => new JProperty(argument.Name, argument.Value))) }));
            var compiled = CutsceneSequenceCompiler.Compile(sequence, id);
            var definition = ScriptableObject.CreateInstance<CutsceneDefinition>();
            definition.Configure(id, MapManager.Instance.CurrentMap.MapId, compiled.Lua, steps, skip,
                new CutsceneCompletion(Array.Empty<CutsceneActorOutcome>(), outcome));
            return definition;
        }

        [UnityTest]
        public IEnumerator OutcomeActionIsSavedOnCompletionOrSkipButNotCancellation()
        {
            var service = CutsceneRunner.Instance;
            var choice = Step("answer", "cutscene.setOutcome", ("outcome", "admitted"));
            var watched = CreateCutscene("fixture:watched-outcome", false, "completed", "fixture:end", choice);
            var interrupted = CreateCutscene("fixture:pending-outcome", true, "completed", "fixture:talk", choice);
            try
            {
                Assert.That(service.TryStart(watched, out var finished), Is.True);
                for (var frame = 0; frame < 20 && service.IsRunning; frame++) yield return null;
                Assert.That(finished.Status, Is.EqualTo(CutsceneRunStatus.Completed), finished.Error);
                Assert.That(GameState.Story.CompletedCutscenes[watched.CutsceneId], Is.EqualTo("admitted"));
                Assert.That(service.TryStart(interrupted, out var cancelled), Is.True);
                yield return null;
                Assert.That(cancelled.Outcome, Is.EqualTo("admitted"));
                Assert.That(GameState.Story.CompletedCutscenes.ContainsKey(interrupted.CutsceneId), Is.False);
                cancelled.Cancel();
                Assert.That(GameState.Story.CompletedCutscenes.ContainsKey(interrupted.CutsceneId), Is.False);
                Assert.That(service.TryStart(interrupted, out var skipped), Is.True);
                yield return null;
                Assert.That(skipped.Skip(), Is.True);
                Assert.That(GameState.Story.CompletedCutscenes[interrupted.CutsceneId], Is.EqualTo("admitted"));
            }
            finally { service.Cancel(); Object.Destroy(watched); Object.Destroy(interrupted); }
        }

        [UnityTest]
        public IEnumerator AuthoredPrototypeMovesExistingNpcFacesPlayerAndCommitsOnlyAfterGoodbye()
        {
            var service = CutsceneRunner.Instance;
            var spawn = WorldObjectSpawner.Instance.SpawnedObjects.Single(value => value.PersistentId == "cutscene-prototype-host-01");
            var actor = spawn.GetComponent<GameCharacter>();
            var anchor = MapManager.Instance.CurrentMap.GetComponentsInChildren<VulcanusMapAnchor>(true)
                .Single(value => value.AnchorId == "prototype-meeting");
            Assert.That(service.TryStart("base:cutscene-prototype", out var run), Is.True);
            var deadline = Time.realtimeSinceStartup + 15;
            while (run.Status == CutsceneRunStatus.Running && !_runner.IsDialogueActive && Time.realtimeSinceStartup < deadline)
                yield return null;
            Assert.That(_runner.CurrentDialogueId, Is.EqualTo("prototype_greeting"), run.Error);
            Assert.That(Vector2.Distance(actor.GetComponent<Rigidbody2D>().position, anchor.transform.position), Is.LessThanOrEqualTo(0.04f));
            Assert.That(actor.Orientation.FacingDirection.x, Is.GreaterThan(0));
            Assert.That(GameState.Story.CompletedCutscenes.ContainsKey("base:cutscene-prototype"), Is.False);
            Assert.That(_runner.TryAdvanceActiveDialogue(), Is.True);
            for (var frame = 0; frame < 20 && _runner.ActiveContext.CurrentNode is not VulcanusDialogueChoiceNode; frame++) yield return null;
            using (var key = KeyDownEvent.GetPooled('\0', KeyCode.Alpha1, EventModifiers.None))
            {
                key.target = _document.rootVisualElement.Q("dialogue-overlay");
                ((VisualElement)key.target).SendEvent(key);
            }
            for (var frame = 0; frame < 20 && service.IsRunning; frame++) yield return null;
            Assert.That(run.Status, Is.EqualTo(CutsceneRunStatus.Completed), run.Error);
            Assert.That(spawn.transform.position, Is.EqualTo(anchor.transform.position));
            Assert.That(spawn.State.position, Is.EqualTo(spawn.transform.position));
            Assert.That(GameState.Story.CompletedCutscenes["base:cutscene-prototype"], Is.EqualTo("completed"));
            Assert.That(actor.Controller.IsMovementOwned, Is.False);
            Assert.That(actor.IsControlBlocked, Is.False);
            AssertClosed();
            var slot = "cutscene_npc_" + Guid.NewGuid().ToString("N");
            try
            {
                GameState.Save(slot);
                Assert.That(GameSaveService.TryLoad(slot, out var saved), Is.True);
                Assert.That(saved.world.TryGet<SpawnedObjectState>(LevelManager.Instance.CurrentLocationData.id, spawn.PersistentId, out var placement), Is.True);
                Assert.That(placement.position, Is.EqualTo(anchor.transform.position));
                Assert.That(saved.story.CompletedCutscenes["base:cutscene-prototype"], Is.EqualTo("completed"));
            }
            finally { System.IO.File.Delete(GameSaveService.GetSavePath(slot)); }
        }

        [UnityTest]
        public IEnumerator CancellingNpcMovementRestoresPlacementWhileSkippingCommitsThePreparedEndpoint()
        {
            var service = CutsceneRunner.Instance;
            var spawn = WorldObjectSpawner.Instance.SpawnedObjects.Single(value => value.PersistentId == "cutscene-prototype-host-01");
            var actor = spawn.GetComponent<GameCharacter>();
            var original = spawn.transform.position;
            Assert.That(service.TryStart("base:cutscene-prototype", out var cancelled), Is.True);
            yield return null;
            Assert.That(actor.Controller.IsMovementOwned, Is.True);
            cancelled.Cancel();
            Assert.That(cancelled.Status, Is.EqualTo(CutsceneRunStatus.Cancelled));
            Assert.That(spawn.transform.position, Is.EqualTo(original));
            Assert.That(spawn.State.position, Is.EqualTo(original));
            Assert.That(GameState.Story.CompletedCutscenes.ContainsKey("base:cutscene-prototype"), Is.False);
            Assert.That(actor.Controller.IsMovementOwned, Is.False);
            Assert.That(actor.Controller.CurrentVelocity, Is.EqualTo(Vector2.zero));
            Assert.That(service.TryStart("base:cutscene-prototype", out var skipped), Is.True);
            yield return null;
            Assert.That(skipped.Skip(), Is.True);
            Assert.That(skipped.Status, Is.EqualTo(CutsceneRunStatus.Skipped), skipped.Error);
            Assert.That(spawn.transform.position, Is.Not.EqualTo(original));
            Assert.That(spawn.State.position, Is.EqualTo(spawn.transform.position));
            Assert.That(GameState.Story.CompletedCutscenes["base:cutscene-prototype"], Is.EqualTo("completed"));
            Assert.That(actor.IsControlBlocked, Is.False);
            AssertClosed();
        }

        [UnityTest]
        public IEnumerator InitialOverlapDeduplicatesPlayerCollidersAndBusyTriggersNeverQueue()
        {
            var service = CutsceneRunner.Instance;
            var definition = CreateCutscene("fixture:trigger", false, "completed", "fixture:talk");
            var catalog = ScriptableObject.CreateInstance<CutsceneCatalog>();
            catalog.Synchronize(new[] { definition });
            var originalCatalog = typeof(CutsceneRunner).GetField("_catalog", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(service);
            Set(service, "_catalog", catalog);
            var owner = new GameObject("Initial-overlap trigger fixture");
            owner.SetActive(false);
            owner.transform.position = MainCharacter.CurrentMainCharacter.transform.position;
            var area = owner.AddComponent<BoxCollider2D>();
            area.isTrigger = true;
            area.size = Vector2.one * 2;
            var trigger = owner.AddComponent<CutsceneTrigger>();
            trigger.Configure(definition.CutsceneId);
            var duplicate = MainCharacter.CurrentMainCharacter.gameObject.AddComponent<BoxCollider2D>();
            try
            {
                Assert.That(service.TryStart(definition, out var busy), Is.True);
                owner.SetActive(true);
                busy.Cancel();
                for (var frame = 0; frame < 3; frame++) yield return null;
                Assert.That(service.IsRunning, Is.False, "A busy initial-overlap request must never queue.");
                owner.SetActive(false);
                var starts = 0;
                Action<CutsceneRun> count = _ => starts++;
                service.Started += count;
                try
                {
                    owner.SetActive(true);
                    for (var frame = 0; frame < 3; frame++) yield return null;
                    Assert.That(starts, Is.EqualTo(1));
                    Assert.That(service.IsRunning, Is.True);
                    Assert.That(service.ActiveRun.Skip(), Is.False, "Skip permission is authored, not implied by dialogue input.");
                }
                finally { service.Started -= count; }
                service.Cancel();
                AssertClosed();
            }
            finally
            {
                service.Cancel();
                Object.Destroy(owner); Object.Destroy(duplicate);
                Set(service, "_catalog", originalCatalog);
                Object.Destroy(catalog); Object.Destroy(definition);
            }
        }

        [UnityTest]
        public IEnumerator DisablingTheCutsceneOwnerClosesItsDialogueAndWritesNoCompletionOutcome()
        {
            var service = CutsceneRunner.Instance;
            var definition = CreateCutscene("fixture:disable", true, "fixture_disabled", "fixture:talk");
            try
            {
                Assert.That(service.TryStart(definition, out var run), Is.True);
                yield return null;
                Assert.That(_runner.IsDialogueActive, Is.True);
                service.enabled = false;
                Assert.That(run.Status, Is.EqualTo(CutsceneRunStatus.Cancelled));
                Assert.That(GameState.Story.CompletedCutscenes.ContainsKey("fixture:disable"), Is.False);
                Assert.That(MainCharacter.CurrentMainCharacter.IsControlBlocked, Is.False);
                AssertClosed();
            }
            finally { service.enabled = true; Object.Destroy(definition); }
        }

        [UnityTest]
        public IEnumerator UnsafeDialogueIsRejectedBeforeAnyCutsceneClaimsAreAcquired()
        {
            var service = CutsceneRunner.Instance;
            var definition = CreateCutscene("fixture:unsafe", false, "completed", "fixture:error");
            try
            {
                Assert.That(() => service.TryStart(definition, out _),
                    Throws.InvalidOperationException.With.Message.Contains("step 'talk'").And.Message.Contains("completion plan"));
                Assert.That(service.IsRunning, Is.False);
                Assert.That(MainCharacter.CurrentMainCharacter.IsControlBlocked, Is.False);
                AssertClosed();
                yield return null;
            }
            finally { Object.Destroy(definition); }
        }

        [UnityTest]
        public IEnumerator ObstructedMovementReportsTheAuthoredStepAndReleasesAllClaims()
        {
            var service = CutsceneRunner.Instance;
            var actor = WorldObjectSpawner.Instance.SpawnedObjects.Single(value => value.PersistentId == "cutscene-prototype-host-01");
            var anchor = MapManager.Instance.CurrentMap.GetComponentsInChildren<VulcanusMapAnchor>(true)
                .Single(value => value.AnchorId == "prototype-meeting");
            var obstacle = new GameObject("Cutscene obstruction fixture");
            var footprint = actor.GetComponentsInChildren<Collider2D>().Single(value => !value.isTrigger);
            var mask = Physics2D.GetLayerCollisionMask(footprint.gameObject.layer);
            obstacle.layer = Enumerable.Range(0, 32).First(layer => (mask & (1 << layer)) != 0);
            obstacle.transform.position = footprint.bounds.center + (anchor.transform.position - actor.transform.position) * 0.5f;
            obstacle.AddComponent<BoxCollider2D>().size = new Vector2(0.05f, 4f);
            Physics2D.SyncTransforms();
            try
            {
                LogAssert.Expect(LogType.Error, new Regex("step 'approach'"));
                Assert.That(service.TryStart("base:cutscene-prototype", out var run), Is.True);
                var deadline = Time.realtimeSinceStartup + 3;
                while (service.IsRunning && Time.realtimeSinceStartup < deadline) yield return null;
                Assert.That(run.Status, Is.EqualTo(CutsceneRunStatus.Failed));
                Assert.That(run.Error, Does.Contain("step 'approach'"));
                Assert.That(actor.GetComponent<GameCharacter>().IsControlBlocked, Is.False);
                Assert.That(actor.GetComponent<GameCharacter>().Controller.IsMovementOwned, Is.False);
                Assert.That(MainCharacter.CurrentMainCharacter.IsControlBlocked, Is.False);
                Assert.That(GameState.Story.CompletedCutscenes.ContainsKey("base:cutscene-prototype"), Is.False);
                AssertClosed();
            }
            finally { service.Cancel(); Object.Destroy(obstacle); }
        }

        [UnityTest]
        public IEnumerator LocationChangeCancelsBeforeCapturingTransientNpcPlacement()
        {
            var service = CutsceneRunner.Instance;
            var level = LevelManager.Instance;
            var originalMap = level.CurrentLocationData;
            var spawn = WorldObjectSpawner.Instance.SpawnedObjects.Single(value => value.PersistentId == "cutscene-prototype-host-01");
            var original = spawn.transform.position;
            Assert.That(service.TryStart("base:cutscene-prototype", out var run), Is.True);
            yield return null;
            // Reload the registered location through the normal leave/load/ready boundary.
            level.LoadLocation(originalMap, "", Vector2.down);
            Assert.That(run.Status, Is.EqualTo(CutsceneRunStatus.Cancelled));
            var deadline = Time.realtimeSinceStartup + 15;
            while (!level.SceneReady && Time.realtimeSinceStartup < deadline) yield return null;
            Assert.That(level.SceneReady, Is.True);
            Assert.That(GameState.Story.CompletedCutscenes.ContainsKey("base:cutscene-prototype"), Is.False);
            Assert.That(MainCharacter.CurrentMainCharacter.IsControlBlocked, Is.False);
            AssertClosed();
            var restored = WorldObjectSpawner.Instance.SpawnedObjects.Single(value => value.PersistentId == "cutscene-prototype-host-01");
            Assert.That(Vector3.Distance(restored.transform.position, original), Is.LessThan(0.001f));
            Assert.That(Vector3.Distance(restored.State.position, original), Is.LessThan(0.001f));
        }

        [UnityTest]
        public IEnumerator StoppingTheLuaSessionClosesItsDialogueAndScriptErrorsDoNotContinue()
        {
            var api = new DialogueLuaApi(_runner, MainCharacter.CurrentMainCharacter);
            using (var run = Start(api, "Dialogue.Play('fixture:talk'); error('Must not continue')"))
            {
                run.Tick(0);
                yield return null;
                run.Cancel();
                Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Cancelled));
                AssertClosed();
            }
            LogAssert.Expect(LogType.Error, new Regex("Action failed in 'fixture:error'"));
            LogAssert.Expect(LogType.Error, new Regex("Action node 'entry' failed"));
            using var broken = Start(api, "Dialogue.Play('fixture:error'); Dialogue.Play('fixture:talk')");
            broken.Tick(0);
            broken.Tick(0);
            Assert.That(broken.Status, Is.EqualTo(LuaExecutionStatus.Failed));
            Assert.That(broken.Error, Does.Contain("before reaching the end"));
            AssertClosed();
        }

        [UnityTest]
        public IEnumerator CutsceneBindingChecksLaterReferencesBeforeStartingEarlierActions()
        {
            var player = MainCharacter.CurrentMainCharacter;
            var map = MapManager.Instance.CurrentMap;
            var anchor = map.GetComponentsInChildren<VulcanusMapAnchor>(true).First();
            var position = player.GetComponent<Rigidbody2D>().position;
            var facing = player.Orientation.FacingDirection;
            var definition = ScriptableObject.CreateInstance<CutsceneDefinition>();
            try
            {
                var walk = Step("walk", "actors.moveTo", ("actor", "player"), ("destination", anchor.AnchorId));
                ConfigureDefinition(definition, map.MapId, walk, Step("talk", "dialogue.play", ("dialogue", "missing-dialogue")));
                var error = Assert.Throws<InvalidOperationException>(() => CutsceneBindings.BindCurrentMap(definition, _runner, 5f));
                Assert.That(error.Message, Does.Contain("fixture:binding").And.Contain("step 'talk'").And.Contain("missing-dialogue"));

                foreach (var invalid in new[]
                {
                    Step("missing-actor", "actors.moveTo", ("actor", "missing"), ("destination", anchor.AnchorId)),
                    Step("missing-anchor", "actors.moveTo", ("actor", "player"), ("destination", "missing")),
                    Step("missing-target", "actors.face", ("actor", "player"), ("target", "missing"))
                })
                {
                    ConfigureDefinition(definition, map.MapId, invalid);
                    error = Assert.Throws<InvalidOperationException>(() => CutsceneBindings.BindCurrentMap(definition, _runner, 5f));
                    Assert.That(error.Message, Does.Contain($"step '{invalid.Id}'"));
                }

                var talk = Step("talk", "dialogue.play", ("dialogue", "fixture:talk"));
                ConfigureDefinition(definition, "another-map", walk, talk);
                Assert.That(() => CutsceneBindings.BindCurrentMap(definition, _runner, 5f),
                    Throws.InvalidOperationException.With.Message.Contains("another-map"));

                ConfigureDefinition(definition, map.MapId, walk, talk);
                var bindings = CutsceneBindings.BindCurrentMap(definition, _runner, 5f);
                Assert.That(bindings.Describe().modules.Select(module => module.path), Is.EquivalentTo(new[] { "Actors", "Dialogue" }));
                ConfigureDefinition(definition, map.MapId, talk);
                bindings = CutsceneBindings.BindCurrentMap(definition, _runner, 5f);
                Assert.That(bindings.Describe().modules.Select(module => module.path), Is.EqualTo(new[] { "Dialogue" }));
                ConfigureDefinition(definition, map.MapId, walk);
                bindings = CutsceneBindings.BindCurrentMap(definition, null, 5f);
                Assert.That(bindings.Describe().modules.Select(module => module.path), Is.EqualTo(new[] { "Actors" }));
                Assert.That(player.Controller.IsMovementOwned, Is.False);
                Assert.That(player.GetComponent<Rigidbody2D>().position, Is.EqualTo(position));
                Assert.That(player.Orientation.FacingDirection, Is.EqualTo(facing));
                AssertClosed();
                yield return null;
            }
            finally { Object.Destroy(definition); }
        }

        private static CutsceneStep Step(string id, string action, params (string Name, string Value)[] arguments) =>
            new(id, action, arguments.Select(argument => new CutsceneArgument(argument.Name, argument.Value)).ToArray());

        private static void ConfigureDefinition(CutsceneDefinition definition, string map, params CutsceneStep[] steps)
        {
            var sequence = new JArray(steps.Select(step => new JObject
            {
                ["id"] = step.Id, ["action"] = step.ActionId,
                ["arguments"] = new JObject(step.Arguments.Select(argument => new JProperty(argument.Name, argument.Value)))
            }));
            var compiled = CutsceneSequenceCompiler.Compile(sequence, "fixture:binding");
            definition.Configure("fixture:binding", map, compiled.Lua, steps, false,
                new CutsceneCompletion(Array.Empty<CutsceneActorOutcome>()));
        }

        private void AssertClosed()
        {
            Assert.That(_runner.IsDialogueActive, Is.False);
            Assert.That(UrGUIManager.HasOpenScreens, Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
            Assert.That(UrGUIManager.IsCharacterPaused(MainCharacter.CurrentMainCharacter), Is.False);
        }

        [UnityTearDown]
        public IEnumerator TearDown()
        {
            Object.Destroy(_root);
            yield return null;
            foreach (var asset in new Object[] { _database, _talk, _end, _error }) Object.Destroy(asset);
            yield return new ExitPlayMode();
        }

        private static LuaExecutionSession Start(DialogueLuaApi api, string lua) =>
            VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api), lua, "fixture:dialogue");

        private static VulcanusDialogueAsset CreateDialogue(string id, params VulcanusDialogueNode[] nodes)
        {
            var dialogue = ScriptableObject.CreateInstance<VulcanusDialogueAsset>();
            dialogue.Configure(null, 1, id, id, "", false, "", "entry", Array.Empty<string>(), "", "", nodes,
                Array.Empty<VulcanusDialogueAsset.ImportedMessage>(), Array.Empty<string>());
            return dialogue;
        }

        private static void Set(object target, string field, object value) => target.GetType()
            .GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
    }
}
