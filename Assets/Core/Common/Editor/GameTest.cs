using NUnit.Framework;

namespace Core.Common.Editor
{
    /// <summary>Owns an isolated game scope only when a test actually uses it.</summary>
    public abstract class GameTest
    {
        private GameTestFixture _game;
        protected virtual bool SceneServices => true;
        internal GameTestFixture Game => _game ??= new GameTestFixture(GetType().Name, SceneServices);

        [TearDown]
        public void DisposeGame()
        {
            _game?.Dispose();
            _game = null;
        }
    }

    /// <summary>Tests session rules without instantiating scene managers or running Unity callbacks.</summary>
    public abstract class ServiceTest : GameTest
    {
        protected override bool SceneServices => false;
    }
}
