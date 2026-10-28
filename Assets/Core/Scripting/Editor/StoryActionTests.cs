using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common.Editor;
using Core.Game;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;

namespace Core.Scripting.Editor
{
    public sealed class StoryActionTests
    {
        private GameTestFixture _fixture;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Story actions");
            _fixture.AddSingleton<GameStateManager>();
        }

        [TearDown]
        public void TearDown() => _fixture.Dispose();

        [TestCase("setup")]
        [TestCase("sequence")]
        [TestCase("completion")]
        public void VisualStoryValuesCompileBindAndExecuteInEveryPhase(string phase)
        {
            var source = new JArray(
                Step("boolean", "story.set", new JObject { ["key"] = "ready", ["value"] = false }),
                Step("string", "story.set", new JObject { ["key"] = "name", ["value"] = "Ada" }),
                Step("empty", "story.set", new JObject { ["key"] = "empty", ["value"] = "" }),
                Step("number", "story.set", new JObject { ["key"] = "score", ["value"] = 12.5 }),
                Step("object", "story.set", new JObject { ["key"] = "quest", ["value"] = new JObject { ["stage"] = 2, ["details"] = new JObject { ["accepted"] = true } } }),
                Step("enabled", "story.set", new JObject { ["key"] = "met", ["value"] = true }),
                Step("disabled", "story.set", new JObject { ["key"] = "met", ["value"] = false }));
            var lua = CutsceneSequenceCompiler.Compile(source, "story-action", out var steps, phase);
            var restored = steps.Select(step => JsonUtility.FromJson<CutsceneStep>(JsonUtility.ToJson(step))).ToArray();
            var bindings = CutsceneBindings.BindSequence(restored, "cutscene", (typeof(StoryLuaApi), () => new StoryLuaApi()));
            using var session = VulcanusLuaEngine.StartSession(bindings, lua, "story-action", phase: phase);
            session.Tick(0);
            Assert.That(session.IsRunning, Is.False);
            Assert.That(session.ActionsStarted, Is.EqualTo(7));
            Assert.That(GameState.Story.Get<bool>("ready"), Is.False);
            Assert.That(GameState.Story.Get<string>("name"), Is.EqualTo("Ada"));
            Assert.That(GameState.Story.Get<string>("empty"), Is.Empty);
            Assert.That(GameState.Story.Get<double>("score"), Is.EqualTo(12.5));
            Assert.That(GameState.Story.Get<Dictionary<string, object>>("quest")["stage"], Is.EqualTo(2d));
            Assert.That(GameState.Story.Has("met"), Is.True);
            Assert.That(GameState.Story.Get<bool>("met"), Is.False);
            Assert.That(new VulcanusLuaEngine().EvaluateCondition("GameState.Story.Get('quest').details.accepted and GameState.Story.Set == nil"), Is.True);
        }

        [Test]
        public void RemovalActionsAndOrdinaryCallsUseTheSameStore()
        {
            var calls = new VulcanusLuaEngine();
            calls.Execute("GameState.Story.Set('name', 'Ada'); GameState.Story.Set('met', true)");
            using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(new StoryLuaApi()),
                "GameState.Story.Remove('name'); GameState.Story.Remove('met')", "story-remove", context: "npcRoutine");
            session.Tick(0);
            Assert.That(GameState.Story.Has("name"), Is.False);
            Assert.That(GameState.Story.Has("met"), Is.False);
            calls.Execute("GameState.Story.Set('name', 'Again')");
            Assert.That(GameState.Story.Get<string>("name"), Is.EqualTo("Again"));
            var methods = VulcanusLuaEngine.DescribeBindings().modules.Single(module => module.path == "GameState.Story").methods;
            Assert.That(methods.Single(method => method.name == "Set").callable, Is.True);
            Assert.That(methods.Single(method => method.name == "Get").action, Is.Null);
        }

        [TestCase("null")]
        [TestCase("[1,2]")]
        [TestCase("{ 'nested': null }")]
        [TestCase("{ '': true }")]
        [TestCase("9007199254740992")]
        public void MalformedVisualValuesFailAtImport(string value)
        {
            var step = Step("invalid", "story.set", new JObject { ["key"] = "bad", ["value"] = JToken.Parse(value) });
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(step), "bad-story"), Throws.TypeOf<FormatException>());
        }

        [Test]
        public void LegacyFlagApisAndActionsAreNotExposed()
        {
            var lua = new VulcanusLuaEngine();
            Assert.That(lua.EvaluateCondition("GameState.Story.HasFlag == nil and GameState.Story.SetFlag == nil and GameState.Story.ClearFlag == nil"), Is.True);
            var methods = VulcanusLuaEngine.DescribeBindings().modules.Single(module => module.path == "GameState.Story").methods;
            Assert.That(methods.Select(method => method.name), Is.EquivalentTo(new[] { "Get", "Set", "Has", "Remove" }));
            Assert.That(methods.Where(method => method.action != null).Select(method => method.action.id), Is.EquivalentTo(new[] { "story.set", "story.remove" }));
        }

        private static JObject Step(string id, string action, JObject arguments) =>
            new() { ["id"] = id, ["action"] = action, ["arguments"] = arguments };
    }
}
