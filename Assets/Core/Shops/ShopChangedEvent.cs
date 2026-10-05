using Core.Events;

namespace Core.Shops
{
    public struct ShopChangedEvent
    {
        public Shop Shop;
        public static void Trigger(Shop shop) => EventBus<ShopChangedEvent>.Raise(new ShopChangedEvent { Shop = shop });
    }
}
