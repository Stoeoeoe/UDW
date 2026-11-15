using System.Linq;
using Character;
using Core.Common.Editor;
using Core.Events;
using Core.Game;
using Core.Inventory;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;
using static Core.Common.Editor.Reflect;

namespace Core.Shops.Editor
{
    public sealed class ShopTestItem : ItemDefinition { }

    public sealed class ShopTests : GameTest, IEventListener<ShopPurchaseEvent>, IEventListener<ShopSaleEvent>
    {
        private ShopService _shops;
        private Shop _shop;
        private ShopTestItem _seed, _bean;
        private SlotInventory _inventory;
        private Wallet _wallet;
        private ShopPurchaseEvent _purchase;
        private ShopSaleEvent _sale;
        private int _purchases, _sales;

        [SetUp]
        public void SetUp()
        {
            _purchases = _sales = 0;
            _seed = Item("test:seed", sellPrice: 0);
            _bean = Item("test:bean", sellPrice: 4);
            Game.Catalog<ItemCatalog>(_seed, _bean);
            _shop = Shop(buysGoods: true, "{ itemId: 'test:seed', price: 15 }, { itemId: 'test:bean', price: 9 }");
            Game.Catalog<ShopCatalog>(_shop);
            _shops = Game.Get<ShopService>();
            Game.State.Player.Inventory.Slots = new InventorySlotState[2];
            _inventory = Game.Inventory(Game.State.Player.Inventory, id => id == _seed.Id ? _seed : id == _bean.Id ? _bean : null);
            _wallet = new Wallet();
            _wallet.Add(100);
            EventBus<ShopPurchaseEvent>.Subscribe(this);
            EventBus<ShopSaleEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<ShopPurchaseEvent>.Unsubscribe(this);
            EventBus<ShopSaleEvent>.Unsubscribe(this);
        }

        public void OnEvent(ShopPurchaseEvent e) { _purchase = e; _purchases++; }
        public void OnEvent(ShopSaleEvent e) { _sale = e; _sales++; }

        private ShopTestItem Item(string id, int sellPrice)
        {
            var item = Game.Asset<ShopTestItem>();
            Set(item, "Id", id, typeof(ItemDefinition));
            Set(item, "SellBasePrice", sellPrice, typeof(ItemDefinition));
            return item;
        }

        private Shop Shop(bool buysGoods, string offerings) => VulcanusJson.Populate(Game.Asset<Shop>(),
            $"{{ id: 'test:shop', name: 'Test shop', buysGoods: {(buysGoods ? "true" : "false")}, offerings: [{offerings}] }}");

        [Test]
        public void OfferingsResolveTheirItemsInAuthoredOrder()
        {
            var offers = _shops.GetOfferings(_shop);
            Assert.That(offers.Select(offer => offer.Item), Is.EqualTo(new ItemDefinition[] { _seed, _bean }));
            Assert.That(offers.Select(offer => offer.Price), Is.EqualTo(new[] { 15, 9 }));
        }

