using Core.Game;
using Core.TimeAndWeather;
using NUnit.Framework;
using UnityEngine;

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

        [Test]
        public void ServiceFixturesBuildTheClockWithoutAnySceneObjects()
        {
            using var game = new GameTestFixture(sceneServices: false);

            Assert.That(game.Clock, Is.SameAs(game.Get<GameClock>()));
            Assert.That(game.Characters.MainCharacter, Is.Null);
            Assert.That(game.Root.GetComponentsInChildren<Component>(true), Has.Length.EqualTo(1),
                "Only the root transform exists: services need no GameObjects.");
        }

        [Test]
        public void FixturesOwnIndependentClocksAndPlayerRegistries()
        {
            using var first = new GameTestFixture(sceneServices: false);
            using var second = new GameTestFixture(sceneServices: false);

            first.Clock.Start();

            Assert.That(second.Clock, Is.Not.SameAs(first.Clock));
            Assert.That(first.State.Time.initialized, Is.True);
            Assert.That(second.State.Time.initialized, Is.False);
            Assert.That(second.Characters, Is.Not.SameAs(first.Characters));
        }

        [Test]
        public void TestSettingsReplaceTheAuthoredClockBeforeComposition()
        {
            using var game = new GameTestFixture(sceneServices: false);
            var spring = game.Asset<SeasonData>();
            spring.season = Season.Spring;
            var settings = game.Use(new ClockSettings { seasons = new[] { spring }, startingDay = 3, secondsPerInGameMinute = 1f });

            game.Clock.Start();
            game.Clock.Advance(2.5f);

            Assert.That(game.Get<ClockSettings>(), Is.SameAs(settings));
            Assert.That(game.State.Time.dayOfSeason, Is.EqualTo(3));
            Assert.That(game.State.Time.minute, Is.EqualTo(20));
        }
    }
}
