using Core.Common.Editor;
using Core.Inventory;
using Core.Inventory.Editor;
using NUnit.Framework;

namespace Core.Scripting.Editor
{
    public sealed class InventoryLuaApiTests : GameTest
    {
        private VulcanusLuaEngine _lua;
        private SlotInventory _bag;

        [SetUp]
        public void SetUp()
        {
            var item = Game.Asset<InventoryTestItem>();
            ConfigurationTestData.Set(item, "Id", "test:wine");
            ConfigurationTestData.Set(item, "MaxStackSize", 10);
            Game.Catalog<ItemDefinition>(item);
            _bag = Game.CreatePlayer().MainInventory;
            _lua = Game.Lua.CreateEngine();
        }

        [Test]
        public void ConditionsCountWhatThePlayerCarries()
        {
            Assert.That(_lua.EvaluateCondition("Inventory.Count('test:wine') == 0"), Is.True);
            _lua.Execute("assert(Inventory.Give('test:wine', 15))");
            Assert.That(_lua.EvaluateCondition("Inventory.Count('test:wine') == 15"), Is.True, "Across two stacks of ten.");
        }

        [Test]
        public void TakingRemovesFromEveryStackOnlyWhenThereAreEnough()
        {
            _lua.Execute("Inventory.Give('test:wine', 15)");
            _lua.Execute("assert(not Inventory.Take('test:wine', 16))");
            Assert.That(_lua.EvaluateCondition("Inventory.Count('test:wine') == 15"), Is.True, "Too few: nothing taken.");
            _lua.Execute("assert(Inventory.Take('test:wine', 12))");
            Assert.That(_lua.EvaluateCondition("Inventory.Count('test:wine') == 3"), Is.True);
        }

        [Test]
        public void AFullBagGivesNothing()
        {
            var tooMany = _bag.Capacity * 10 + 1;
            _lua.Execute($"assert(not Inventory.Give('test:wine', {tooMany}))");
            Assert.That(_lua.EvaluateCondition("Inventory.Count('test:wine') == 0"), Is.True);
        }

        [Test]
        public void UnknownItemsAndOddCountsFailClearly()
        {
            Assert.That(() => _lua.EvaluateCondition("Inventory.Count('test:missing') == 0"), Throws.Exception);
            Assert.That(() => _lua.Execute("Inventory.Give('test:wine', 1.5)"), Throws.Exception);
            Assert.That(() => _lua.Execute("Inventory.Take('test:wine', 0)"), Throws.Exception);
        }
    }
}
