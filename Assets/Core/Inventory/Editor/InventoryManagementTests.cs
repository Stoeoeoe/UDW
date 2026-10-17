using TestConfiguration = Core.Common.Editor.ConfigurationTestData;
using System.Collections.Generic;
using System.Reflection;
using Character;
using Core.Equipment;
using NUnit.Framework;
using Sirenix.Serialization;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;
using SerializationUtility = Sirenix.Serialization.SerializationUtility;

namespace Core.Inventory.Editor
{
    [Category("InventoryManagement")]
    public sealed class InventoryManagementTests
    {
        private GameObject _root;
        private SlotInventory _bag;
        private InventoryState _state;
        private InventoryConfiguration _config;
        private readonly List<Object> _assets = new();
        private InventoryTestItem _grain;

        [SetUp] public void SetUp()
        {
            _root = new GameObject("Bag transactions"); _root.SetActive(false);
            _bag = _root.AddComponent<SlotInventory>();
            _config = ScriptableObject.CreateInstance<InventoryConfiguration>(); _assets.Add(_config);
            TestConfiguration.Set(_config, "Columns", 2); TestConfiguration.Set(_config, "StartingRows", 1);
            TestConfiguration.Set(_config, "Upgrades", new[] { new InventoryConfiguration.Upgrade { Rows = 2, Price = 10 } });
            _bag.Configuration = _config;
            _state = new InventoryState(); _bag.Bind(_state);
            _grain = Item<InventoryTestItem>("test:grain", 99);
        }
        [TearDown] public void TearDown()
        { Object.DestroyImmediate(_root); foreach (var asset in _assets) Object.DestroyImmediate(asset); _assets.Clear(); }
        private T Item<T>(string id, int max) where T : ItemDefinition
        {
            var item = ScriptableObject.CreateInstance<T>(); _assets.Add(item);
            typeof(ItemDefinition).GetField("_itemId", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(item, id);
            typeof(ItemDefinition).GetField("_maxStackSize", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(item, max);
            return item;
        }
        [Test] public void SplitMergeAndCancelConserveQuantities()
        {
            _bag.AddItem(_grain, 12);
            Assert.That(_bag.Interaction.TryPickUp(0, 5), Is.True);
            Assert.That(_bag.GetSlot(0).Quantity, Is.EqualTo(7));
            Assert.That(_bag.Interaction.TryPlaceHeld(1, true), Is.True);
            Assert.That(_bag.Interaction.TryReturnHeld(), Is.True);
            Assert.That(_bag.GetSlot(0).Quantity + _bag.GetSlot(1).Quantity, Is.EqualTo(12));

        }
        [Test] public void FailedCancellationKeepsTheSavedHeldStack()
        {
            _bag.AddItem(_grain, 99);
            _bag.Interaction.TryPickUp(0, 4);
            _bag.SetSlot(0, new ItemStack(_grain, 99));
            _bag.SetSlot(1, new ItemStack(_grain, 99));
            Assert.That(_bag.Interaction.TryReturnHeld(), Is.False);
            Assert.That(_bag.HeldStack.Quantity, Is.EqualTo(4));
            var restored = SerializationUtility.DeserializeValue<InventoryState>(SerializationUtility.SerializeValue(_state, DataFormat.Binary), DataFormat.Binary);
            Assert.That(restored.HeldSlot.Quantity, Is.EqualTo(4));
        }
        [Test] public void UpgradeIsAtomicAndPickupsUseTheWholeBag()
        {
            var wallet = new Wallet(); wallet.Add(9);
            Assert.That(_bag.Actions.TryUpgrade(wallet), Is.False);
            Assert.That(_bag.Capacity, Is.EqualTo(2));
            wallet.Add(1);
            Assert.That(_bag.Actions.TryUpgrade(wallet), Is.True);
            Assert.That(wallet.Balance, Is.Zero);
            Assert.That(_bag.Capacity, Is.EqualTo(4));
            _bag.AddItem(_grain, 1);
            Assert.That(_bag.GetSlot(0).Item, Is.SameAs(_grain));
            Assert.That(_bag.Actions.TryUpgrade(wallet), Is.False);
        }
        [Test] public void EquipmentTransfersOwnershipAndRejectsFullBagUnequip()
        {
            var slot = ScriptableObject.CreateInstance<EquipmentSlotDefinition>(); _assets.Add(slot); TestConfiguration.Set(slot, "Id", "test:head");
            TestConfiguration.Set(_config, "EquipmentSlots", new[] { slot });
            var hat = Item<WornEquipmentItem>("test:hat", 1); TestConfiguration.Set(hat, "AllowedSlots", new[] { slot });
            _bag.AddItem(hat, 1);
            Assert.That(_bag.Actions.TryEquip(0, slot), Is.True);
            Assert.That(_bag.GetSlot(0).IsOccupied, Is.False);
            Assert.That(_bag.Loadout.GetEquipment(slot.Id).Item, Is.SameAs(hat));
            _bag.AddItem(_grain, 198);
            Assert.That(_bag.Actions.TryUnequip(slot), Is.False);
            Assert.That(_bag.Loadout.GetEquipment(slot.Id).Item, Is.SameAs(hat));
            _bag.RemoveItemAt(0, 99);
            Assert.That(_bag.Actions.TryUnequip(slot), Is.True);
            Assert.That(_bag.Loadout.GetEquipment(slot.Id).IsOccupied, Is.False);
            var restored = SerializationUtility.DeserializeValue<InventoryState>(SerializationUtility.SerializeValue(_state, DataFormat.Binary), DataFormat.Binary);
            Assert.That(restored.Slots[0].ItemId, Is.EqualTo(hat.ItemId));
        }
        [Test] public void ToolbeltReferencesFollowToolsAndSurviveSerializationWithoutUsingBagSpace()
        {
            var tool = Item<Interaction.Tools.ToolData>("test:tool", 1);
            _bag.AddItem(tool, 1);
            var before = _state.Slots;
            Assert.That(_bag.Loadout.AssignToolbeltSlot(0, 9), Is.True, "Belt size does not depend on bag capacity.");
            Assert.That(_state.Slots, Is.SameAs(before));
            _bag.Loadout.SelectToolbeltSlot(9);
            _bag.MoveItem(0, 1);
            Assert.That(_bag.Loadout.ActiveHandItem, Is.SameAs(tool));
            Assert.That(_bag.Loadout.ActiveHandInventoryIndex, Is.EqualTo(1));
            var restored = SerializationUtility.DeserializeValue<InventoryState>(SerializationUtility.SerializeValue(_state, DataFormat.Binary), DataFormat.Binary);
            _bag.Bind(restored, id => id == tool.ItemId ? tool : null);
            Assert.That(_bag.Loadout.GetToolbeltTool(9), Is.SameAs(tool));
            Assert.That(_bag.Loadout.ActiveHandItem, Is.SameAs(tool));
            _bag.RemoveItemAt(1);
            Assert.That(_bag.Loadout.GetToolbeltTool(9), Is.Null);
            Assert.That(_bag.Loadout.ActiveHandItem, Is.Null);
            _bag.Loadout.SelectToolbeltSlot(9);
            Assert.That(_bag.Loadout.ActiveHandItem, Is.Null, "Shortcuts cannot create missing tools.");
            Assert.That(_bag.Capacity, Is.EqualTo(2));
        }
        [Test] public void BoundOperationsFollowTheReplacedSaveRootWithoutRecreatingServices()
        {
            var loadout = _bag.Loadout;
            var actions = _bag.Actions;
            var interaction = _bag.Interaction;
            var original = _state;
            var replacement = new InventoryState { Slots = new InventorySlotState[2] };
            _bag.Bind(replacement);
            Assert.That(_bag.Loadout, Is.SameAs(loadout));
            Assert.That(_bag.Actions, Is.SameAs(actions));
            Assert.That(_bag.Interaction, Is.SameAs(interaction));
            var tool = Item<Interaction.Tools.ToolData>("test:replacement", 1);
            _bag.AddItem(tool, 1);
            Assert.That(loadout.AssignToolbeltSlot(0, 0), Is.True);
            Assert.That(loadout.SelectToolbeltSlot(0), Is.True);
            Assert.That(replacement.SelectedItemId, Is.EqualTo(tool.ItemId));
            Assert.That(original.SelectedItemId, Is.Null);
            Assert.That(original.Toolbelt, Has.All.Null);
            var wallet = new Wallet(); wallet.Add(10);
            Assert.That(actions.TryUpgrade(wallet), Is.True);
            Assert.That(replacement.Slots.Length, Is.EqualTo(4));
            Assert.That(original.Slots.Length, Is.EqualTo(2));
        }

        [Test] public void ToolbeltAcceptsOnlyToolsAndClearingNeverRemovesTheOwnedItem()
        {
            var tool = Item<Interaction.Tools.ToolData>("test:tool", 1);
            _bag.AddItem(_grain, 1); _bag.AddItem(tool, 1);
            Assert.That(_bag.Loadout.AssignToolbeltSlot(0, 0), Is.False);
            Assert.That(_bag.Loadout.AssignToolbeltSlot(1, 0), Is.True);
            _bag.Loadout.SelectToolbeltSlot(0);
            Assert.That(_bag.Loadout.AssignToolbeltSlot(-1, 0), Is.True);
            Assert.That(_bag.Loadout.ActiveHandItem, Is.SameAs(tool), "Clearing a shortcut does not change the held tool.");
            _bag.Loadout.SelectToolbeltSlot(0);
            Assert.That(_bag.Loadout.ActiveHandItem, Is.Null);
            Assert.That(_bag.GetSlot(1).Item, Is.SameAs(tool));
        }
        [Test] public void SelectingASeedFromTheBagFollowsItsIdAndDoesNotAssignABeltCell()
        {
            var seed = Item<Plants.SeedItem>("test:seed", 99);
            _bag.AddItem(seed, 2); _bag.Loadout.SelectItem(0); _bag.MoveItem(0, 1);
            Assert.That(_bag.Loadout.ActiveHandItem, Is.SameAs(seed));
            Assert.That(_bag.Loadout.ActiveHandInventoryIndex, Is.EqualTo(1));
            Assert.That(_bag.Loadout.ActiveToolbeltSlot, Is.EqualTo(-1));
            Assert.That(_bag.Loadout.AssignToolbeltSlot(1, 0), Is.False);
        }
        [Test] public void RuntimePrefabsHaveSharedConfigurationAndCompleteUIBindings()
        {
            var root = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Resources/SystemRoot.prefab");
            Assert.That(UI.Shared.Editor.UIInputValidation.Check(root.GetComponentInChildren<UnityEngine.InputSystem.UI.InputSystemUIInputModule>(true)), Is.Empty);
            var character = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Character/Player/TestCharacter.prefab");
            foreach (var inventory in character.GetComponentsInChildren<SlotInventory>(true))
                if (inventory.InventoryName == "MainInventory") Assert.That(inventory.Configuration.Columns, Is.EqualTo(10));
        }
        [Test] public void DraggingGearIntoASlotPreservesOwnershipAndModifiersDoNotReapplyOnRefresh()
        {
            var slot = ScriptableObject.CreateInstance<EquipmentSlotDefinition>(); _assets.Add(slot); TestConfiguration.Set(slot, "Id", "test:head");
            TestConfiguration.Set(_config, "EquipmentSlots", new[] { slot });
            var hat = Item<WornEquipmentItem>("test:hat", 1); TestConfiguration.Set(hat, "AllowedSlots", new[] { slot });
            TestConfiguration.Set(hat, "Modifiers", new[] { new WornEquipmentItem.Modifier { Attribute = CharacterAttributeType.WalkSpeed, Flat = 1 } });
            _bag.AddItem(hat, 1); _bag.Interaction.TryPickUp(0, 1);
            Assert.That(_bag.Actions.TryEquipHeld(slot), Is.True);
            Assert.That(_bag.HeldStack.IsOccupied, Is.False);
            var attributes = new CharacterAttributes();
            var initial = attributes.WalkSpeed;
            using var effects = new CharacterEquipmentEffects(_bag, attributes);
            effects.Refresh(); effects.Refresh();
            Assert.That(attributes.WalkSpeed, Is.EqualTo(initial + 1));
            _bag.Actions.TryUnequip(slot);
            Assert.That(attributes.WalkSpeed, Is.EqualTo(initial));
        }
        [Test] public void SortingIncludesEveryBagRow()
        {
            var wallet = new Wallet(); wallet.Add(10); _bag.Actions.TryUpgrade(wallet);
            _bag.SetSlot(0, new ItemStack(_grain, 4));
            _bag.SetSlot(2, new ItemStack(_grain, 8));
            _bag.SetSlot(3, new ItemStack(_grain, 2));
            _bag.SortStorage();
            Assert.That(_bag.GetSlot(0).Quantity, Is.EqualTo(4));
            Assert.That(_bag.GetSlot(1).Quantity, Is.EqualTo(8));
            Assert.That(_bag.GetSlot(2).Quantity, Is.EqualTo(2));
            Assert.That(_bag.GetSlot(3).IsEmpty, Is.True);
        }


    }
}
