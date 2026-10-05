using Character;
using Core.Inventory;

namespace Core.Shops
{
    /// <summary>A successful sale by the customer to the shop. Numeric values are transaction snapshots.</summary>
    public struct ShopSaleEvent
    {
        public Shop Shop;
        public GameCharacter Seller;
        public Wallet Wallet;
        public SlotInventory Inventory;
        public int SlotIndex;
        public ItemDefinition Item;
        public int Quantity;
        public int UnitPrice;
        public int TotalPrice;
        public int BalanceBefore;
        public int BalanceAfter;
        public int SlotQuantityBefore;
        public int SlotQuantityAfter;
        public long GameMinute;
    }
}
