using Core.Game;
using NUnit.Framework;

namespace Core.Common.Editor
{
    [Category("GameTestFixture")]
    public sealed class GameTestFixtureTests
    {
        [Test]
        public void FixturesOwnIndependentManagersAndSavedRoots()
        {
            using var owner = new GameTestFixture();
            var state = owner.Get<GameStateManager>();
            using (var other = new GameTestFixture())
            {
                var second = other.Get<GameStateManager>();
                Assert.That(second, Is.Not.SameAs(state));
                Assert.That(second.Player, Is.Not.SameAs(state.Player));
            }
            Assert.That(owner.Get<GameStateManager>(), Is.SameAs(state));
        }
    }
}