        [Test]
        public void BuyingPaysTheFixedPriceAddsTheItemsAndPublishesTheTrade()
        {
            Assert.That(_shops.Buy(_shop, "test:seed", _wallet, _inventory, 2), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(_wallet.Balance, Is.EqualTo(70));
            Assert.That(_inventory.GetSlot(0).Item, Is.SameAs(_seed));
            Assert.That(_inventory.GetSlot(0).Quantity, Is.EqualTo(2));
            Assert.That(_purchases, Is.EqualTo(1));
            Assert.That(_purchase.UnitPrice, Is.EqualTo(15));
            Assert.That(_purchase.TotalPrice, Is.EqualTo(30));
            Assert.That(_purchase.BalanceBefore, Is.EqualTo(100));
            Assert.That(_purchase.BalanceAfter, Is.EqualTo(70));

            // The stock is unlimited: the same offering can be bought again.
            Assert.That(_shops.Buy(_shop, "test:seed", _wallet, _inventory, 2), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(_wallet.Balance, Is.EqualTo(40));
        }

        [Test]
        public void ARefusedPurchaseLeavesMoneyAndItemsUnchanged()
        {
            Assert.That(_shops.Buy(_shop, "test:seed", _wallet, _inventory, 0), Is.EqualTo(ShopTradeResult.InvalidQuantity));
            Assert.That(_shops.Buy(_shop, "test:missing", _wallet, _inventory), Is.EqualTo(ShopTradeResult.Unavailable));
            Assert.That(_shops.Buy(_shop, "test:seed", _wallet, _inventory, 7), Is.EqualTo(ShopTradeResult.InsufficientFunds));
            _inventory.AddItem(_bean, _bean.MaxStackSize * 2); // Both slots full.
            Assert.That(_shops.Buy(_shop, "test:seed", _wallet, _inventory), Is.EqualTo(ShopTradeResult.InventoryFull));
            Assert.That(_wallet.Balance, Is.EqualTo(100));
            Assert.That(_inventory.GetSlot(0).Item, Is.SameAs(_bean));
            Assert.That(_purchases, Is.Zero);
        }

        [Test]
        public void SellingPaysTheItemsSellPriceAndPublishesTheTrade()
        {
            _inventory.AddItem(_bean, 5);
            Assert.That(_shops.Sell(_shop, 0, _wallet, _inventory, 3), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(_wallet.Balance, Is.EqualTo(112));
            Assert.That(_inventory.GetSlot(0).Quantity, Is.EqualTo(2));
            Assert.That(_sales, Is.EqualTo(1));
            Assert.That(_sale.UnitPrice, Is.EqualTo(4));
            Assert.That(_sale.SlotQuantityBefore, Is.EqualTo(5));
            Assert.That(_sale.SlotQuantityAfter, Is.EqualTo(2));

            Assert.That(_shops.Sell(_shop, 0, _wallet, _inventory, 2), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(_inventory.GetSlot(0).IsEmpty, Is.True);
        }

        [Test]
        public void ASaleThatTheShopCannotMakeLeavesMoneyAndItemsUnchanged()
        {
            _inventory.AddItem(_bean, 2);
            _inventory.AddItem(_seed, 1); // Worth nothing to the shop.
            Assert.That(_shops.Sell(_shop, 0, _wallet, _inventory, 0), Is.EqualTo(ShopTradeResult.InvalidQuantity));
            Assert.That(_shops.Sell(_shop, 0, _wallet, _inventory, 3), Is.EqualTo(ShopTradeResult.NotAccepted));
            Assert.That(_shops.Sell(_shop, 1, _wallet, _inventory), Is.EqualTo(ShopTradeResult.NotAccepted));
            Assert.That(_shops.Sell(_shop, 9, _wallet, _inventory), Is.EqualTo(ShopTradeResult.NotAccepted));
            Assert.That(_wallet.Balance, Is.EqualTo(100));
            Assert.That(_inventory.GetSlot(0).Quantity, Is.EqualTo(2));
            Assert.That(_sales, Is.Zero);
        }

        [Test]
        public void AShopThatDoesNotBuyGoodsRefusesEverySale()
        {
            var closed = Shop(buysGoods: false, "{ itemId: 'test:seed', price: 15 }");
            _inventory.AddItem(_bean, 2);
            Assert.That(_shops.Sell(closed, 0, _wallet, _inventory), Is.EqualTo(ShopTradeResult.NotAccepted));
            Assert.That(_wallet.Balance, Is.EqualTo(100));
        }

        [Test]
        public void AnOfferingForAnUnknownItemFailsClearly()
        {
            var broken = Shop(buysGoods: true, "{ itemId: 'test:unknown', price: 1 }");
            Assert.That(() => _shops.GetOfferings(broken), Throws.InvalidOperationException.With.Message.Contains("test:unknown"));
        }
    }
}
