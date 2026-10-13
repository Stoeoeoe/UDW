using System;
using System.Collections.Generic;
using Core.Game;
using NUnit.Framework;
using UnityEngine;

namespace Core.Common.Editor
{
    public sealed class FixtureDependency : Singleton<FixtureDependency>
    {
        public List<string> Calls;
        protected override void OnAwake() => Calls.Add("dependency awake");
        private void OnDisable() => Calls.Add("dependency disable");
        protected override void OnDestroy() { Calls.Add("dependency destroy"); base.OnDestroy(); }
    }

    public sealed class FixtureDependent : Singleton<FixtureDependent>
    {
        public List<string> Calls;
        protected override void OnAwake()
        {
            if (!FixtureDependency.Instance) throw new InvalidOperationException("Dependency required.");
            Calls.Add("dependent awake");
        }
        private void OnDisable()
        {
            Assert.That(FixtureDependency.Instance, Is.Not.Null);
            Calls.Add("dependent disable");
        }
        protected override void OnDestroy() { Calls.Add("dependent destroy"); base.OnDestroy(); }
    }

    [Category("GameTestFixture")]
    public sealed class GameTestFixtureTests
    {
        [Test]
        public void ConfiguresBeforeAwakeAndTearsDownDependentsFirst()
        {
            var calls = new List<string>();
            using (var game = new GameTestFixture())
            {
                game.AddSingleton<FixtureDependency>(value => value.Calls = calls);
                game.AddSingleton<FixtureDependent>(value => value.Calls = calls);
            }
            Assert.That(calls, Is.EqualTo(new[] { "dependency awake", "dependent awake",
                "dependent disable", "dependent destroy", "dependency disable", "dependency destroy" }));
            Assert.That(FixtureDependency.Instance, Is.Null);
            Assert.That(FixtureDependent.Instance, Is.Null);
        }

        [Test]
        public void FailedInitializationDoesNotLeakSingletonState()
        {
            using (var game = new GameTestFixture())
                Assert.Throws<InvalidOperationException>(() =>
                    game.AddSingleton<FixtureDependent>(value => value.Calls = new List<string>()));
            Assert.That(FixtureDependent.Instance, Is.Null);
        }

        [Test]
        public void RejectsAnExistingSingletonWithoutReplacingOrDestroyingIt()
        {
            using var owner = new GameTestFixture();
            var state = owner.AddSingleton<GameStateManager>();
            using (var other = new GameTestFixture())
                Assert.Throws<AssertionException>(() => other.AddSingleton<GameStateManager>());
            Assert.That(GameStateManager.Instance, Is.SameAs(state));
        }
    }
}
