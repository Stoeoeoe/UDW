using System;
using System.Reflection;
using Character;
using Core.Common.Editor;
using Core.Game;
using Plants;
using NUnit.Framework;
using Sirenix.Serialization;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Inventory.Editor
{
    public sealed class ContainerTests
    {
        private CharacterDefinition _owner;
        private ItemDefinition _item;
        private ContainerState _state;
        private InventoryState _bagState;
        private InventoryStorage _bag;
        private ContainerStorage _container;

        [SetUp]
        public void SetUp()
        {
            _owner = ScriptableObject.CreateInstance<CharacterDefinition>();
            ConfigurationTestData.Set(_owner, "characterId", "test:owner");
            ConfigurationTestData.Set(_owner, "displayName", "Owner");
            ConfigurationTestData.Set(_owner, "icon", "??");
            _item = ScriptableObject.CreateInstance<ProduceItem>();
            ConfigurationTestData.Set(_item, "ItemId", "test:apple");
            ConfigurationTestData.Set(_item, "MaxStackSize", 5);
            _state = new ContainerState { prefabId = "test:chest", authored = true, OwnerCharacterId = "test:owner",
                Inventory = new InventoryState { Slots = new InventorySlotState[2] } };
            _bagState = new InventoryState();
            _bag = new InventoryStorage(_bagState, ResolveItem, 2);
            _container = new ContainerStorage(_state, ResolveCharacter, ResolveItem);
        }

        private CharacterDefinition ResolveCharacter(string id) => id == "test:owner" ? _owner : null;
        private ItemDefinition ResolveItem(string id) => id == _item.ItemId ? _item : null;
        [TearDown] public void TearDown() { Object.DestroyImmediate(_owner); Object.DestroyImmediate(_item); }

        [Test]
        public void DepositAndWithdrawalPreserveTotalQuantityAndLiveState()
        {
            var slots = _state.Inventory.Slots;
            _bag.SetSlot(0, new ItemStack(_item, 5));
            Assert.That(_container.TryDeposit(_bag, 0, 3), Is.True);
            Assert.That(_bag.GetSlot(0).Quantity, Is.EqualTo(2));
            Assert.That(_container.Inventory.GetSlot(0).Quantity, Is.EqualTo(3));
            Assert.That(_container.TryWithdraw(_bag, 0, 1), Is.True);
            Assert.That(_bag.GetSlot(0).Quantity, Is.EqualTo(3));
            Assert.That(_state.Inventory.Slots[0].Quantity, Is.EqualTo(2));
            Assert.That(_state.Inventory.Slots, Is.SameAs(slots));
            Assert.That(_bagState.HeldSlot.Quantity, Is.Zero);
        }

        [Test]
        public void TransfersPreserveOwnershipWithoutRequiringAnOwnerIdentity()
        {
            _bag.AddItem(_item, 3);
            _container.Inventory.AddItem(_item, 2);
            Assert.That(_container.TryDeposit(_bag, 0, 1), Is.True);
            Assert.That(_container.TryWithdraw(_bag, 0, 1), Is.True);
            Assert.That(_state.OwnerCharacterId, Is.EqualTo("test:owner"));
            Assert.That(_bag.GetSlot(0).Quantity, Is.EqualTo(3));
            Assert.That(_container.Inventory.GetSlot(0).Quantity, Is.EqualTo(2));
        }

        [TestCase(true)]
        [TestCase(false)]
        public void InsufficientCapacityLeavesBothInventoriesUntouched(bool deposit)
        {
            var source = deposit ? _bag : _container.Inventory;
            var target = deposit ? _container.Inventory : _bag;
            source.AddItem(_item, 3);
            target.AddItem(_item, 9);
            bool moved = deposit ? _container.TryDeposit(_bag, 0, 3)
                : _container.TryWithdraw(_bag, 0, 3);
            Assert.That(moved, Is.False);
            Assert.That(source.GetSlot(0).Quantity, Is.EqualTo(3));
            Assert.That(target.GetSlot(0).Quantity, Is.EqualTo(5));
            Assert.That(target.GetSlot(1).Quantity, Is.EqualTo(4));
        }

        [Test]
        public void TransfersMergeThenFillEmptySlotsWithoutDuplicatingItems()
        {
            _bag.AddItem(_item, 5);
            _container.Inventory.AddItem(_item, 4);
            Assert.That(_container.TryDeposit(_bag, 0, 5), Is.True);
            Assert.That(_bag.GetSlot(0).IsEmpty, Is.True);
            Assert.That(_container.Inventory.GetSlot(0).Quantity, Is.EqualTo(5));
            Assert.That(_container.Inventory.GetSlot(1).Quantity, Is.EqualTo(4));
        }

        [Test]
        public void InvalidInternalTransferArgumentsFailClearly()
        {
            _bag.AddItem(_item, 2);
            Assert.Throws<ArgumentOutOfRangeException>(() => _container.TryDeposit(_bag, 0, 3));
            Assert.Throws<ArgumentOutOfRangeException>(() => _container.TryDeposit(_bag, 0, 0));
            Assert.Throws<ArgumentOutOfRangeException>(() => _container.TryDeposit(_bag, 4, 1));
            Assert.That(_bag.GetSlot(0).Quantity, Is.EqualTo(2));
        }

        [Test]
        public void MissingOwnersAndMalformedSavedContentsFailBeforeBinding()
        {
            _state.OwnerCharacterId = "missing:owner";
            Assert.Throws<InvalidOperationException>(() => new ContainerStorage(_state, ResolveCharacter, ResolveItem));
            _state.OwnerCharacterId = "test:owner";
            _state.Inventory.Slots[0] = new InventorySlotState("missing:item", 1);
            Assert.Throws<InvalidOperationException>(() => new ContainerStorage(_state, ResolveCharacter, ResolveItem));
            _state.Inventory.Slots[0] = new InventorySlotState(_item.ItemId, 6);
            Assert.Throws<InvalidOperationException>(() => new ContainerStorage(_state, ResolveCharacter, ResolveItem));
            _state.Inventory.Slots = null;
            Assert.Throws<InvalidOperationException>(() => new ContainerStorage(_state, ResolveCharacter, ResolveItem));
        }

        [Test]
        public void OwnerAndContentsRoundTripInsideTheExistingWorldSaveRecord()
        {
            _container.Inventory.AddItem(_item, 4);
            var data = new GameSaveData();
            data.player.Home = new PlayerHomeState("base:farm", "test-bed");
            data.time.initialized = true;
            data.time.daysSinceStart = data.time.dayOfSeason = 1;
            data.world.Set("base:farm", "authored-chest", _state);
            var bytes = SerializationUtility.SerializeValue(data, DataFormat.JSON, out var unityObjects);
            Assert.That(unityObjects, Is.Empty);
            var loaded = SerializationUtility.DeserializeValue<GameSaveData>(bytes, DataFormat.JSON);
            Assert.That(loaded.world.TryGet("base:farm", "authored-chest", out ContainerState saved), Is.True);
            var restored = new ContainerStorage(saved, ResolveCharacter, ResolveItem);
            Assert.That(restored.State.OwnerCharacterId, Is.EqualTo("test:owner"));
            Assert.That(restored.Inventory.GetSlot(0).Quantity, Is.EqualTo(4));
            Assert.That(restored.TryWithdraw(_bag, 0, 4), Is.True);
            Assert.That(saved.Inventory.Slots[0].Quantity, Is.Zero);
            Assert.That(_bag.GetSlot(0).Quantity, Is.EqualTo(4));
        }
    }
}
