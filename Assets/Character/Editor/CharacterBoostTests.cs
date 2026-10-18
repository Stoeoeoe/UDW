using System;
using System.Reflection;
using Core.Common.Editor;
using Core.Events;
using Core.Game;
using Core.Items;
using Core.TimeAndWeather;
using NUnit.Framework;
using UnityEngine;

namespace Character.Editor
{
    /// <summary>Checks boost stacking, expiry, consumables and resource restoration using inline bonuses, saved snapshots and the game clock.</summary>
    public sealed class CharacterBoostTests : IEventListener<Interaction.Tools.Stamina.StaminaChangedEvent>
    {
        private GameTestFixture _fixture;
        private MainCharacter _character;
        private CharacterBoosts _boosts;
        private CharacterBoostState _state;
        private AttributeBoostConsumableItem _rested, _snack, _vitality;
        private int _staminaChanges;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Character boosts");
            _fixture.AddSingleton<GameStateManager>();
            GameState.Time.initialized = true;
            GameState.Time.daysSinceStart = 1;
            GameState.Time.dayOfSeason = 1;
            GameState.Time.hour = 6;
            _character = _fixture.CreateCharacter();
            _boosts = _character.Boosts;
            _rested = Definition("test:rested", CharacterAttributeType.MaxStamina, 0.25f, 120);
            _snack = Definition("test:snack", CharacterAttributeType.MaxStamina, 0.1f, 30);
            _vitality = Definition("test:vitality", CharacterAttributeType.MaxHealth, 0.5f, 60);
            _state = new CharacterBoostState();
            _boosts.Initialize(_state);
            _staminaChanges = 0;
            EventBus<Interaction.Tools.Stamina.StaminaChangedEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<Interaction.Tools.Stamina.StaminaChangedEvent>.Unsubscribe(this);
            _fixture.Dispose();
        }

