using Core.Catalogs;
using System;
using System.Collections.Generic;
using Character;
using Core.Events;
using Core.Game;
using Core.Inventory;

namespace Core.Shops
{
    public enum ShopTradeResult
    {
        Success, InvalidQuantity, Unavailable, InsufficientFunds, InventoryFull, WalletFull, NotAccepted
    }

    /// <summary>A shop offering with its item resolved, in authored order.</summary>
    public readonly struct ShopEntry
    {
        public ItemDefinition Item { get; }
        public int Price { get; }
        public ShopEntry(ItemDefinition item, int price) { Item = item; Price = price; }
    }

    /// <summary>Resolves shops and runs trades. Static shops keep no saved state.</summary>
    public sealed class ShopService
    {
        private readonly DefinitionCatalog _catalog;
        private readonly GameState _gameState;

        public ShopService(DefinitionCatalog catalog, GameState gameState)
        {
            _catalog = catalog;
            _gameState = gameState;
        }

        public Shop Require(string shopId) => _catalog.Require<Shop>(shopId);

        public IReadOnlyList<ShopEntry> GetOfferings(Shop shop)
        {
            var result = new List<ShopEntry>(shop.Offerings.Length);
            foreach (var offering in shop.Offerings)
                result.Add(new ShopEntry(RequireItem(shop, offering.ItemId), offering.Price));
            return result;
        }

        /// <summary>What the shop pays for one of this item, when it buys goods.</summary>
        public int GetSellPrice(ItemDefinition item) => item.SellBasePrice;

        public ShopTradeResult Buy(Shop shop, string itemId, Wallet wallet, SlotInventory inventory, int quantity = 1)
        {
            if (quantity <= 0) return ShopTradeResult.InvalidQuantity;
            var offering = Array.Find(shop.Offerings, each => each.ItemId == itemId);
            if (offering == null) return ShopTradeResult.Unavailable;
            var item = RequireItem(shop, itemId);
            var total = (long)offering.Price * quantity;
            if (total > wallet.Balance) return ShopTradeResult.InsufficientFunds;
            if (!inventory.Storage.TryPrepareAddition(item, quantity, out var content)) return ShopTradeResult.InventoryFull;
            var previous = wallet.Balance;
            wallet.TrySpend((int)total, false);
            inventory.Storage.CommitContent(content);
            wallet.Notify(previous);
            InventoryChangedEvent.Trigger(inventory);
            EventBus<ShopPurchaseEvent>.Raise(new ShopPurchaseEvent
            {
                Shop = shop, Buyer = wallet.Owner, Wallet = wallet, Inventory = inventory, Item = item, Quantity = quantity,
                UnitPrice = offering.Price, TotalPrice = (int)total, BalanceBefore = previous, BalanceAfter = wallet.Balance,
                GameMinute = _gameState.Time.TotalMinutes
            });
            return ShopTradeResult.Success;
        }

        public ShopTradeResult Sell(Shop shop, int slotIndex, Wallet wallet, SlotInventory inventory, int quantity = 1)
        {
            if (quantity <= 0) return ShopTradeResult.InvalidQuantity;
            if (!shop.BuysGoods || slotIndex < 0 || slotIndex >= inventory.Capacity) return ShopTradeResult.NotAccepted;
            var stack = inventory.GetSlot(slotIndex);
            if (stack.IsEmpty || quantity > stack.Quantity) return ShopTradeResult.NotAccepted;
            var price = GetSellPrice(stack.Item);
            if (price <= 0) return ShopTradeResult.NotAccepted;
            var total = (long)price * quantity;
            if (total > WalletState.MaximumBalance - wallet.Balance) return ShopTradeResult.WalletFull;
            var remaining = quantity == stack.Quantity ? ItemStack.Empty : new ItemStack(stack.Item, stack.Quantity - quantity);
            var previous = wallet.Balance;
            wallet.TryAdd((int)total, false);
            inventory.Storage.SetSlot(slotIndex, remaining);
            wallet.Notify(previous);
            InventoryChangedEvent.Trigger(inventory);
            EventBus<ShopSaleEvent>.Raise(new ShopSaleEvent
            {
                Shop = shop, Seller = wallet.Owner, Wallet = wallet, Inventory = inventory, SlotIndex = slotIndex, Item = stack.Item,
                Quantity = quantity, UnitPrice = price, TotalPrice = (int)total, BalanceBefore = previous, BalanceAfter = wallet.Balance,
                SlotQuantityBefore = stack.Quantity, SlotQuantityAfter = stack.Quantity - quantity, GameMinute = _gameState.Time.TotalMinutes
            });
            return ShopTradeResult.Success;
        }

        private ItemDefinition RequireItem(Shop shop, string itemId) => _catalog.Get<ItemDefinition>(itemId) ??
            throw new InvalidOperationException($"Shop '{shop.Id}' offers the unknown item '{itemId}'.");
    }
}
