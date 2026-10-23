using System;
using System.Collections;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Linq;
using Character;
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
        private PanelSettings _panel;
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
            Assert.That(VulcanusDialogueRunner.Instance, Is.Null);
            _talk = CreateDialogue("fixture:talk",
                new VulcanusDialogueLineNode("entry", "", "", "Hello", "", "choice"),
                new VulcanusDialogueChoiceNode("choice", new[] { new VulcanusDialogueChoiceOption("bye", "Goodbye", "", "", "end") }),
                new VulcanusDialogueEndNode("end"));
            _end = CreateDialogue("fixture:end", new VulcanusDialogueEndNode("entry"));
            _error = CreateDialogue("fixture:error", new VulcanusDialogueActionNode("entry", "error('Broken fixture script')", ""));
            _database = ScriptableObject.CreateInstance<VulcanusDialogueDatabase>();
            _database.Configure(null, new[] { _talk, _end, _error });

            _root = new GameObject("Dialogue Lua fixture");
            _root.SetActive(false);
            _document = _root.AddComponent<UIDocument>();
            _panel = Object.Instantiate(AssetDatabase.LoadAssetAtPath<PanelSettings>("Assets/UI/InventoryScreen/InventoryPanelSettings.asset"));
            _document.panelSettings = _panel;
            var layout = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/UI/Dialogue/Vulcanus/VulcanusDialogueRuntime.uxml");
            _document.visualTreeAsset = layout;
            var presenter = _root.AddComponent<VulcanusDialogueUIDocumentPresenter>();
            Set(presenter, "document", _document);
            Set(presenter, "layoutAsset", layout);
            Set(presenter, "styleSheet", AssetDatabase.LoadAssetAtPath<StyleSheet>("Assets/UI/Dialogue/Vulcanus/VulcanusDialogueRuntime.uss"));
            Set(presenter, "charactersPerSecond", 0f);
            _runner = _root.AddComponent<VulcanusDialogueRunner>();
            Set(_runner, "database", _database);
            Set(_runner, "presenter", presenter);
            _root.SetActive(true);
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
            definition.Configure("fixture:binding", map, compiled.Lua, steps);
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
            foreach (var asset in new Object[] { _panel, _database, _talk, _end, _error }) Object.Destroy(asset);
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
