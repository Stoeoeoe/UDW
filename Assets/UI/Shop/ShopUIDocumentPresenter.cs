using Character;
using Core.Events;
using Core.Inventory;
using Core.Shops;
using UI.Shared;
using UnityEngine;
using UnityEngine.UIElements;

namespace UI.Shops
{
    [RequireComponent(typeof(UIDocument))]
    public sealed class ShopUIDocumentPresenter : ManagedUIScreen,
        IEventListener<ShopChangedEvent>,
        IEventListener<WalletChangedEvent>,
        IEventListener<InventoryChangedEvent>
    {
        [SerializeField] private VisualTreeAsset layoutAsset;
        [SerializeField] private UIDocument document;

        public static ShopUIDocumentPresenter Instance { get; private set; }

        private VisualElement _boundRoot;
        private VisualElement _root;
        private ScrollView _offerList;
        private ScrollView _inventoryList;
        private Label _title;
        private Label _balance;
        private Label _status;
        private Shop _shop;
        private Wallet _wallet;
        private SlotInventory _inventory;
        private bool _refreshPending;

        private void Awake()
        {
            if (!document) document = GetComponent<UIDocument>();
            if (layoutAsset) document.visualTreeAsset = layoutAsset;
        }

        private bool EnsureBindings()
        {
            if (!document.isActiveAndEnabled) return false;

            var root = document.rootVisualElement;
            if (root == null) return false;
            if (ReferenceEquals(root, _boundRoot)) return true;

            _boundRoot = root;
            _root = root.Q("shopOverlay");
            _offerList = _root.Q<ScrollView>("offerList");
            _inventoryList = _root.Q<ScrollView>("inventoryList");
            _title = _root.Q<Label>("shopTitle");
            _balance = _root.Q<Label>("walletBalance");
            _status = _root.Q<Label>("statusLabel");

            _root.Q<Button>("closeButton").clicked += Close;
            _root.Q("shopBackdrop").RegisterCallback<ClickEvent>(_ => Close());
            _root.RegisterCallback<KeyDownEvent>(OnKeyDown);

            _root.style.display = DisplayStyle.None;
            RebindRoot(_root);
            _refreshPending = true;
            return true;
        }

        private void OnEnable()
        {
            EnsureBindings();
            Instance = this;
            EventBus<ShopChangedEvent>.Subscribe(this);
            EventBus<WalletChangedEvent>.Subscribe(this);
            EventBus<InventoryChangedEvent>.Subscribe(this);
        }

        protected override void OnDisable()
        {
            base.OnDisable();
            EventBus<ShopChangedEvent>.Unsubscribe(this);
            EventBus<WalletChangedEvent>.Unsubscribe(this);
            EventBus<InventoryChangedEvent>.Unsubscribe(this);
            if (Instance == this) Instance = null;
        }

        public void Open(Shop shop, GameCharacter customer)
        {
            if (!EnsureBindings() || !OpenScreen(customer)) return;

            _shop = shop;
            _wallet = customer.Wallet;
            _inventory = customer.MainInventory;
            _status.text = string.Empty;
            Refresh();
        }

        public void Close() => CloseScreen();

        protected override void OnScreenClosed()
        {
            _shop = null;
            _wallet = null;
            _inventory = null;
            _refreshPending = false;
        }

        public void OnEvent(ShopChangedEvent change)
        {
            if (change.Shop == _shop) _refreshPending = true;
        }

        public void OnEvent(WalletChangedEvent change)
        {
            if (change.Wallet == _wallet) _refreshPending = true;
        }

        public void OnEvent(InventoryChangedEvent change)
        {
            if (change.InventoryRef == _inventory) _refreshPending = true;
        }

        private void LateUpdate()
        {
            if (!IsManagedOpen || !EnsureBindings()) return;
            if (_refreshPending) Refresh();
        }

        private void Refresh()
        {
            _refreshPending = false;
            _title.text = _shop.Definition.name;
            _balance.text = $"{_wallet.Balance:N0}g";
            RefreshOffers();
            RefreshInventory();
        }

        private void RefreshOffers()
        {
            _offerList.Clear();
            var offers = _shop.GetOfferings();

            if (offers.Count == 0)
                _offerList.Add(EmptyMessage("Nothing is for sale today."));

            foreach (var offer in offers)
            {
                var row = CreateRow(offer.Item, $"Stock: {offer.Quantity}");
                var button = new Button(() => Buy(offer.OfferingId))
                {
                    text = offer.Quantity > 0
                        ? $"Buy {offer.UnitPrice}g"
                        : "Sold out"
                };
                button.AddToClassList("trade-button");
                button.SetEnabled(
                    offer.Quantity > 0 && _wallet.Balance >= offer.UnitPrice);
                row.Add(button);
                _offerList.Add(row);
            }
        }

        private void RefreshInventory()
        {
            _inventoryList.Clear();
            if (!_shop.Definition.acceptsSales)
            {
                _inventoryList.Add(EmptyMessage("This shop does not buy items."));
                return;
            }

            var content = _inventory.GetSnapshot();
            var hasItems = false;

            for (var slot = 0; slot < content.Length; slot++)
            {
                var stack = content[slot];
                if (stack.IsEmpty) continue;

                hasItems = true;
                var price = _shop.GetSellPrice(stack.Item);
                var row = CreateRow(
                    stack.Item,
                    $"Slot {slot + 1} - {stack.Quantity} held - {price}g each");

                var slotIndex = slot;
                var button = new Button(() => Sell(slotIndex))
                {
                    text = price > 0 ? $"Sell {price}g" : "Can't sell"
                };
                button.AddToClassList("trade-button");
                button.SetEnabled(price > 0);
                row.Add(button);
                _inventoryList.Add(row);
            }

            if (!hasItems)
                _inventoryList.Add(EmptyMessage("Your inventory is empty."));
        }

        private static VisualElement CreateRow(ItemDefinition item, string meta)
        {
            var row = new VisualElement();
            row.AddToClassList("shop-row");
            var details = new VisualElement();
            details.AddToClassList("shop-row-details");
            var icon = new VisualElement();
            icon.AddToClassList("item-icon");
            if (item.Icon)
                icon.style.backgroundImage = new StyleBackground(item.Icon);

            var copy = new VisualElement();
            copy.AddToClassList("item-copy");
            var name = new Label(item.ItemName);
            name.AddToClassList("item-name");
            var description = new Label(meta);
            description.AddToClassList("item-meta");

            copy.Add(name);
            copy.Add(description);
            details.Add(icon);
            details.Add(copy);
            row.Add(details);
            return row;
        }

        private void Buy(string offeringId)
        {
            ShowTradeResult(_shop.Buy(offeringId, _wallet, _inventory));
        }

        private void Sell(int slotIndex)
        {
            ShowTradeResult(_shop.Sell(slotIndex, _wallet, _inventory));
        }

        private void ShowTradeResult(ShopTradeResult result)
        {
            PlayUISound(result == ShopTradeResult.Success
                ? UISoundCue.Click
                : UISoundCue.Denied);
            _status.text = FormatResult(result);
            _refreshPending = true;
        }

        private void OnKeyDown(KeyDownEvent evt)
        {
            if (evt.keyCode != KeyCode.Escape) return;
            Close();
            evt.StopPropagation();
        }

        private static string FormatResult(ShopTradeResult result) => result switch
        {
            ShopTradeResult.Success => "Trade complete.",
            ShopTradeResult.InsufficientFunds => "You don't have enough money.",
            ShopTradeResult.InventoryFull => "There's no room in your inventory.",
            ShopTradeResult.OutOfStock => "That item is out of stock.",
            ShopTradeResult.WalletFull => "Your wallet is full.",
            ShopTradeResult.InvalidPrice => "This item has an invalid price.",
            ShopTradeResult.NotAccepted => "The shop won't accept that item.",
            ShopTradeResult.InvalidQuantity => "Choose a valid quantity.",
            _ => "That item is unavailable."
        };

        private static Label EmptyMessage(string text)
        {
            var label = new Label(text);
            label.AddToClassList("empty-list");
            return label;
        }
    }
}