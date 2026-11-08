using Character;
using Core.Inventory;

namespace Core.Shops
{
    /// <summary>A successful purchase by the customer from the shop. Numeric values are transaction snapshots.</summary>
    public struct ShopPurchaseEvent
    {
        public Shop Shop;
        public GameCharacter Buyer;
        public Wallet Wallet;
        public SlotInventory Inventory;
        public ItemDefinition Item;
        public int Quantity;
        public int UnitPrice;
        public int TotalPrice;
        public int BalanceBefore;
        public int BalanceAfter;
        public long GameMinute;
    }
}
