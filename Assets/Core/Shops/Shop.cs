using System;
using System.Collections.Generic;
using Character;
using Core.Common;
using Core.Events;
using Core.Game;
using Core.Inventory;
using Core.TimeAndWeather;
using UnityEngine;
using Random = UnityEngine.Random;

namespace Core.Shops
{
    public enum ShopTradeResult
    {
        Success, InvalidQuantity, Unavailable, OutOfStock,
        InsufficientFunds, InventoryFull, WalletFull, NotAccepted, InvalidPrice
    }

    /// <summary>A snapshot for displaying stock in definition order. Hidden offerings are omitted.</summary>
    public readonly struct ShopEntry
    {
        public string OfferingId { get; }
        public ItemDefinition Item { get; }
        public int Quantity { get; }
        public int UnitPrice { get; }
        public ShopEntry(string offeringId, ItemDefinition item, int quantity, int unitPrice)
        { OfferingId = offeringId; Item = item; Quantity = quantity; UnitPrice = unitPrice; }
    }

    /// <summary>Vendor stock and transactions. May live on an NPC or an independent shop object.</summary>
    public sealed class Shop : MonoBehaviour, IEventListener<NewDayEvent>
    {
        [NamespacedId, SerializeField] private string shopId;
        [SerializeField] private ShopDefinition definition;

        public string Id => shopId;
        public ShopDefinition Definition => definition;

        private ShopState State
        {
            get
            {
                if (!definition || string.IsNullOrWhiteSpace(shopId))
                    throw new InvalidOperationException("Assign a shop definition and a unique permanent shop ID.");
                if (!GameState.World.TryGet(shopId, out ShopState state))
                    GameState.World.Set(shopId, state = new ShopState());
                return state;
            }
        }

        private void OnEnable() => EventBus<NewDayEvent>.Subscribe(this);
        private void OnDisable() => EventBus<NewDayEvent>.Unsubscribe(this);
        public void OnEvent(NewDayEvent change) => RefreshStock(change.Day);

        /// <summary>Daily stock replaces remaining stock. Skipped days need only the current day's roll.</summary>
        public void RefreshStock(int day)
        {
            var state = State;
            var changes = new List<ShopRestockEntry>();
            foreach (var offering in definition.Offerings)
            {
                var first = !state.offerings.TryGetValue(offering.id, out var stock);
                if (first) state.offerings.Add(offering.id, stock = new ShopStock());
                if (!first && stock.lastProcessedDay >= day) continue;
                var previousQuantity = stock.quantity;
                var previousAvailability = stock.available;
                var restocked = first || offering.restock == ShopRestockMode.Daily;
                stock.available = offering.dailyAppearanceChance >= 1f ||
                    offering.dailyAppearanceChance > 0f && Random.value < offering.dailyAppearanceChance;
                if (restocked)
                    stock.quantity = Random.Range(offering.minStock, offering.maxStock + 1);
                stock.lastProcessedDay = day;
                changes.Add(new ShopRestockEntry
                {
                    OfferingId = offering.id, Item = offering.item,
                    QuantityBefore = previousQuantity, QuantityAfter = stock.quantity,
                    AvailableBefore = previousAvailability, AvailableAfter = stock.available,
                    IsInitialStock = first, Restocked = restocked
                });
            }
            if (changes.Count == 0) return;
            var restock = new ShopRestockedEvent { Shop = this, Day = day, Entries = changes.AsReadOnly() };
            ShopChangedEvent.Trigger(this);
            EventBus<ShopRestockedEvent>.Raise(restock);
        }

        public IReadOnlyList<ShopEntry> GetOfferings()
        {
            RefreshStock(GameState.Time.daysSinceStart);
            var state = State;
            var result = new List<ShopEntry>();
            foreach (var offering in definition.Offerings)
            {
                var stock = state.offerings[offering.id];
                if (stock.available)
                    result.Add(new ShopEntry(offering.id, offering.item, stock.quantity,
                        GetPrice(offering.item.BuyBasePrice, offering.priceMultiplier)));
            }
            return result;
        }

        public int GetSellPrice(ItemDefinition item) => GetPrice(item.SellBasePrice, definition.sellPriceMultiplier);

