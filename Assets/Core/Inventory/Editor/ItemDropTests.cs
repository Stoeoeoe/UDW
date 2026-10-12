using System.Reflection;
using Core.Items;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Inventory.Editor
{
    public sealed class DropTestItem : ItemDefinition { }

    [Category("InventoryManagement")]
    public sealed class ItemDropTests
    {
        [Test]
        public void EssentialDropIsRejectedByTheSpawnerWithoutRemovingOwnership()
        {
            var root = new GameObject("Drop test");
            root.SetActive(false);
            var item = ScriptableObject.CreateInstance<DropTestItem>();
            try
            {
                // Support both the existing property and the private-field authoring style.
                var flags = BindingFlags.Instance | BindingFlags.NonPublic;
                var id = typeof(ItemDefinition).GetField("_itemId", flags)
                    ?? typeof(ItemDefinition).GetField("<ItemId>k__BackingField", flags);
                id.SetValue(item, "test:grain");
                typeof(ItemDefinition).GetField("_preventDropping", flags).SetValue(item, true);
                var bag = root.AddComponent<SlotInventory>();
                bag.Bind(new InventoryState { Slots = new InventorySlotState[1] });
                var manager = root.AddComponent<ItemManager>();
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Core/Items/DroppedItem.prefab")
                    .GetComponent<WorldItem>();
                Assert.That(prefab, Is.Not.Null);
                typeof(ItemManager).GetField("droppedItemPrefab", flags).SetValue(manager, prefab);
                Assert.That(bag.AddItem(item, 4), Is.True);
                Assert.That(manager.TryDrop(bag, 0, Vector3.zero), Is.False);
                Assert.That(bag.GetSlot(0).Item, Is.SameAs(item));
                Assert.That(bag.GetSlot(0).Quantity, Is.EqualTo(4));
            }
            finally
            {
                Object.DestroyImmediate(root);
                Object.DestroyImmediate(item);
            }
        }
    }
}
