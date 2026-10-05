# Shops

Create a **Game > Shop Definition** asset. Its ordered offerings specify an item, permanent offering ID, Daily/Never restocking, daily appearance chance, inclusive min/max stock, and a buy-price multiplier. Never reuse an ID for a different offering. Price multipliers are factors (0.8 = 20% discount, 1.2 = 20% markup), not additive percentages.

Add `Shop` to a vendor or independent shop object, assign the definition, and author a unique permanent shop ID (for example `base:market_grocer`). Different vendors may share a definition, but must not share an ID unless they deliberately share inventory. This ID is separate from an interactable ID.

`GetOfferings()` returns visible rows in authored order, including sold-out rows. `Buy(offeringId, wallet, inventory, quantity)` and `Sell(slotIndex, wallet, inventory, quantity)` return `ShopTradeResult`. Prices use the item's `BuyBasePrice`/`SellBasePrice`, rounded per unit with midpoint away from zero. Sales use the definition's sell multiplier, require a positive sell price, and do not create buyback entries. Vendors have no finite money pool in this version.

Stock and availability persist as `ShopState` in `GameState.World`, keyed by shop ID and offering ID. Appearance is rolled once per day. Daily restocking replaces remaining stock; Never rolls its initial quantity only once, even when initially hidden. Its appearance can still change each day. Opening/reloading on the same day never rerolls. An enabled shop handles `NewDayEvent`; unloaded shops process the current day on access. Intermediate skipped days are not replayed because daily stock is replacement, not accumulation. Removed definition entries keep their saved data but are not displayed.

Transactions prepare inventory changes and check all constraints first, commit stock/money/items without notifications, then raise wallet, inventory, and `ShopChangedEvent` notifications. Failed trades leave money/items/stock unchanged (daily catch-up can still happen before a buy).

Successful trades also raise `ShopPurchaseEvent` (customer buys from vendor) or `ShopSaleEvent` (customer sells to vendor). They include the shop, customer when the wallet has an owner, wallet, inventory, item, quantity, final unit/total price, game minute, before/after balances, and offering stock or source-slot quantities. Values are captured before notifying listeners, so later trades cannot change the event's numeric history. Failed trades emit neither event; the UI can use the returned `ShopTradeResult` for denial sounds.

`ShopRestockedEvent` includes the processed day and a read-only list of offering snapshots (item/ID, before/after quantities and availability, initial-stock and restocked flags). Never entries can have `Restocked == false` while their daily appearance is rerolled. Initial stocking emits this event too; UI can inspect `IsInitialStock` to avoid playing a restock sound on the first opening. Same-day reopening emits nothing. Keep sounds/presentation in UI listeners; `ShopChangedEvent` remains the generic listing-refresh notification.

Lua conditions, opening UI/dialogue, buyback, inventory persistence, and NPC scheduling are not implemented. Shop stock and player money persist; player inventory still does not, so a complete trading save/load loop needs inventory persistence next.
