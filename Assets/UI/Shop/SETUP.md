# Shop UI Toolkit screen

The shop screen uses `ShopUIDocumentPresenter` to display a vendor's available stock and the player's inventory. It calls `Shop.Buy` and `Shop.Sell`, so wallet, stock and inventory rules remain owned by the shop system.

## Setup

1. Add a `UIDocument` and `ShopUIDocumentPresenter` to the persistent Systems UI object. Assign a Panel Settings asset and `ShopScreen.uxml` to the component's **Layout Asset** field. The default `SystemRoot` already has `UrGUIManager` on its root object.
2. Add `ShowShopInteractable` to the vendor object beside its `Shop` component and interaction collider. Assign the `Shop` reference if it is not on that same object.
3. Configure the shop definition and permanent shop ID as described in [the shop setup](../../Core/Shops/README.md).

The screen's **Pause While Open** defaults to **Character And Clock**. `UrGUIManager` owns the customer's control pause and the in-game clock pause; each remains until its last requesting screen closes. Select **None**, **Character**, or **Game Clock** to change this policy. The close button, Escape key, disabling the presenter, or leaving the location releases the screen's requests. See [screen pause setup](../Shared/README.md). The screen currently buys or sells one item per click; quantity selection and item-specific detail views are intentionally omitted.
