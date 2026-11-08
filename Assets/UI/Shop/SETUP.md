# Shop UI Toolkit screen

The shop screen uses `ShopUIDocumentPresenter` to display a shop's offerings and the player's inventory. It calls `ShopService.Buy` and `ShopService.Sell`, so wallet and inventory rules remain owned by the shop system.

## Setup

1. Add a `UIDocument` and `ShopUIDocumentPresenter` to the persistent Systems UI object. Assign a Panel Settings asset and `ShopScreen.uxml` to the component's **Layout Asset** field. The default `SystemRoot` already has `UrGUIManager` on its root object.
2. Open it from the world with `ShowShopInteractable` (set its **Shop Id**) or from Lua with `Shop.Open('<shop id>')`, as described in [the shop setup](../../Core/Shops/README.md).

The screen's **Pause While Open** defaults to **Character And Clock**. `UrGUIManager` owns the customer's control pause and the in-game clock pause; each remains until its last requesting screen closes. Select **None**, **Character**, or **Game Clock** to change this policy. The close button, Escape key, disabling the presenter, or leaving the location releases the screen's requests. See [screen pause setup](../Shared/README.md). The screen currently buys or sells one item per click; quantity selection and item-specific detail views are intentionally omitted.
