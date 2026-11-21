# Shops

A shop is a static definition authored in Vulcanus (`*.shop.json`, in the project's `shops` folder). It has a namespaced ID (for example `base:market_seeds`), a display name, whether it buys goods, and a fixed list of offerings. Each offering is an item ID and a price. Everything is always in stock at its fixed price.

The importer turns each file into a `Shop` asset. The shared `DefinitionCatalog` indexes them by ID, and validation fails the refresh when an offering names an item that does not exist. Mods add shops by adding `.shop.json` files.

`ShopService` resolves shops and runs trades:

- `GetOfferings(shop)` returns the offerings with their items resolved, in authored order.
- `Buy(shop, itemId, wallet, inventory, quantity)` and `Sell(shop, slotIndex, wallet, inventory, quantity)` return a `ShopTradeResult`. A failed trade leaves money and items unchanged.
- Selling needs `buysGoods` and an item with a positive sell price, and pays that sell price. Items are bought from the shop at the offering's price, not the item's `Buy Base Price`.
- Successful trades raise `ShopPurchaseEvent` or `ShopSaleEvent` with before and after balances, for UI and other listeners.

Static shops have no saved state, restocking or limited stock. Rules, seasons and restocking are tracked separately.

## Opening a shop

A shop is opened by its shop ID, so no scene object has to hold it:

- From a dialogue or other Lua: `Shop.Open('base:market_seeds')`.
- From the world: `ShowShopInteractable` on an object, with its **Shop Id** set. The market stall entities expose it as a `shopId` property, so each placed stall can open a different shop.

The screen is `ShopUIDocumentPresenter` in `SystemRoot`; see [the shop UI setup](../../UI/Shop/SETUP.md).
