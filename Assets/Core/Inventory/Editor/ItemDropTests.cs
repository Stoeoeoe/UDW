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
    public sealed class ItemDropTests : Core.Common.Editor.ServiceTest
    {

        [Test]
        public void EssentialDropIsRejectedByTheSpawnerWithoutRemovingOwnership()
        {
            var item = Game.Asset<DropTestItem>();
            var flags = BindingFlags.Instance | BindingFlags.NonPublic;
            typeof(ItemDefinition).GetField("_itemId", flags).SetValue(item, "test:grain");
            typeof(ItemDefinition).GetField("_preventDropping", flags).SetValue(item, true);
            var bag = Game.Inventory(1);
            var manager = Game.Get<ItemManager>();
            Assert.That(bag.AddItem(item, 4), Is.True);
            Assert.That(manager.TryDrop(bag, 0, Vector3.zero), Is.False);
            Assert.That(bag.GetSlot(0).Item, Is.SameAs(item));
            Assert.That(bag.GetSlot(0).Quantity, Is.EqualTo(4));
        }
    }
}
