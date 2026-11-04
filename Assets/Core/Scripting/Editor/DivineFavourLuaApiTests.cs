using System;
using System.IO;
using Core.Common.Editor;
using Core.Divinity;
using Core.Game;
using Core.TimeAndWeather;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Core.Scripting.Editor
{
    public sealed class DivineFavourLuaApiTests : GameTest
    {

        [Test]
        public void ScriptsChangeLiveFavourAndBoonsWhileConditionsRemainReadOnly()
        {
            var character = Game.CreateCharacter();
            Game.Get<DivineFavour>().BindCharacter(character);
            var defense = character.Attributes.PhysicalDefense;
            var lua = Game.Lua.CreateEngine();
            Assert.That(lua.EvaluateCondition("DivineFavour.GetFavour('mars') == 0 and DivineFavour.AddFavour == nil"), Is.True);
            lua.Execute("assert(DivineFavour.AddFavour('mars', 10) == 10)");
            Assert.That(Game.State.Player.Favour.GetFavour("mars"), Is.EqualTo(10));
            Assert.That(character.Attributes.PhysicalDefense, Is.GreaterThan(defense));
            Assert.That(lua.EvaluateCondition("DivineFavour.GetFavour('mars') >= 10"), Is.True);
            lua.Execute("assert(DivineFavour.AddFavour('mars', -12) == -2)");
            Assert.That(character.Attributes.PhysicalDefense, Is.EqualTo(defense));
            Assert.That(Game.State.Player.Favour.GetFavour("mars"), Is.EqualTo(-2));
        }

        [TestCase("setup")]
        [TestCase("sequence")]
        [TestCase("completion")]
        public void FavourActionRunsInEachCutscenePhase(string phase)
        {
            using var session = VulcanusLuaEngine.StartSession(Game.Bind(new DivineFavourLuaApi()),
                "DivineFavour.AddFavour('mars', 3)", "Divinity fixture", phase: phase);
            session.Tick(0);
            Assert.That(session.IsRunning, Is.False);
            Assert.That(Game.State.Player.Favour.GetFavour("mars"), Is.EqualTo(3));
        }

        [Test]
        public void LoadingRebindsExistingFavourServiceAndItsDailySubscriptionToTheSavedRoot()
        {
            var favour = Game.Get<DivineFavour>();
            var session = Game.Get<GameStateManager>();
            Game.Get<PlayerStateManager>().InitializeHome();
            Game.State.Time.initialized = true;
            Game.State.Time.daysSinceStart = 1;
            Game.State.Time.dayOfSeason = 1;
            Game.State.Time.hour = 6;
            var original = Game.State.Player.Favour;
            var slot = "favour_scope_" + Guid.NewGuid().ToString("N");
            var path = GameSaveService.GetSavePath(slot);
            try
            {
                favour.AddFavour("mars", 10);
                session.Save(slot);
                favour.AddFavour("mars", 7);
                Assert.That(session.Load(slot), Is.True);
                Assert.That(favour.GetFavour("mars"), Is.EqualTo(10));
                Assert.That(favour.AddFavour("mars", 3), Is.EqualTo(13));
                var deity = Game.Get<DeityDefinitions>().Get("mars");
                NewDayEvent.Trigger(2);
                Assert.That(favour.GetFavour("mars"), Is.EqualTo(Math.Max(0, 13 - deity.DailyDecay)));
                Assert.That(original.GetFavour("mars"), Is.EqualTo(17));
            }
            finally { if (File.Exists(path)) File.Delete(path); }
        }

        [Test]
        public void AuthoredActionsValidateDeitiesBeforeExecution()
        {
            var source = JArray.Parse("[{ 'id':'reward', 'action':'divinity.addFavour', 'arguments': { 'deityId':'mars', 'points':5 } }]");
            var lua = CutsceneSequenceCompiler.Compile(source, "Divinity fixture", out var steps);
            var bindings = Game.BindSequence(steps, "cutscene", (typeof(DivineFavourLuaApi), () => new DivineFavourLuaApi()));
            Assert.That(Game.State.Player.Favour.GetFavour("mars"), Is.Zero);
            using var session = VulcanusLuaEngine.StartSession(bindings, lua, "Divinity fixture");
            session.Tick(0);
            Assert.That(Game.State.Player.Favour.GetFavour("mars"), Is.EqualTo(5));

            source[0]["arguments"]["deityId"] = "test:missing-deity";
            CutsceneSequenceCompiler.Compile(source, "Invalid divinity fixture", out var invalid);
            Assert.That(() => Game.BindSequence(invalid, "cutscene", (typeof(DivineFavourLuaApi), () => new DivineFavourLuaApi())),
                Throws.InvalidOperationException.With.Message.Contains("test:missing-deity"));
            Assert.That(Game.State.Player.Favour.GetFavour("mars"), Is.EqualTo(5));
        }

        [Test]
        public void UnknownDeitiesAndNonIntegerPointsFailAtTheLuaBoundary()
        {
            var lua = Game.Lua.CreateEngine();
            Assert.That(() => lua.EvaluateCondition("DivineFavour.GetFavour('test:missing-deity') > 0"), Throws.Exception);
            Assert.That(() => lua.Execute("DivineFavour.AddFavour('test:missing-deity', 1)"), Throws.Exception);
            Assert.That(() => lua.Execute("DivineFavour.AddFavour('mars', 1.5)"), Throws.Exception);
            Assert.That(Game.State.Player.Favour.GetFavour("mars"), Is.Zero);
        }
    }
}
