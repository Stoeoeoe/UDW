using System.Collections.Generic;
using Core.Inventory;

namespace Core.Shops
{
    /// <summary>Snapshot of one processed offering, including availability-only changes for Never stock.</summary>
    public struct ShopRestockEntry
    {
        public string OfferingId;
        public ItemDefinition Item;
        public int QuantityBefore;
        public int QuantityAfter;
        public bool AvailableBefore;
        public bool AvailableAfter;
        public bool IsInitialStock;
        public bool Restocked;
    }

    /// <summary>Published once after a daily refresh or initial stocking. Reopening on the same day emits nothing.</summary>
    public struct ShopRestockedEvent
    {
        public Shop Shop;
        public int Day;
        public IReadOnlyList<ShopRestockEntry> Entries;
    }
}
