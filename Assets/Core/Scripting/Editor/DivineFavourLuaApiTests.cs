using Core.Common.Editor;
using Core.Divinity;
using Core.Game;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Core.Scripting.Editor
{
    public sealed class DivineFavourLuaApiTests
    {
        private GameTestFixture _fixture;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Divinity Lua");
            _fixture.AddSingleton<GameStateManager>();
        }

        [TearDown]
        public void TearDown() => _fixture.Dispose();

        [Test]
        public void ScriptsChangeLiveFavourAndBoonsWhileConditionsRemainReadOnly()
        {
            var character = _fixture.CreateCharacter();
            GameStateManager.Instance.DivineFavour.BindCharacter(character);
            var defense = character.Attributes.PhysicalDefense;
            var lua = new VulcanusLuaEngine();
            Assert.That(lua.EvaluateCondition("DivineFavour.GetFavour('mars') == 0 and DivineFavour.AddFavour == nil"), Is.True);
            lua.Execute("assert(DivineFavour.AddFavour('mars', 10) == 10)");
            Assert.That(GameState.Player.Favour.GetFavour("mars"), Is.EqualTo(10));
            Assert.That(character.Attributes.PhysicalDefense, Is.GreaterThan(defense));
            Assert.That(lua.EvaluateCondition("DivineFavour.GetFavour('mars') >= 10"), Is.True);
            lua.Execute("assert(DivineFavour.AddFavour('mars', -12) == -2)");
            Assert.That(character.Attributes.PhysicalDefense, Is.EqualTo(defense));
            Assert.That(GameState.Player.Favour.GetFavour("mars"), Is.EqualTo(-2));
        }

        [TestCase("setup")]
        [TestCase("sequence")]
        [TestCase("completion")]
        public void FavourActionRunsInEachCutscenePhase(string phase)
        {
            using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(new DivineFavourLuaApi()),
                "DivineFavour.AddFavour('mars', 3)", "Divinity fixture", phase: phase);
            session.Tick(0);
            Assert.That(session.IsRunning, Is.False);
            Assert.That(GameState.Player.Favour.GetFavour("mars"), Is.EqualTo(3));
        }

        [Test]
        public void AuthoredActionsValidateDeitiesBeforeExecution()
        {
            var source = JArray.Parse("[{ 'id':'reward', 'action':'divinity.addFavour', 'arguments': { 'deityId':'mars', 'points':5 } }]");
            var lua = CutsceneSequenceCompiler.Compile(source, "Divinity fixture", out var steps);
            var bindings = CutsceneBindings.BindSequence(steps, "cutscene", (typeof(DivineFavourLuaApi), () => new DivineFavourLuaApi()));
            Assert.That(GameState.Player.Favour.GetFavour("mars"), Is.Zero);
            using var session = VulcanusLuaEngine.StartSession(bindings, lua, "Divinity fixture");
            session.Tick(0);
            Assert.That(GameState.Player.Favour.GetFavour("mars"), Is.EqualTo(5));

            source[0]["arguments"]["deityId"] = "test:missing-deity";
            CutsceneSequenceCompiler.Compile(source, "Invalid divinity fixture", out var invalid);
            Assert.That(() => CutsceneBindings.BindSequence(invalid, "cutscene", (typeof(DivineFavourLuaApi), () => new DivineFavourLuaApi())),
                Throws.InvalidOperationException.With.Message.Contains("test:missing-deity"));
            Assert.That(GameState.Player.Favour.GetFavour("mars"), Is.EqualTo(5));
        }

        [Test]
        public void UnknownDeitiesAndNonIntegerPointsFailAtTheLuaBoundary()
        {
            var lua = new VulcanusLuaEngine();
            Assert.That(() => lua.EvaluateCondition("DivineFavour.GetFavour('test:missing-deity') > 0"), Throws.Exception);
            Assert.That(() => lua.Execute("DivineFavour.AddFavour('test:missing-deity', 1)"), Throws.Exception);
            Assert.That(() => lua.Execute("DivineFavour.AddFavour('mars', 1.5)"), Throws.Exception);
            Assert.That(GameState.Player.Favour.GetFavour("mars"), Is.Zero);
        }
    }
}
