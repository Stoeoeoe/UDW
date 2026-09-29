using System;
using System.IO;
using Core.Game;
using Core.GameplayTags;
using Core.Scripting;
using NUnit.Framework;
using UnityEngine;

namespace Core.Dialogue.Vulcanus.Editor
{
    public sealed class VulcanusLuaDialogueScriptEngineTests
    {
        [Test]
        public void StoryFlagsAreSharedBetweenActionsAndConditions()
        {
            var story = new StoryState();
            var engine = new VulcanusLuaDialogueScriptEngine(new VulcanusLuaEngine(story, new PlayerState(), new WorldState()));

            const string condition = "GameState.Story.HasFlag('met_blacksmith')";
            Assert.That(engine.EvaluateCondition(condition, null, out var initiallyVisible), Is.True);
            Assert.That(initiallyVisible, Is.False);
            Assert.That(engine.ExecuteAction("GameState.Story.SetFlag('met_blacksmith')", null), Is.True);
            Assert.That(story.HasFlag("met_blacksmith"), Is.True);
            Assert.That(engine.EvaluateCondition(condition, null, out var visible), Is.True);
            Assert.That(visible, Is.True);
            Assert.That(engine.ExecuteAction("GameState.Story.ClearFlag('met_blacksmith')", null), Is.True);
            Assert.That(story.HasFlag("met_blacksmith"), Is.False);
            Assert.That(engine.EvaluateCondition(condition, null, out var visibleAfterClear), Is.True);
            Assert.That(visibleAfterClear, Is.False);
        }

        [Test]
        public void SharedEngineCanRunOutsideDialogue()
        {
            var story = new StoryState();
            var lua = new VulcanusLuaEngine(story, new PlayerState(), new WorldState());

            Assert.That(lua.EvaluateCondition("GameState.Story.HasFlag('cutscene_seen')"), Is.False);
            lua.Execute("GameState.Story.SetFlag('cutscene_seen')");
            Assert.That(lua.EvaluateCondition("GameState.Story.HasFlag('cutscene_seen')"), Is.True);
        }

        [Test]
        public void StringBindingsStillValidateLuaArguments()
        {
            var lua = new VulcanusLuaEngine(new StoryState(), new PlayerState(), new WorldState());

            Assert.That(() => lua.EvaluateCondition("GameState.Story.HasFlag(42)"), Throws.Exception);
            Assert.That(() => lua.EvaluateCondition("GameState.Story.HasFlag('a', 'b')"), Throws.Exception);
        }

        [Test]
        public void PlayerTagsUseTheLiveCharacterAndCacheParsedQueries()
        {
            var first = new TagSet();
            first.SetSourceTags("boon", new[] { "State.Blessed.Mercury" });
            TagSet current = first;
            var lua = new VulcanusLuaEngine(new StoryState(), new PlayerState(), new WorldState(), () => current);

            Assert.That(lua.EvaluateCondition("Player.Tags.Has('State.Blessed')"), Is.True);
            Assert.That(lua.EvaluateCondition("Player.Tags.HasExact('State.Blessed')"), Is.False);
            const string query = "Player.Tags.Matches('all(State.Blessed, none(State.Cursed))')";
            Assert.That(lua.EvaluateCondition(query), Is.True);

            var second = new TagSet();
            second.SetSourceTags("condition", new[] { "State.Cursed" });
            current = second;
            Assert.That(lua.EvaluateCondition(query), Is.False, "Compiled Lua and tag queries must read the current character tags.");
            Assert.That(lua.EvaluateCondition("Player.Tags.Has('State.Cursed')"), Is.True);
            Assert.That(() => lua.EvaluateCondition("Player.Tags.Matches('all(State..Blessed)')"), Throws.Exception);
        }

        [Test]
        public void PlayerTagsFailClearlyWithoutACharacter()
        {
            var lua = new VulcanusLuaEngine(new StoryState(), new PlayerState(), new WorldState(), () => null);
            Assert.That(() => lua.EvaluateCondition("Player.Tags.Has('State.Blessed')"), Throws.Exception);
        }

