using System;
using Core.Common.Editor;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Inventory.Editor
{
    [Category("InventoryManagement")]
    public sealed class InventoryStorageTests
    {
        private DropTestItem _item;
        private InventoryState _state;
        private InventoryStorage _storage;
        private InventoryInteraction _interaction;
        private int _notifications;

        [SetUp]
        public void SetUp()
        {
            _item = ScriptableObject.CreateInstance<DropTestItem>();
            ConfigurationTestData.Set(_item, "ItemId", "test:storage");
            ConfigurationTestData.Set(_item, "MaxStackSize", 5);
            _state = new InventoryState();
            _storage = new InventoryStorage(_state, id => id == _item.ItemId ? _item : null, 2);
            _notifications = 0;
            _interaction = new InventoryInteraction(_storage, _state, () => _notifications++);
        }

        [TearDown] public void TearDown() => Object.DestroyImmediate(_item);

        private void Commit(ItemStack[] content) =>
            ((Action<ItemStack[]>)typeof(InventoryStorage).GetMethod("CommitContent",
                System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
                .CreateDelegate(typeof(Action<ItemStack[]>), _storage))(content);

        [Test]
        public void FullAdditionIsAtomicAndContentIsOnlyASnapshot()
        {
            Assert.That(_storage.AddItem(_item, 7), Is.True);
            var committed = _state.Slots;
            Assert.That(_storage.AddItem(_item, 4), Is.False);
            Assert.That(_state.Slots, Is.SameAs(committed));
            Assert.That(_state.Slots[0].Quantity, Is.EqualTo(5));
            Assert.That(_state.Slots[1].Quantity, Is.EqualTo(2));
            var snapshot = _storage.GetSnapshot();
            snapshot[0] = ItemStack.Empty;
            Assert.That(_storage.GetSlot(0).Quantity, Is.EqualTo(5));
        }

        [Test]
        public void HeldTransfersConserveItemsInTheLiveSaveState()
        {
            _storage.AddItem(_item, 5);
            Assert.That(_interaction.TryPickUp(0, 3), Is.True);
            Assert.That(_state.Slots[0].Quantity, Is.EqualTo(2));
            Assert.That(_state.HeldSlot.Quantity, Is.EqualTo(3));
            Assert.That(_interaction.TryPlaceHeld(1, one: true), Is.True);
            Assert.That(_state.Slots[1].Quantity, Is.EqualTo(1));
            Assert.That(_state.HeldSlot.Quantity, Is.EqualTo(2));
            Assert.That(_interaction.TryReturnHeld(), Is.True);
            Assert.That(_state.Slots[0].Quantity, Is.EqualTo(4));
            Assert.That(_interaction.HeldStack.IsOccupied, Is.False);
            Assert.That(_state.HeldSourceIndex, Is.EqualTo(-1));
        }

        [Test]
        public void RebindingPreservesSavedCapacityAndMissingDefinitionsFailClearly()
        {
            _storage.AddItem(_item, 5);
            var replacement = new InventoryState
            {
                Slots = new[] { new InventorySlotState(_item.ItemId, 5) }
            };
            _storage.Bind(replacement, id => null, initialCapacity: 10);
            Assert.That(_storage.Capacity, Is.EqualTo(1), "Saved capacity wins over defaults.");
            Assert.Throws<InvalidOperationException>(() => _storage.GetSlot(0));
            Assert.Throws<InvalidOperationException>(() => _storage.AddItem(_item, 1));
            Assert.That(replacement.Slots[0].Quantity, Is.EqualTo(5));
            Assert.That(_state.Slots[0].Quantity, Is.EqualTo(5));
        }

        [Test]
        public void OrdinaryMutationsKeepTheSavedArrayAndPreparationDoesNotChangeIt()
        {
            var slots = _state.Slots;
            _storage.SetSlot(1, new ItemStack(_item, 3));
            _storage.MoveItem(1, 0);
            _storage.RemoveItemAt(0);
            Assert.That(_state.Slots, Is.SameAs(slots));
            Assert.That(_storage.GetSlot(0).Quantity, Is.EqualTo(2));
            Assert.That(_storage.TryPrepareAddition(_item, 9, out var rejected), Is.False);
            Assert.That(rejected, Is.Null);
            Assert.That(_storage.TryPrepareAddition(_item, 8, out var prepared), Is.True);
            Assert.That(_storage.GetSlot(0).Quantity, Is.EqualTo(2));
            Commit(prepared);
            Assert.That(_state.Slots, Is.SameAs(slots));
            Assert.That(_storage.GetSlot(0).Quantity, Is.EqualTo(5));
            Assert.That(_storage.GetSlot(1).Quantity, Is.EqualTo(5));
        }

        [Test]
        public void InvalidArgumentsThrowWithoutMutatingSlots()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => _storage.SetSlot(-1, ItemStack.Empty));
            Assert.Throws<ArgumentOutOfRangeException>(() => _storage.AddItem(_item, 0));
            Assert.Throws<ArgumentNullException>(() => _storage.AddItem(null, 1));
            Assert.Throws<ArgumentException>(() => _storage.SetSlot(0, new ItemStack(_item, 6)));
            Assert.Throws<ArgumentException>(() => Commit(new[]
            { new ItemStack(_item, 2), new ItemStack(_item, 6) }));
            Assert.That(_storage.GetSlot(0).IsEmpty, Is.True);
            Assert.That(_storage.GetSlot(1).IsEmpty, Is.True);
        }

        [Test]
        public void PartialPlacementAndFullTargetNotifyOnlyForCompletedTransfers()
        {
            _storage.SetSlot(0, new ItemStack(_item, 5));
            _storage.SetSlot(1, new ItemStack(_item, 4));
            Assert.That(_interaction.TryPickUp(0, 3), Is.True);
            Assert.That(_interaction.TryPlaceHeld(1), Is.True);
            Assert.That(_storage.GetSlot(1).Quantity, Is.EqualTo(5));
            Assert.That(_interaction.HeldStack.Quantity, Is.EqualTo(2));
            Assert.That(_interaction.TryPlaceHeld(1), Is.False);
            Assert.That(_notifications, Is.EqualTo(2));
            Assert.That(_interaction.TryReturnHeld(), Is.True);
            Assert.That(_storage.GetSlot(0).Quantity, Is.EqualTo(4));
            Assert.That(_notifications, Is.EqualTo(3));
            Assert.That(_interaction.TryReturnHeld(), Is.True);
            Assert.That(_notifications, Is.EqualTo(3), "Returning an empty hand is a no-op.");
        }

        [Test]
        public void ReturnDistributesAcrossPartialStacksWhenSourceCannotHoldEverything()
        {
            _storage.SetSlot(0, new ItemStack(_item, 5));
            _interaction.TryPickUp(0, 3);
            _storage.SetSlot(0, new ItemStack(_item, 4));
            _storage.SetSlot(1, new ItemStack(_item, 3));
            Assert.That(_interaction.TryReturnHeld(), Is.True);
            Assert.That(_storage.GetSlot(0).Quantity, Is.EqualTo(5));
            Assert.That(_storage.GetSlot(1).Quantity, Is.EqualTo(5));
            Assert.That(_interaction.HeldStack.IsEmpty, Is.True);
            Assert.That(_notifications, Is.EqualTo(2));
        }

        [Test]
        public void SwappingChangesHeldSourceAndOneItemPlacementRejectsIncompatibleTargets()
        {
            var other = ScriptableObject.CreateInstance<DropTestItem>();
            try
            {
                ConfigurationTestData.Set(other, "ItemId", "test:other");
                ConfigurationTestData.Set(other, "MaxStackSize", 5);
                _storage.SetSlot(0, new ItemStack(_item, 3));
                _storage.SetSlot(1, new ItemStack(other, 2));
                Assert.That(_interaction.TryPickUp(0, 3), Is.True);
                Assert.That(_interaction.TryPlaceHeld(1, one: true), Is.False);
                Assert.That(_notifications, Is.EqualTo(1));
                Assert.That(_interaction.HeldStack.Item, Is.SameAs(_item));
                Assert.That(_interaction.TryPlaceHeld(1), Is.True);
                Assert.That(_storage.GetSlot(1).Item, Is.SameAs(_item));
                Assert.That(_interaction.HeldStack.Item, Is.SameAs(other));
                Assert.That(_interaction.HeldSourceIndex, Is.EqualTo(1));
                Assert.That(_interaction.TryReturnHeld(), Is.True);
                Assert.That(_storage.GetSlot(0).Item, Is.SameAs(other));
                Assert.That(_notifications, Is.EqualTo(3));
            }
            finally { Object.DestroyImmediate(other); }
        }

        [Test]
        public void FullBagReturnAndEmptyPickupLeaveStateAndNotificationsUnchanged()
        {
            Assert.That(_interaction.TryPickUp(0, 1), Is.False);
            _storage.AddItem(_item, 5);
            _interaction.TryPickUp(0, 3);
            _storage.SetSlot(0, new ItemStack(_item, 5));
            _storage.SetSlot(1, new ItemStack(_item, 5));
            Assert.That(_interaction.TryReturnHeld(), Is.False);
            Assert.That(_interaction.HeldStack.Quantity, Is.EqualTo(3));
            Assert.That(_interaction.HeldSourceIndex, Is.Zero);
            Assert.That(_storage.GetSlot(0).Quantity, Is.EqualTo(5));
            Assert.That(_storage.GetSlot(1).Quantity, Is.EqualTo(5));
            Assert.That(_notifications, Is.EqualTo(1));
        }
    }
}