        public ShopTradeResult Buy(string offeringId, Wallet wallet, SlotInventory inventory, int quantity = 1)
        {
            if (quantity <= 0) return ShopTradeResult.InvalidQuantity;
            RefreshStock(GameState.Time.daysSinceStart);
            ShopOffering offering = null;
            foreach (var candidate in definition.Offerings)
                if (candidate.id == offeringId) { offering = candidate; break; }
            if (offering == null) return ShopTradeResult.Unavailable;
            var stock = State.offerings[offeringId];
            if (!stock.available) return ShopTradeResult.Unavailable;
            if (stock.quantity < quantity) return ShopTradeResult.OutOfStock;
            var price = GetPrice(offering.item.BuyBasePrice, offering.priceMultiplier);
            if (price < 0) return ShopTradeResult.InvalidPrice;
            var total = (long)price * quantity;
            if (total > wallet.Balance) return ShopTradeResult.InsufficientFunds;
            if (!inventory.Storage.TryPrepareAddition(offering.item, quantity, out var content))
                return ShopTradeResult.InventoryFull;
            var previous = wallet.Balance;
            var stockBefore = stock.quantity;
            wallet.TrySpend((int)total, false);
            inventory.Storage.CommitContent(content);
            stock.quantity -= quantity;
            var purchase = new ShopPurchaseEvent
            {
                Shop = this, Buyer = wallet.Owner, Wallet = wallet, Inventory = inventory,
                OfferingId = offeringId, Item = offering.item, Quantity = quantity,
                UnitPrice = price, TotalPrice = (int)total,
                BalanceBefore = previous, BalanceAfter = wallet.Balance,
                StockBefore = stockBefore, StockAfter = stock.quantity,
                GameMinute = GameState.Time.TotalMinutes
            };
            PublishTrade(wallet, previous, inventory);
            EventBus<ShopPurchaseEvent>.Raise(purchase);
            return ShopTradeResult.Success;
        }

        public ShopTradeResult Sell(int slotIndex, Wallet wallet, SlotInventory inventory, int quantity = 1)
        {
            if (quantity <= 0) return ShopTradeResult.InvalidQuantity;
            if (!definition.acceptsSales ||
                slotIndex < 0 || slotIndex >= inventory.Capacity) return ShopTradeResult.NotAccepted;
            var stack = inventory.GetSlot(slotIndex);
            if (stack.IsEmpty || stack.Item.SellBasePrice <= 0) return ShopTradeResult.NotAccepted;
            if (quantity > stack.Quantity) return ShopTradeResult.OutOfStock;
            var price = GetSellPrice(stack.Item);
            if (price <= 0) return ShopTradeResult.NotAccepted;
            var total = (long)price * quantity;
            if (total > WalletState.MaximumBalance - wallet.Balance) return ShopTradeResult.WalletFull;
            var remaining = quantity == stack.Quantity ? ItemStack.Empty : new ItemStack(stack.Item, stack.Quantity - quantity);
            var previous = wallet.Balance;
            wallet.TryAdd((int)total, false);
            inventory.Storage.SetSlot(slotIndex, remaining);
            var sale = new ShopSaleEvent
            {
                Shop = this, Seller = wallet.Owner, Wallet = wallet, Inventory = inventory,
                SlotIndex = slotIndex, Item = stack.Item, Quantity = quantity,
                UnitPrice = price, TotalPrice = (int)total,
                BalanceBefore = previous, BalanceAfter = wallet.Balance,
                SlotQuantityBefore = stack.Quantity, SlotQuantityAfter = stack.Quantity - quantity,
                GameMinute = GameState.Time.TotalMinutes
            };
            PublishTrade(wallet, previous, inventory);
            EventBus<ShopSaleEvent>.Raise(sale);
            return ShopTradeResult.Success;
        }

        private void PublishTrade(Wallet wallet, int previous, SlotInventory inventory)
        {
            wallet.Notify(previous);
            InventoryChangedEvent.Trigger(inventory);
            ShopChangedEvent.Trigger(this);
        }

        // Prices round per item, midpoint away from zero; -1 indicates an unrepresentable price.
        private static int GetPrice(int basePrice, float multiplier)
        {
            var price = Math.Round((double)basePrice * multiplier, MidpointRounding.AwayFromZero);
            // Configuration guarantees finite, nonnegative inputs; the computed price can still overflow.
            return price > int.MaxValue ? -1 : (int)price;
        }
    }
}
