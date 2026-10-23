using System;
using System.Collections;
using System.Reflection;
using System.Text.RegularExpressions;
using Character;
using Core.Dialogue.Vulcanus;
using Core.Location;
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