        [Test]
        public void UnsupportedSignaturesAreRejectedWhenBindingsAreRegistered()
        {
            Assert.That(() => new LuaBindingRegistry(new UnsupportedParameterApi()), Throws.TypeOf<InvalidOperationException>());
            Assert.That(() => new LuaBindingRegistry(new UnsupportedDtoApi()), Throws.TypeOf<InvalidOperationException>());
        }

        [Test]
        public void ExportedManifestMatchesTheValidatedLuaApi()
        {
            var expected = new VulcanusLuaEngine(new StoryState(), new PlayerState(), new WorldState()).DescribeBindings();
            var path = Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, "Generated/Scripting/bindings.json");

            Assert.That(File.Exists(path), Is.True);
            var actual = JsonUtility.FromJson<LuaBindingManifest>(File.ReadAllText(path));
            Assert.That(JsonUtility.ToJson(actual), Is.EqualTo(JsonUtility.ToJson(expected)));
        }

        [Test]
        public void PlayerSkillsAndTypedWorldStateAreAvailable()
        {
            var player = new PlayerState();
            var world = new WorldState();
            var engine = new VulcanusLuaDialogueScriptEngine(new VulcanusLuaEngine(new StoryState(), player, world));

            Assert.That(engine.EvaluateCondition("GameState.Player.Skills.GetLevel('base:hammer_mastery') == 0", null, out var levelMatches), Is.True);
            Assert.That(levelMatches, Is.True);
            Assert.That(engine.ExecuteAction("GameState.Player.Skills.TryLevelUp('base:hammer_mastery')", null), Is.True);
            Assert.That(player.Skills.GetLevel("base:hammer_mastery"), Is.EqualTo(1));
            Assert.That(engine.ExecuteAction("GameState.World.SetFarmland('farm', 'farmland:1,2', true, false)", null), Is.True);
            Assert.That(world.TryGet("farm", "farmland:1,2", out FarmlandState farmland), Is.True);
            Assert.That(farmland.plowed, Is.True);
            Assert.That(engine.EvaluateCondition("GameState.World.GetFarmland('farm', 'farmland:1,2').plowed", null, out var plowed), Is.True);
            Assert.That(plowed, Is.True);
            Assert.That(engine.EvaluateCondition("GameState.World.GetFarmland('farm', 'missing') == nil", null, out var missing), Is.True);
            Assert.That(missing, Is.True);
            Assert.That(engine.ExecuteAction("GameState.World.GetFarmland('farm', 'farmland:1,2').plowed = false", null), Is.True);
            Assert.That(farmland.plowed, Is.True, "Lua receives a snapshot, not the persisted state object.");
        }

        [Test]
        public void HostFileAndOsLibrariesAreNotExposed()
        {
            var engine = new VulcanusLuaDialogueScriptEngine(new VulcanusLuaEngine(new StoryState(), new PlayerState(), new WorldState()));

            Assert.That(engine.EvaluateCondition("os == nil and io == nil and dofile == nil", null, out var isolated), Is.True);
            Assert.That(isolated, Is.True);
            Assert.That(engine.EvaluateCondition("GameState.Story.SetFlag == nil and GameState.Player.Skills.TryLevelUp == nil", null, out var readOnly), Is.True);
            Assert.That(readOnly, Is.True);
        }

        [LuaModule("Unsupported")]
        private sealed class UnsupportedParameterApi
        {
            [LuaCall] public bool Bad(DateTime value) => true;
        }

        [LuaTable]
        private sealed class UnsupportedDto
        {
            [LuaField] public DateTime timestamp;
        }

        [LuaModule("UnsupportedDto")]
        private sealed class UnsupportedDtoApi
        {
            [LuaCall] public UnsupportedDto Get() => new UnsupportedDto();
        }
    }
}
