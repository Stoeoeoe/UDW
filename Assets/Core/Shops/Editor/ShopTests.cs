using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Character;
using Core.Events;
using Core.Game;
using Core.Inventory;
using Core.TimeAndWeather;
using NUnit.Framework;
using Sirenix.Serialization;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Shops.Editor
{
    public sealed class ShopTestItem : ItemDefinition { }

    public sealed class ShopTests : IEventListener<WalletChangedEvent>,
        IEventListener<ShopPurchaseEvent>, IEventListener<ShopSaleEvent>, IEventListener<ShopRestockedEvent>
    {
        private GameObject _root;
        private Core.Common.Editor.GameTestFixture _fixture;
        private GameStateManager _manager;
        private Shop _shop;
        private SlotInventory _inventory;
        private Wallet _wallet;
        private ShopDefinition _definition;
        private ShopTestItem _item;
        private ShopOffering _daily;
        private ShopOffering _never;
        private UnityEngine.Random.State _random;
        private int _expectedStock;
        private bool _checkTrade;
        private bool _mutateOnWalletChange;
        private readonly List<ShopPurchaseEvent> _purchases = new();
        private readonly List<ShopSaleEvent> _sales = new();
        private readonly List<ShopRestockedEvent> _restocks = new();

        [SetUp]
        public void SetUp()
        {
            Assert.That(GameStateManager.Instance, Is.Null, "Run outside a game session.");
            _random = UnityEngine.Random.state;
            _checkTrade = false;
            _mutateOnWalletChange = false;
            _purchases.Clear();
            _sales.Clear();
            _restocks.Clear();
            _fixture = new Core.Common.Editor.GameTestFixture("Shop tests");
            _root = _fixture.Root;
            _manager = _fixture.AddSingleton<GameStateManager>();
            GameState.Time.daysSinceStart = 1;
            _item = ScriptableObject.CreateInstance<ShopTestItem>();
            Set(_item, "_itemId", "test:shop-item");
            Set(_item, "_buyBasePrice", 10);
            Set(_item, "_sellBasePrice", 4);
            _daily = new ShopOffering { id = "daily", item = _item, minStock = 5, maxStock = 5, priceMultiplier = 1.5f };
            _never = new ShopOffering { id = "never", item = _item, restock = ShopRestockMode.Never, minStock = 3, maxStock = 3 };
            _definition = ScriptableObject.CreateInstance<ShopDefinition>();
            Set(_definition, "offerings", new[] { _daily, _never });
            _shop = _root.AddComponent<Shop>();
            Set(_shop, "shopId", "test:vendor");
            Set(_shop, "definition", _definition);
            Invoke(_shop, "OnEnable");
            _inventory = _root.AddComponent<SlotInventory>();
            Set(_inventory, "_inventoryName", "ShopTestInventory");
            Set(_inventory, "_numberOfSlots", 1);
            Invoke(_inventory, "Awake");
            _wallet = new Wallet();
            _wallet.Add(100);
            EventBus<ShopPurchaseEvent>.Subscribe(this);
            EventBus<ShopSaleEvent>.Subscribe(this);
            EventBus<ShopRestockedEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<WalletChangedEvent>.Unsubscribe(this);
            EventBus<ShopPurchaseEvent>.Unsubscribe(this);
            EventBus<ShopSaleEvent>.Unsubscribe(this);
            EventBus<ShopRestockedEvent>.Unsubscribe(this);
            if (_shop) Invoke(_shop, "OnDisable");
            _fixture?.Dispose();
            Object.DestroyImmediate(_definition);
            Object.DestroyImmediate(_item);
            UnityEngine.Random.state = _random;
        }

        [Test]
        public void BuySellAndReloadRoundTripInventoryWalletAndVendorStockTogether()
        {
            _inventory.Bind(GameState.Player.Inventory, id => id == _item.ItemId ? _item : null);
            _inventory.ApplyStartingLoadout(Array.Empty<ItemDefinition>());
            typeof(Wallet).GetMethod("Bind", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_wallet, new object[] { GameState.Player.Wallet });
            _wallet.Add(100);
            Assert.That(_shop.Buy("daily", _wallet, _inventory, 2), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(_shop.Sell(0, _wallet, _inventory), Is.EqualTo(ShopTradeResult.Success));
            var data = (GameSaveData)typeof(GameStateManager).GetField("_data", BindingFlags.Instance | BindingFlags.NonPublic)
                .GetValue(_manager);
            data.time.initialized = true;
            data.time.dayOfSeason = 1;
            data.time.hour = 6;
            data.Validate();
            var bytes = SerializationUtility.SerializeValue(data, DataFormat.JSON, out var references);
            Assert.That(references, Is.Empty);
            var loaded = SerializationUtility.DeserializeValue<GameSaveData>(bytes, DataFormat.JSON);
            loaded.Validate();
            _inventory.Bind(loaded.player.Inventory, id => id == _item.ItemId ? _item : null);
            Assert.That(loaded.player.Wallet.Balance, Is.EqualTo(74));
            Assert.That(_inventory.GetSlot(0).Item, Is.SameAs(_item));
            Assert.That(_inventory.GetSlot(0).Quantity, Is.EqualTo(1));
            Assert.That(loaded.player.Inventory.StartingLoadoutApplied, Is.True);
            Assert.That(loaded.world.TryGet(_shop.Id, out ShopState stock), Is.True);
            Assert.That(stock.offerings["daily"].quantity, Is.EqualTo(3));
        }

        [Test]
        public void NewDayReplacesDailyStockButNeverStockStaysDepleted()
        {
            Assert.That(_shop.GetOfferings().Select(row => row.OfferingId), Is.EqualTo(new[] { "daily", "never" }));
            Assert.That(_shop.Buy("daily", _wallet, _inventory, 2), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(_shop.Buy("never", _wallet, _inventory, 3), Is.EqualTo(ShopTradeResult.Success));
            GameState.Time.daysSinceStart = 2;
            NewDayEvent.Trigger(2);
            Assert.That(_shop.GetOfferings()[0].Quantity, Is.EqualTo(5));
            Assert.That(_shop.GetOfferings()[1].Quantity, Is.Zero);
        }

        [Test]
        public void SavedAppearanceAndQuantityDoNotRerollOnReopenOrRestore()
        {
            _daily.dailyAppearanceChance = 0.5f;
            _daily.minStock = 1;
            _daily.maxStock = 99;
            _shop.GetOfferings();
            Assert.That(GameState.World.TryGet(_shop.Id, out ShopState state), Is.True);
            var quantity = state.offerings["daily"].quantity;
            var available = state.offerings["daily"].available;
            var bytes = SerializationUtility.SerializeValue(state, DataFormat.JSON);
            var restored = SerializationUtility.DeserializeValue<ShopState>(bytes, DataFormat.JSON);
            GameState.World.Set(_shop.Id, restored);
            var before = UnityEngine.Random.state;
            _shop.GetOfferings();
            Invoke(_shop, "OnDisable");
            Invoke(_shop, "OnEnable");
            _shop.GetOfferings();
            Assert.That(restored.offerings["daily"].quantity, Is.EqualTo(quantity));
            Assert.That(restored.offerings["daily"].available, Is.EqualTo(available));
            Assert.That(UnityEngine.Random.state, Is.EqualTo(before));
        }

        [Test]
        public void HiddenOffersAndUnloadedCatchupUseTheCurrentDayOnly()
        {
            _daily.dailyAppearanceChance = 0;
            Assert.That(_shop.GetOfferings().Select(row => row.OfferingId), Is.EqualTo(new[] { "never" }));
            Assert.That(_shop.Buy("daily", _wallet, _inventory), Is.EqualTo(ShopTradeResult.Unavailable));
            Invoke(_shop, "OnDisable");
            _daily.dailyAppearanceChance = 1;
            GameState.Time.daysSinceStart = 12;
            Assert.That(_shop.GetOfferings()[0].OfferingId, Is.EqualTo("daily"));
            GameState.World.TryGet(_shop.Id, out ShopState state);
            Assert.That(state.offerings["daily"].lastProcessedDay, Is.EqualTo(12));
            Assert.That(state.offerings["never"].quantity, Is.EqualTo(3));
        }

        [Test]
        public void FailedPurchasesDoNotChangeMoneyInventoryOrStock()
        {
            _shop.GetOfferings();
            _inventory.SetSlot(0, new ItemStack(_item, _item.MaxStackSize));
            Assert.That(_shop.Buy("daily", _wallet, _inventory), Is.EqualTo(ShopTradeResult.InventoryFull));
            Assert.That(_wallet.Balance, Is.EqualTo(100));
            Assert.That(_shop.GetOfferings()[0].Quantity, Is.EqualTo(5));
            _wallet.TrySpend(100);
            Assert.That(_shop.Buy("daily", _wallet, _inventory), Is.EqualTo(ShopTradeResult.InsufficientFunds));
            Assert.That(_inventory.GetSlot(0).Quantity, Is.EqualTo(_item.MaxStackSize));
        }

        [Test]
        public void TradeEventsSeeCommittedStockMoneyAndInventory()
        {
            _shop.GetOfferings();
            _expectedStock = 3;
            _checkTrade = true;
            EventBus<WalletChangedEvent>.Subscribe(this);
            Assert.That(_shop.Buy("daily", _wallet, _inventory, 2), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(_wallet.Balance, Is.EqualTo(70));
        }

        public void OnEvent(WalletChangedEvent change)
        {
            if (_mutateOnWalletChange && change.Wallet == _wallet)
            {
                _mutateOnWalletChange = false;
                _wallet.Add(1);
            }
            if (!_checkTrade || change.Wallet != _wallet) return;
            Assert.That(_inventory.GetSlot(0).Quantity, Is.EqualTo(2));
            Assert.That(_shop.GetOfferings()[0].Quantity, Is.EqualTo(_expectedStock));
            Assert.That(change.Current, Is.EqualTo(70));
            Assert.That(change.Wallet.Balance, Is.EqualTo(change.Current));
        }

        public void OnEvent(ShopPurchaseEvent change) => _purchases.Add(change);
        public void OnEvent(ShopSaleEvent change) => _sales.Add(change);
        public void OnEvent(ShopRestockedEvent change) => _restocks.Add(change);

        [Test]
        public void PurchaseAndSaleEventsContainTransactionSnapshots()
        {
            Assert.That(_shop.Buy("daily", _wallet, _inventory, 2), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(_purchases.Count, Is.EqualTo(1));
            var purchase = _purchases[0];
            Assert.That(purchase.Shop, Is.SameAs(_shop));
            Assert.That(purchase.Wallet, Is.SameAs(_wallet));
            Assert.That(purchase.Inventory, Is.SameAs(_inventory));
            Assert.That(purchase.Item, Is.SameAs(_item));
            Assert.That(purchase.OfferingId, Is.EqualTo("daily"));
            Assert.That(purchase.Quantity, Is.EqualTo(2));
            Assert.That(purchase.UnitPrice, Is.EqualTo(15));
            Assert.That(purchase.TotalPrice, Is.EqualTo(30));
            Assert.That(purchase.BalanceBefore, Is.EqualTo(100));
            Assert.That(purchase.BalanceAfter, Is.EqualTo(70));
            Assert.That(purchase.StockBefore, Is.EqualTo(5));
            Assert.That(purchase.StockAfter, Is.EqualTo(3));
            Assert.That(purchase.GameMinute, Is.EqualTo(GameState.Time.TotalMinutes));

            Assert.That(_shop.Sell(0, _wallet, _inventory), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(_sales.Count, Is.EqualTo(1));
            var sale = _sales[0];
            Assert.That(sale.Shop, Is.SameAs(_shop));
            Assert.That(sale.Wallet, Is.SameAs(_wallet));
            Assert.That(sale.Inventory, Is.SameAs(_inventory));
            Assert.That(sale.Item, Is.SameAs(_item));
            Assert.That(sale.SlotIndex, Is.Zero);
            Assert.That(sale.Quantity, Is.EqualTo(1));
            Assert.That(sale.UnitPrice, Is.EqualTo(4));
            Assert.That(sale.TotalPrice, Is.EqualTo(4));
            Assert.That(sale.BalanceBefore, Is.EqualTo(70));
            Assert.That(sale.BalanceAfter, Is.EqualTo(74));
            Assert.That(sale.SlotQuantityBefore, Is.EqualTo(2));
            Assert.That(sale.SlotQuantityAfter, Is.EqualTo(1));
            Assert.That(purchase.BalanceAfter, Is.EqualTo(70));
        }

        [Test]
        public void RestockEventsDistinguishInitialStockAndAvailabilityOnlyRefreshes()
        {
            _shop.GetOfferings();
            Assert.That(_restocks.Count, Is.EqualTo(1));
            var initial = _restocks[0];
            Assert.That(initial.Day, Is.EqualTo(1));
            Assert.That(initial.Entries.All(row => row.IsInitialStock && row.Restocked), Is.True);
            Assert.That(initial.Entries[0].QuantityBefore, Is.Zero);
            Assert.That(initial.Entries[0].QuantityAfter, Is.EqualTo(5));
            _shop.GetOfferings();
            Assert.That(_restocks.Count, Is.EqualTo(1));
            _never.dailyAppearanceChance = 0;
            GameState.Time.daysSinceStart = 2;
            NewDayEvent.Trigger(2);
            Assert.That(_restocks.Count, Is.EqualTo(2));
            var daily = _restocks[1];
            Assert.That(daily.Day, Is.EqualTo(2));
            Assert.That(daily.Entries[0].Restocked, Is.True);
            Assert.That(daily.Entries.All(row => !row.IsInitialStock), Is.True);
            Assert.That(daily.Entries[1].Restocked, Is.False);
            Assert.That(daily.Entries[1].QuantityBefore, Is.EqualTo(3));
            Assert.That(daily.Entries[1].QuantityAfter, Is.EqualTo(3));
            Assert.That(daily.Entries[1].AvailableBefore, Is.True);
            Assert.That(daily.Entries[1].AvailableAfter, Is.False);
            Assert.That(initial.Entries[1].AvailableAfter, Is.True);
        }

        [Test]
        public void FailedTradesEmitNoPurchaseOrSaleEvents()
        {
            _wallet.TrySpend(100);
            Assert.That(_shop.Buy("daily", _wallet, _inventory), Is.EqualTo(ShopTradeResult.InsufficientFunds));
            Assert.That(_shop.Sell(0, _wallet, _inventory), Is.EqualTo(ShopTradeResult.NotAccepted));
            Assert.That(_purchases, Is.Empty);
            Assert.That(_sales, Is.Empty);
        }

        [Test]
        public void PurchaseSnapshotIsCapturedBeforeNotificationCallbacksCanMutateBalance()
        {
            _mutateOnWalletChange = true;
            EventBus<WalletChangedEvent>.Subscribe(this);
            _shop.Buy("daily", _wallet, _inventory);
            Assert.That(_wallet.Balance, Is.EqualTo(86));
            Assert.That(_purchases[0].BalanceAfter, Is.EqualTo(85));
            Assert.That(_purchases[0].TotalPrice, Is.EqualTo(15));
        }

        [Test]
        public void VendorsSharingADefinitionKeepSeparateStockAndReorderingKeepsOfferingIdentity()
        {
            var other = _root.AddComponent<Shop>();
            Set(other, "shopId", "test:other-vendor");
            Set(other, "definition", _definition);
            _shop.GetOfferings();
            other.GetOfferings();
            Assert.That(_shop.Buy("daily", _wallet, _inventory), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(other.GetOfferings()[0].Quantity, Is.EqualTo(5));
            Set(_definition, "offerings", new[] { _never, _daily });
            Assert.That(_shop.GetOfferings().Select(row => row.OfferingId), Is.EqualTo(new[] { "never", "daily" }));
            Assert.That(_shop.GetOfferings()[1].Quantity, Is.EqualTo(4));
        }

        [Test]
        public void DiscountsRoundPerUnitAndUnrepresentablePricesDoNotTrade()
        {
            _daily.priceMultiplier = 0.75f;
            Assert.That(_shop.GetOfferings()[0].UnitPrice, Is.EqualTo(8));
            Assert.That(_shop.Buy("daily", _wallet, _inventory, 2), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(_wallet.Balance, Is.EqualTo(84));
            _daily.priceMultiplier = float.MaxValue;
            Assert.That(_shop.Buy("daily", _wallet, _inventory), Is.EqualTo(ShopTradeResult.InvalidPrice));
            Assert.That(_wallet.Balance, Is.EqualTo(84));
            Assert.That(_shop.GetOfferings()[0].Quantity, Is.EqualTo(3));
        }

        [Test]
        public void SalesRespectQuantityWalletCapAndDoNotCreateBuybackStock()
        {
            _inventory.AddItem(_item, 3);
            Assert.That(_shop.Sell(0, _wallet, _inventory, -1), Is.EqualTo(ShopTradeResult.InvalidQuantity));
            Assert.That(_shop.Sell(0, _wallet, _inventory, 4), Is.EqualTo(ShopTradeResult.OutOfStock));
            Assert.That(_shop.Sell(0, _wallet, _inventory, 2), Is.EqualTo(ShopTradeResult.Success));
            Assert.That(_wallet.Balance, Is.EqualTo(108));
            Assert.That(_inventory.GetSlot(0).Quantity, Is.EqualTo(1));
            Assert.That(_shop.GetOfferings()[0].Quantity, Is.EqualTo(5));
            _wallet.Add(int.MaxValue);
            Assert.That(_shop.Sell(0, _wallet, _inventory), Is.EqualTo(ShopTradeResult.WalletFull));
            Assert.That(_inventory.GetSlot(0).Quantity, Is.EqualTo(1));
        }

        private static void Set(object target, string field, object value)
        {
            for (var type = target.GetType(); type != null; type = type.BaseType)
            {
                var info = type.GetField(field, BindingFlags.Instance | BindingFlags.NonPublic);
                if (info == null) continue;
                info.SetValue(target, value);
                return;
            }
            throw new MissingFieldException(field);
        }

        private static void Invoke(object target, string method) => target.GetType()
            .GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic).Invoke(target, null);
    }
}