        [Test]
        public void ApplyingABoostRaisesTheMaximumWithoutRestoringPoints()
        {
            _rested.Apply(_character);
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(125));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100));
            Assert.That(_state.Active[Source(_rested)].ExpiresAtMinute, Is.EqualTo(GameState.Time.TotalMinutes + 120));
            Assert.That(_boosts.IsActive(Source(_rested)), Is.True);
        }

        [Test]
        public void RefreshingTheSameBoostExtendsItsExpiryWithoutStackingOrClippingResources()
        {
            _rested.Apply(_character);
            _character.Stamina.RestoreToFull();
            Advance(40);
            _staminaChanges = 0;
            _rested.Apply(_character);
            Assert.That(_state.Active[Source(_rested)].ExpiresAtMinute, Is.EqualTo(GameState.Time.TotalMinutes + 120));
            Assert.That(_state.Active.Count, Is.EqualTo(1));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(125));
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(125));
            Assert.That(_staminaChanges, Is.Zero);
        }

        [Test]
        public void DifferentBoostsCombineAndExpireIndependently()
        {
            _rested.Apply(_character);
            _snack.Apply(_character);
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(135));
            _character.Stamina.RestoreToFull();
            Advance(30);
            Assert.That(_boosts.IsActive(Source(_snack)), Is.False);
            Assert.That(_boosts.IsActive(Source(_rested)), Is.True);
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(125));
            Advance(90);
            Assert.That(_state.Active, Is.Empty);
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100));
        }

        [Test]
        public void OneItemCanBoostSeveralAttributesAndExpireThemTogether()
        {
            var health = new AttributeBonus();
            Set(health, "attribute", CharacterAttributeType.MaxHealth);
            Set(health, "flat", 20f);
            Set(_rested, "boosts", new[] { _rested.Boosts[0], health });
            _rested.RequireValidConfiguration();
            _rested.Apply(_character);
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(125));
            Assert.That(_character.Health.MaxHealth, Is.EqualTo(120));
            Assert.That(_state.Active[Source(_rested)].Bonuses.Length, Is.EqualTo(2));
            Advance(120);
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(100));
            Assert.That(_character.Health.MaxHealth, Is.EqualTo(100));
        }

        [Test]
        public void OvernightClockJumpsExpireHealthBoostsAndCapTheResource()
        {
            _vitality.Apply(_character);
            _character.Health.RestoreToFull();
            Assert.That(_character.Health.CurrentHealth, Is.EqualTo(150));
            Advance(1440);
            Assert.That(_character.Health.MaxHealth, Is.EqualTo(100));
            Assert.That(_character.Health.CurrentHealth, Is.EqualTo(100));
            Assert.That(_state.Active, Is.Empty);
        }

        [Test]
        public void BoostsUseTheExistingAttributeFormulaAlongsideEquipmentSources()
        {
            var speed = Definition("test:speed", CharacterAttributeType.RunSpeed, 0.5f, 20);
            _character.Attributes.SetModifier(CharacterAttributeType.RunSpeed, "equipment:test", flat: 2);
            speed.Apply(_character);
            Assert.That(_character.Attributes.RunSpeed, Is.EqualTo(13.5f));
            Advance(20);
            Assert.That(_character.Attributes.RunSpeed, Is.EqualTo(9));
        }

        [Test]
        public void PlayerRestoreAndRebindingApplyBoostsBeforeClampingSavedResources()
        {
            GameState.Player.Home = new PlayerHomeState("test:home", "test-bed");
            GameState.Player.Boosts.Active[Source(_rested)] = Snapshot(_rested, GameState.Time.TotalMinutes + 120);
            GameState.Player.Boosts.Active[Source(_vitality)] = Snapshot(_vitality, GameState.Time.TotalMinutes + 60);
            GameState.Player.Health = new HealthState { Initialized = true, Current = 140 };
            GameState.Player.Stamina = new StaminaState { Initialized = true, Current = 120 };
            var manager = _fixture.AddSingleton<Core.PlayerStateManager>();
            manager.InitializeCharacter(_character);
            Assert.That(_character.Health.CurrentHealth, Is.EqualTo(140));
            Assert.That(_character.Health.MaxHealth, Is.EqualTo(150));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(120));
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(125));
            manager.InitializeCharacter(_character);
            Assert.That(GameState.Player.Health.Current, Is.EqualTo(140));
            Assert.That(GameState.Player.Stamina.Current, Is.EqualTo(120));
        }

        [Test]
        public void ExpiredSavedBoostsAreRemovedDuringRestore()
        {
            var saved = new CharacterBoostState();
            saved.Active[Source(_rested)] = Snapshot(_rested, GameState.Time.TotalMinutes);
            _boosts.Initialize(saved);
            Assert.That(saved.Active, Is.Empty);
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(100));
        }

        [Test]
        public void RestoreUsesCapturedValuesWithoutAnItemOrCatalogLookup()
        {
            var saved = new CharacterBoostState();
            saved.Active["item:removed-mod:tonic"] = Snapshot(_rested, GameState.Time.TotalMinutes + 60);
            Set(_rested.Boosts[0], "percent", 0.9f);
            _boosts.Initialize(saved);
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(125));
            Advance(60);
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(100));
        }

        [Test]
        public void ApplicationCapturesBonusesRatherThanKeepingAuthoredReferences()
        {
            _rested.Apply(_character);
            Set(_rested.Boosts[0], "percent", 0.9f);
            _rested.Apply(_character);
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(125));
            Assert.That(_state.Active[Source(_rested)].Bonuses[0].Percent, Is.EqualTo(0.25f));
            Advance(120);
            _rested.Apply(_character);
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(190));
        }

        [Test]
        public void ConsumingABoostItemUsesTheNormalInventoryAction()
        {
            var item = _fixture.Own(ScriptableObject.CreateInstance<AttributeBoostConsumableItem>());
            typeof(Core.Inventory.ItemDefinition).GetField("_itemId", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(item, "test:tonic");
            Set(item, "boosts", new[] { _rested.Boosts[0] });
            item.RequireValidConfiguration();
            _character.MainInventory.AddItem(item, 1);
            Assert.That(_character.MainInventory.Actions.TryConsume(0, _character), Is.True);
            Assert.That(_character.MainInventory.GetSlot(0).IsEmpty, Is.True);
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(125));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100));
        }

        [Test]
        public void TeardownPreservesSavedBoostsAndResourcesAndUnsubscribesFromTheClock()
        {
            _rested.Apply(_character);
            _character.Stamina.RestoreToFull();
            var stamina = new StaminaState { Initialized = true, Current = 125 };
            _character.Stamina.Initialize(stamina);
            var saved = _state;
            _fixture.Dispose();
            _fixture = new GameTestFixture("Disposed boost check");
            GameTimeChangedEvent.Trigger(long.MaxValue);
            Assert.That(saved.Active.Count, Is.EqualTo(1));
            Assert.That(stamina.Current, Is.EqualTo(125));
        }

        [Test]
        public void InvalidAuthoredBoostsAreRejectedByValidation()
        {
            Set(_rested, "boostDurationMinutes", 0);
            Assert.That(_rested.ValidateConfiguration(), Is.Not.Empty);
            Set(_rested, "boostDurationMinutes", 120);
            var bonus = _rested.Boosts[0];
            Set(bonus, "percent", -0.25f);
            Assert.That(_rested.ValidateConfiguration(), Is.Not.Empty);
        }

        public void OnEvent(Interaction.Tools.Stamina.StaminaChangedEvent change) => ++_staminaChanges;

        private AttributeBoostConsumableItem Definition(string id, CharacterAttributeType attribute, float percent, int minutes)
        {
            var definition = _fixture.Own(ScriptableObject.CreateInstance<AttributeBoostConsumableItem>());
            var bonus = new AttributeBonus();
            Set(bonus, "attribute", attribute);
            Set(bonus, "percent", percent);
            typeof(Core.Inventory.ItemDefinition).GetField("_itemId", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(definition, id);
            Set(definition, "boostDurationMinutes", minutes);
            Set(definition, "boosts", new[] { bonus });
            definition.RequireValidConfiguration();
            return definition;
        }

        private static string Source(AttributeBoostConsumableItem item) => $"item:{item.ItemId}";

        private static ActiveAttributeBoost Snapshot(AttributeBoostConsumableItem item, long expiry) => new()
        {
            ExpiresAtMinute = expiry,
            Bonuses = new[] { new AppliedAttributeBonus
            {
                Attribute = item.Boosts[0].Attribute, Flat = item.Boosts[0].Flat, Percent = item.Boosts[0].Percent
            } }
        };

        private static void Advance(int minutes)
        {
            var total = GameState.Time.TotalMinutes + minutes;
            GameState.Time.daysSinceStart = (int)(total / 1440) + 1;
            GameState.Time.hour = (int)(total % 1440 / 60);
            GameState.Time.minute = (int)(total % 60);
            GameTimeChangedEvent.Trigger(total);
        }

        private static void Set(object target, string field, object value) => target.GetType()
            .GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
    }
}
