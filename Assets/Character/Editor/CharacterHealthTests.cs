using System;
using System.Collections.Generic;
using Core.Common.Editor;
using Core.Events;
using Core.Game;
using NUnit.Framework;

namespace Character.Editor
{
    /// <summary>Checks health bounds, death, attribute changes and live-state binding through the authored character fixture.</summary>
    public sealed class CharacterHealthTests : IEventListener<HealthChangedEvent>
    {
        private GameTestFixture _fixture;
        private MainCharacter _character;
        private CharacterHealth _health;
        private HealthState _state;
        private readonly List<HealthChangedEvent> _changes = new();

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Character health");
            _character = _fixture.CreateCharacter();
            _health = _character.Health;
            _state = new HealthState();
            _health.Initialize(_state);
            _changes.Clear();
            EventBus<HealthChangedEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<HealthChangedEvent>.Unsubscribe(this);
            _fixture.Dispose();
        }

        [Test]
        public void DamageAndHealingMutateLiveStateAndPublishCompletedValues()
        {
            Assert.That(_health.TakeDamage(30), Is.EqualTo(30));
            Assert.That(_state.Current, Is.EqualTo(70));
            Assert.That(_changes.Count, Is.EqualTo(1));
            Assert.That(_changes[0].Character, Is.SameAs(_character));
            Assert.That(_changes[0].Current, Is.EqualTo(70));
            Assert.That(_changes[0].Max, Is.EqualTo(100));
            Assert.That(_health.Heal(12), Is.EqualTo(12));
            Assert.That(_health.RestoreToFull(), Is.EqualTo(18));
            Assert.That(_state.Current, Is.EqualTo(100));
            Assert.That(_changes.Count, Is.EqualTo(3));
        }

        [Test]
        public void HealingCapsWithoutOverflowAndNoChangeProducesNoNotification()
        {
            _health.TakeDamage(1);
            _changes.Clear();
            Assert.That(_health.Heal(int.MaxValue), Is.EqualTo(1));
            Assert.That(_health.Heal(20), Is.Zero);
            Assert.That(_health.TakeDamage(0), Is.Zero);
            Assert.That(_changes.Count, Is.EqualTo(1));
            Assert.That(_health.CurrentHealth, Is.EqualTo(100));
        }

        [Test]
        public void LethalDamageEntersDeathOnceAndOrdinaryHealingCannotRevive()
        {
            var deaths = 0;
            _character.OnConditionStateChanged += condition =>
            {
                if (condition == ConditionState.Dead)
                {
                    ++deaths;
                    Assert.That(_state.Current, Is.Zero);
                }
            };
            Assert.That(_health.TakeDamage(int.MaxValue), Is.EqualTo(100));
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Dead));
            Assert.That(_health.TakeDamage(1), Is.Zero);
            Assert.That(_health.Heal(100), Is.Zero);
            Assert.That(_health.RestoreToFull(), Is.Zero);
            Assert.That(_health.IsDead, Is.True);
            Assert.That(deaths, Is.EqualTo(1));
            Assert.That(_changes.Count, Is.EqualTo(1));
        }

        [Test]
        public void MaximumChangesCapCurrentHealthWithoutGrantingFreeHealing()
        {
            _health.TakeDamage(20);
            _character.Attributes.SetModifier(CharacterAttributeType.MaxHealth, "test:penalty", -50);
            Assert.That(_health.CurrentHealth, Is.EqualTo(50));
            Assert.That(_health.MaxHealth, Is.EqualTo(50));
            _character.Attributes.RemoveModifier(CharacterAttributeType.MaxHealth, "test:penalty");
            Assert.That(_health.CurrentHealth, Is.EqualTo(50));
            Assert.That(_health.MaxHealth, Is.EqualTo(100));
            Assert.That(_changes.Count, Is.EqualTo(3));
        }

        [Test]
        public void NewStateStartsAtTheModifiedMaximumWhileRebindingPreservesSavedHealth()
        {
            _character.Attributes.SetModifier(CharacterAttributeType.MaxHealth, "test:boon", 25);
            var fresh = new HealthState();
            _health.Initialize(fresh);
            Assert.That(fresh.Initialized, Is.True);
            Assert.That(fresh.Current, Is.EqualTo(125));
            var saved = new HealthState { Initialized = true, Current = 37 };
            _health.Initialize(saved);
            _health.Initialize(saved);
            _changes.Clear();
            _character.Attributes.RemoveModifier(CharacterAttributeType.MaxHealth, "test:boon");
            Assert.That(saved.Current, Is.EqualTo(37));
            Assert.That(_changes.Count, Is.EqualTo(1), "Rebinding must not duplicate attribute subscriptions.");
            _health.TakeDamage(5);
            Assert.That(saved.Current, Is.EqualTo(32));
            Assert.That(fresh.Current, Is.EqualTo(125), "The previous state is no longer bound.");
        }

        [Test]
        public void BindingSavedZeroHealthRestoresDeathRatherThanRefilling()
        {
            _health.Initialize(new HealthState { Initialized = true, Current = 0 });
            Assert.That(_health.CurrentHealth, Is.Zero);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Dead));
        }

        [Test]
        public void UnbindingBeforeBonusTeardownPreservesTheSavedAmount()
        {
            _character.Attributes.SetModifier(CharacterAttributeType.MaxHealth, "test:equipment", 25);
            _health.RestoreToFull();
            GameTestFixture.Invoke(_health, "Unbind");
            _character.Attributes.RemoveModifier(CharacterAttributeType.MaxHealth, "test:equipment");
            Assert.That(_state.Current, Is.EqualTo(125));
        }

        [Test]
        public void PlayerInitializationBindsTheSaveRootAndPreservesHealthOnRebinding()
        {
            _fixture.AddSingleton<GameStateManager>();
            GameState.Player.Home = new PlayerHomeState("test:home", "test-bed");
            GameState.Player.Health = new HealthState { Initialized = true, Current = 37 };
            var player = _fixture.AddSingleton<Core.PlayerStateManager>();
            player.InitializeCharacter(_character);
            Assert.That(_health.CurrentHealth, Is.EqualTo(37));
            _health.TakeDamage(7);
            Assert.That(GameState.Player.Health.Current, Is.EqualTo(30));
            player.InitializeCharacter(_character);
            Assert.That(_health.CurrentHealth, Is.EqualTo(30));
        }

        [Test]
        public void NegativeDamageAndHealingFailWithoutMutatingHealth()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => _health.TakeDamage(-1));
            Assert.Throws<ArgumentOutOfRangeException>(() => _health.Heal(-1));
            Assert.That(_health.CurrentHealth, Is.EqualTo(100));
            Assert.That(_changes, Is.Empty);
        }

        public void OnEvent(HealthChangedEvent change)
        {
            Assert.That(change.Current, Is.EqualTo(change.Character.Health.CurrentHealth));
            _changes.Add(change);
        }
    }
}
