using System;
using System.Collections.Generic;
using System.Reflection;
using Core.Common.Editor;
using Core.Events;
using Core.Game;
using Interaction.Tools.Stamina;
using NUnit.Framework;

namespace Character.Editor
{
    /// <summary>Checks stamina consumption, recovery, live save binding and maximum changes through a valid character fixture.</summary>
    public sealed class CharacterStaminaTests : IEventListener<StaminaChangedEvent>, IEventListener<StaminaDepletedEvent>
    {
        private GameTestFixture _fixture;
        private MainCharacter _character;
        private Stamina _stamina;
        private StaminaState _state;
        private readonly List<StaminaChangedEvent> _changes = new();
        private readonly List<GameCharacter> _depleted = new();

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Character stamina");
            _character = _fixture.CreateCharacter();
            _stamina = _character.Stamina;
            _state = new StaminaState();
            _stamina.Initialize(_state);
            _changes.Clear();
            _depleted.Clear();
            EventBus<StaminaChangedEvent>.Subscribe(this);
            EventBus<StaminaDepletedEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<StaminaChangedEvent>.Unsubscribe(this);
            EventBus<StaminaDepletedEvent>.Unsubscribe(this);
            _fixture.Dispose();
        }

        [Test]
        public void ConsumptionAndRecoveryUpdateLiveStateAndPublishCompletedValues()
        {
            Assert.That(_stamina.ConsumeStamina(30), Is.EqualTo(30));
            Assert.That(_state.Current, Is.EqualTo(70));
            Assert.That(_changes[0].Character, Is.SameAs(_character));
            Assert.That(_changes[0].Current, Is.EqualTo(70));
            Assert.That(_changes[0].Max, Is.EqualTo(100));
            Assert.That(_stamina.RestoreStamina(12), Is.EqualTo(12));
            Assert.That(_stamina.RestoreToFull(), Is.EqualTo(18));
            Assert.That(_state.Current, Is.EqualTo(100));
            Assert.That(_changes.Count, Is.EqualTo(3));
        }

        [Test]
        public void DepletionIdentifiesTheCharacterAndOnlyFiresWhenStaminaRunsOut()
        {
            Assert.That(_stamina.ConsumeStamina(int.MaxValue), Is.EqualTo(100));
            Assert.That(_depleted, Is.EqualTo(new[] { _character }));
            Assert.That(_stamina.ConsumeStamina(1), Is.Zero);
            Assert.That(_stamina.ConsumeStamina(0), Is.Zero);
            Assert.That(_changes.Count, Is.EqualTo(1));
            Assert.That(_depleted.Count, Is.EqualTo(1));
            _stamina.RestoreStamina(5);
            _stamina.ConsumeStamina(5);
            Assert.That(_depleted.Count, Is.EqualTo(2));
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Normal));
        }

        [Test]
        public void ExhaustedStaminaCanRecoverWithoutOverflowOrNoChangeNotifications()
        {
            _stamina.ConsumeStamina(100);
            _changes.Clear();
            Assert.That(_stamina.RestoreStamina(int.MaxValue), Is.EqualTo(100));
            Assert.That(_stamina.RestoreStamina(1), Is.Zero);
            Assert.That(_changes.Count, Is.EqualTo(1));
            Assert.That(_state.Current, Is.EqualTo(100));
        }

        [Test]
        public void ConfiguredStartingAmountIsAppliedOnceAndSavedZeroStaysExhausted()
        {
            typeof(Stamina).GetField("startingStamina", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_stamina, 60);
            var fresh = new StaminaState();
            _stamina.Initialize(fresh);
            Assert.That(fresh.Initialized, Is.True);
            Assert.That(fresh.Current, Is.EqualTo(60));
            _stamina.Initialize(new StaminaState { Initialized = true, Current = 0 });
            Assert.That(_stamina.CurrentStamina, Is.Zero);
            Assert.That(_depleted, Is.Empty, "Loading exhausted stamina is not a new depletion.");
        }

        [Test]
        public void MaximumChangesCapStaminaWithoutRefillingAndZeroMaximumIsValid()
        {
            _stamina.ConsumeStamina(20);
            _character.Attributes.SetModifier(CharacterAttributeType.MaxStamina, "test:penalty", -50);
            Assert.That(_state.Current, Is.EqualTo(50));
            _character.Attributes.RemoveModifier(CharacterAttributeType.MaxStamina, "test:penalty");
            Assert.That(_stamina.MaxStamina, Is.EqualTo(100));
            Assert.That(_state.Current, Is.EqualTo(50));
            _character.Attributes.SetModifier(CharacterAttributeType.MaxStamina, "test:penalty", -100);
            Assert.That(_state.Current, Is.Zero);
            Assert.That(_stamina.RestoreToFull(), Is.Zero);
        }

        [Test]
        public void RebindingAndTeardownPreserveStateAndDoNotDuplicateSubscriptions()
        {
            var saved = new StaminaState { Initialized = true, Current = 37 };
            _stamina.Initialize(saved);
            _stamina.Initialize(saved);
            _changes.Clear();
            _character.Attributes.SetModifier(CharacterAttributeType.MaxStamina, "test:bonus", 25);
            Assert.That(_changes.Count, Is.EqualTo(1));
            Assert.That(saved.Current, Is.EqualTo(37));
            _stamina.RestoreToFull();
            GameTestFixture.Invoke(_stamina, "Unbind");
            _character.Attributes.RemoveModifier(CharacterAttributeType.MaxStamina, "test:bonus");
            Assert.That(saved.Current, Is.EqualTo(125));
            Assert.That(_state.Current, Is.EqualTo(100));
        }

        [Test]
        public void PlayerInitializationUsesTheLiveSaveStateInsteadOfAnEventCopy()
        {
            _fixture.AddSingleton<GameStateManager>();
            GameState.Player.Home = new PlayerHomeState("test:home", "test-bed");
            GameState.Player.Stamina = new StaminaState { Initialized = true, Current = 37 };
            var player = _fixture.AddSingleton<Core.PlayerStateManager>();
            player.InitializeCharacter(_character);
            Assert.That(_stamina.CurrentStamina, Is.EqualTo(37));
            _stamina.ConsumeStamina(7);
            Assert.That(GameState.Player.Stamina.Current, Is.EqualTo(30));
            player.InitializeCharacter(_character);
            Assert.That(_stamina.CurrentStamina, Is.EqualTo(30));
        }

        [Test]
        public void NegativeAmountsFailWithoutChangingStamina()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => _stamina.ConsumeStamina(-1));
            Assert.Throws<ArgumentOutOfRangeException>(() => _stamina.RestoreStamina(-1));
            Assert.That(_state.Current, Is.EqualTo(100));
            Assert.That(_changes, Is.Empty);
        }

        public void OnEvent(StaminaChangedEvent change)
        {
            Assert.That(change.Current, Is.EqualTo(change.Character.Stamina.CurrentStamina));
            _changes.Add(change);
        }

        public void OnEvent(StaminaDepletedEvent change)
        {
            Assert.That(change.Character.Stamina.CurrentStamina, Is.Zero);
            _depleted.Add(change.Character);
        }
    }
}
