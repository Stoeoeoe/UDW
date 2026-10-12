using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Events;
using Core.Context;
using Core.Equipment;
using Core.Inventory;
using Core.Items;
using Items;
using UI.Shared;
using UnityEngine;
using UnityEngine.UIElements;
using UnityEngine.InputSystem;
using PlayerInputManager = Input.InputManager;

namespace UI.InventoryScreen
{
    [RequireComponent(typeof(UIDocument))]
    public sealed class UrInventoryUIDocumentPresenter : InventoryScreenView, IEventListener<WalletChangedEvent>
    {
        [SerializeField] private UIDocument document;
        [SerializeField] private VisualTreeAsset layoutAsset;
        private VisualElement _overlay, _grid, _heldCursor, _heldIcon, _boundRoot, _context, _equipment;
        private Label _heldQuantity, _selectionLabel, _description, _capacity, _money;
        private Button _useButton, _dropButton, _beltButton;
        [SerializeField] private MenuPageDefinition[] menuPages =
        {
            new() { Id = "world", Title = "World", Placeholder = "The world map is not available yet." },
            new() { Id = "journal", Title = "Journal", Placeholder = "Your journal is not available yet." },
            new() { Id = "skills", Title = "Skills", Placeholder = "Your skills are not available yet." },
            new() { Id = "relationships", Title = "Relationships", Placeholder = "Relationships are not available yet." },
            new() { Id = "settings", Title = "Settings", Placeholder = "Settings are not available yet." }
        };
        public TabbedMenuShell Menu { get; private set; }
        public event System.Action<TabbedMenuShell> MenuBound;
        private readonly List<VisualElement> _cells = new();
        private int _dragSource = -1, _pointer = -1;
        private Vector2 _dragStart;
        private bool _dragging;
        private string _equipmentSlotId;
        private bool? _compactBag;

        private void Awake()
        {
            document = document ? document : GetComponent<UIDocument>();
            if (layoutAsset && document.visualTreeAsset != layoutAsset) document.visualTreeAsset = layoutAsset;
        }
        protected override void OnEnable() { EnsureBindings(); base.OnEnable(); this.Subscribe<WalletChangedEvent>(); }
        protected override void OnDisable() { this.Unsubscribe<WalletChangedEvent>(); base.OnDisable(); }
        public void OnEvent(WalletChangedEvent e) { if (e.Wallet == MainCharacter.CurrentMainCharacter?.Wallet) RequestRefresh(); }
        private void Update()
        {
            if (PlayerInputManager.Instance && PlayerInputManager.Instance.OpenInventoryPressed &&
                (!UrGUIManager.HasOpenScreens || ReceivesInput)) ToggleInventory();
        }
        private bool EnsureBindings()
        {
            if (!document || !document.isActiveAndEnabled) return false;
            var root = document.rootVisualElement;
            if (root == null) return false;
            if (ReferenceEquals(root, _boundRoot)) return _overlay != null;
            var selectedPage = Menu?.SelectedPageId;
            CancelPointer(); Menu?.Dispose(); _boundRoot = root; _cells.Clear();
            Menu = new TabbedMenuShell(root, () => ReceivesInput, PreparePageChange,
                () => { PlayUISound(UISoundCue.Click); RefreshAllSlots(); }, CloseInventory);
            Menu.RegisterPage("bag", "Bag", root.Q("bagPage"));
            Menu.RegisterPage("equipment", "Equipment", root.Q("equipmentPage"));
            if (menuPages != null) foreach (var page in menuPages) if (page != null) Menu.RegisterPage(page);
            _overlay = Menu.Overlay; _grid = root.Q("slotGrid");
            _heldCursor = root.Q("heldCursor"); _heldIcon = root.Q("heldIcon");
            _heldQuantity = root.Q<Label>("heldQuantity"); _selectionLabel = root.Q<Label>("selectionLabel");
            _description = root.Q<Label>("itemDescription"); _capacity = root.Q<Label>("capacityLabel");
            _money = root.Q<Label>("moneyLabel"); _context = root.Q("contextMenu"); _equipment = root.Q("equipmentSlots");
            _overlay.Add(_heldCursor);
            _useButton = root.Q<Button>("useButton"); _dropButton = root.Q<Button>("discardButton");
            _beltButton = root.Q<Button>("beltButton");
            _beltButton.clicked += ShowToolbeltChoices;
            _compactBag = null;
            root.Q("bagBody").RegisterCallback<GeometryChangedEvent>(evt =>
            {
                var compact = evt.newRect.width < 620;
                if (_compactBag == compact) return;
                _compactBag = compact;
                root.Q("bagBody").style.flexDirection = compact ? FlexDirection.Column : FlexDirection.Row;
                var items = root.Q(className: "bag-items");
                items.style.width = Length.Percent(compact ? 100 : 62);
                items.style.paddingRight = compact ? 0 : 20;
                var details = root.Q(className: "inventory-item-details");
                details.style.paddingLeft = compact ? 0 : 20;
                details.style.borderLeftWidth = compact ? 0 : 1;
                details.style.marginTop = compact ? 12 : 0;
            });
            if (_overlay == null || _grid == null || _useButton == null || _context == null)
            { Debug.LogError("InventoryScreen.uxml is incomplete.", this); return false; }
            _overlay.style.display = DisplayStyle.None; _context.style.display = DisplayStyle.None; _heldCursor.style.display = DisplayStyle.None;
            _useButton.clicked += OnUseButtonClicked; _dropButton.clicked += OnDestroyButtonClicked;
            root.Q<Button>("splitButton").clicked += ShowSplitPrompt;
            root.Q<Button>("unequipButton").clicked += () =>
            {
                if (!ReceivesInput || IsHoldingItem) return;
                var slot = TargetInventory.Configuration?.EquipmentSlots.FirstOrDefault(s => s.Id == _equipmentSlotId);
                var success = slot && TargetInventory.Actions.TryUnequip(slot); Feedback(success);
                _boundRoot.Q<Label>("equipmentStatus").text = success ? "Returned to your bag." : "Make room in your bag first.";
            };
            root.Q<Button>("sortButton").clicked += () => { if (ReceivesInput && !IsHoldingItem) { TargetInventory.SortStorage(); Feedback(true); } };
            _overlay.RegisterCallback<KeyDownEvent>(OnKeyDown);
            _overlay.RegisterCallback<NavigationCancelEvent>(evt => { if (ReceivesInput) { CancelInteraction(); evt.StopPropagation(); } });
            _overlay.RegisterCallback<PointerMoveEvent>(OnPointerMove);
            _overlay.RegisterCallback<PointerUpEvent>(OnPointerUp);
            _overlay.RegisterCallback<PointerCaptureOutEvent>(_ => { _pointer = -1; _dragSource = -1; _dragging = false; });
            MenuBound?.Invoke(Menu);
            if (!Menu.SelectPage(selectedPage, false)) Menu.SelectPage("bag", false);
            RebindRoot(_overlay);
            if (IsManagedOpen) Menu.NotifyOpened();
            return true;
        }
        private bool PreparePageChange()
        {
            CancelPointer(); HideContext();
            // Finish carrying before hiding its source; a failed return stays visible on the bag page.
            if (IsHoldingItem && !TargetInventory.Interaction.TryReturnHeld()) { Feedback(false); return false; }
            return true;
        }
        public override void OpenInventory()
        {
            if (!EnsureBindings()) return;
            if (!OpenScreen()) return;
            Menu.SelectPage("bag", false);
            Menu.NotifyOpened();
            _boundRoot.Q<Label>("equipmentStatus").text = string.Empty;
            RefreshAllSlots(); _overlay.Focus();
        }
        public override void CloseInventory() => CloseScreen();
        public override void SelectSlot(int index)
        {
            HideContext(); base.SelectSlot(index);
            if (_compactBag == true)
                _selectionLabel.schedule.Execute(() =>
                {
                    if (IsManagedOpen && Menu.SelectedPageId == "bag" && _compactBag == true)
                        _selectionLabel.GetFirstAncestorOfType<ScrollView>()?.ScrollTo(_boundRoot.Q(className: "inventory-item-details"));
                });
        }
        protected override void OnScreenClosed()
        {
            Menu?.NotifyClosed();
            CancelPointer(); TargetInventory?.Interaction.TryReturnHeld();
            HideContext();
            base.OnScreenClosed();
        }
        public override void RefreshAllSlots()
        {
            ClearRefreshRequest();
            if (!EnsureBindings() || !TargetInventory || !TargetInventory.IsInitialized) return;
            var content = TargetInventory.GetSnapshot();
            if (_cells.Count != content.Length)
            {
                _cells.Clear(); _grid.Clear(); VisualElement row = null;
                for (var i = 0; i < content.Length; i++)
                {
                    if (i % DisplayColumns == 0)
                    {
                        row = new VisualElement(); row.AddToClassList("inventory-row");
                        _grid.Add(row);
                    }
                    var index = i;
                    var cell = new VisualElement { name = $"slot{i}", focusable = true, userData = i };
                    cell.AddToClassList("inventory-slot"); cell.style.width = Length.Percent(100f / DisplayColumns - 1f);
                    cell.RegisterCallback<GeometryChangedEvent>(evt =>
                    {
                        if (evt.newRect.width > 0 && Mathf.Abs(evt.newRect.height - evt.newRect.width) > 0.5f)
                            cell.style.height = evt.newRect.width;
                    });
                    cell.RegisterCallback<PointerDownEvent>(evt => OnSlotPointerDown(index, evt));
                    cell.RegisterCallback<KeyDownEvent>(evt => OnSlotKey(index, evt));
                    cell.RegisterCallback<NavigationSubmitEvent>(evt => { if (ReceivesInput) { SelectSlot(index); evt.StopPropagation(); } });
                    row.Add(cell); _cells.Add(cell);
                }
            }
            for (var i = 0; i < content.Length; i++)
            {
                var cell = _cells[i]; var stack = content[i]; cell.Clear();
                cell.EnableInClassList("inventory-slot-selected", i == _selectedSlotIndex);
                var inHand = stack.Item && TargetInventory.Loadout.ActiveHandInventoryIndex == i;
                cell.EnableInClassList("inventory-slot-active", inHand);
                cell.EnableInClassList("inventory-slot-empty", !stack.IsOccupied);
                cell.tooltip = stack.IsOccupied ? stack.Item.ItemName : "Empty slot";
                if (stack.IsOccupied)
                {
                    var icon = new VisualElement { pickingMode = PickingMode.Ignore }; icon.AddToClassList("inventory-icon");
                    if (stack.Item.Icon) icon.style.backgroundImage = new StyleBackground(stack.Item.Icon);
                    cell.Add(icon);
                    if (stack.Quantity > 1) AddLabel(cell, stack.Quantity.ToString(), "inventory-quantity");
                }
                if (inHand)
                    AddLabel(cell, TargetInventory.Loadout.ActiveHandItem ? "In hand" : "Empty hand", "inventory-hand-marker");
            }
            _capacity.text = $"Bag ? {content.Length} slots";
            var wallet = MainCharacter.CurrentMainCharacter?.Wallet;
            _money.text = wallet != null ? $"Money: {wallet.Balance}" : string.Empty;
            var sort = _boundRoot.Q<Button>("sortButton");
            sort.style.display = DisplayStyle.Flex;
            sort.SetEnabled(!IsHoldingItem);
            RefreshEquipment(); UpdateActionButtons(); RefreshHeldCursor();
        }
        private static void AddLabel(VisualElement parent, string text, string css)
        { var label = new Label(text) { pickingMode = PickingMode.Ignore }; label.AddToClassList(css); parent.Add(label); }
        private void OnSlotPointerDown(int index, PointerDownEvent evt)
        {
            if (!ReceivesInput) return;
            if (evt.button == 1) { SelectSlot(index); _useButton.Focus(); }
            else if (evt.button == 0)
            {
                HideContext();
                if (IsHoldingItem) Feedback(TargetInventory.Interaction.TryPlaceHeld(index));
                else { SelectSlot(index); _dragSource = index; _dragStart = evt.position; _pointer = evt.pointerId; _overlay.CapturePointer(_pointer); }
            }
            else return;
            evt.StopPropagation();
        }
        private void OnPointerMove(PointerMoveEvent evt)
        {
            if (!ReceivesInput) return;
            if (_dragSource >= 0 && !_dragging && Vector2.Distance(_dragStart, evt.position) > 6)
            {
                var stack = TargetInventory.GetSlot(_dragSource);
                _dragging = stack.IsOccupied && TargetInventory.Interaction.TryPickUp(_dragSource, stack.Quantity);
                if (!_dragging) _dragSource = -1;
            }
            PositionHeldCursor(evt.position); if (_dragging) evt.StopPropagation();
        }
        private void OnPointerUp(PointerUpEvent evt)
        {
            if (_pointer != evt.pointerId) return;
            if (_dragging && ReceivesInput)
            {
                var picked = _overlay.panel.Pick(evt.position);
                while (picked != null && picked.userData is not int && picked.userData is not EquipmentSlotDefinition) picked = picked.parent;
                if (picked?.userData is int index) Feedback(TargetInventory.Interaction.TryPlaceHeld(index));
                else if (picked?.userData is EquipmentSlotDefinition slot) Feedback(TargetInventory.Actions.TryEquipHeld(slot));
                TargetInventory.Interaction.TryReturnHeld();
            }
            CancelPointer(); evt.StopPropagation();
        }
        private void CancelPointer()
        {
            if (_pointer >= 0 && _overlay != null && _overlay.HasPointerCapture(_pointer)) _overlay.ReleasePointer(_pointer);
            _pointer = -1; _dragSource = -1; _dragging = false;
        }
        private void OnSlotKey(int index, KeyDownEvent evt)
        {
            if (!ReceivesInput) return;
            if (evt.keyCode == KeyCode.Return) SelectSlot(index);
            else if (evt.keyCode == KeyCode.Space)
            {
                var stack = TargetInventory.GetSlot(index);
                Feedback(IsHoldingItem ? TargetInventory.Interaction.TryPlaceHeld(index) :
                    stack.IsOccupied && TargetInventory.Interaction.TryPickUp(index, stack.Quantity));
            }
            else if (evt.keyCode == KeyCode.Menu) { SelectSlot(index); _useButton.Focus(); }
            else
            {
                var next = evt.keyCode switch { KeyCode.LeftArrow => index - 1, KeyCode.RightArrow => index + 1,
                    KeyCode.UpArrow => index - DisplayColumns, KeyCode.DownArrow => index + DisplayColumns, _ => -1 };
                if (next < 0 || next >= _cells.Count) return; _cells[next].Focus();
            }
            evt.StopPropagation();
        }
        private ItemStack Selected => TargetInventory && _selectedSlotIndex >= 0 && _selectedSlotIndex < TargetInventory.Capacity ? TargetInventory.GetSlot(_selectedSlotIndex) : ItemStack.Empty;
        private int DisplayColumns => Mathf.Min(TargetInventory.Columns, 5);
        private void UpdateActionButtons()
        {
            if (_useButton == null || !TargetInventory) return;
            var stack = Selected;
            var handItem = stack.Item is EquippableItem;
            var wearable = stack.Item is WornEquipmentItem;
            var food = stack.Item is ConsumableItem;
            var inHand = handItem && _selectedSlotIndex == TargetInventory.Loadout.ActiveHandInventoryIndex && !IsHoldingItem;
            _useButton.text = wearable ? "Wear" : food ? "Eat" : stack.Item is Plants.SeedItem ? "Plant…" : inHand ? "In hand" : "Use";
            _useButton.style.display = !inHand && (handItem || wearable || food) ? DisplayStyle.Flex : DisplayStyle.None;
            _useButton.SetEnabled(!IsHoldingItem && !inHand && (handItem || wearable ||
                stack.Item is ConsumableItem consumable && consumable.CanConsume(MainCharacter.CurrentMainCharacter)));
            _beltButton.style.display = stack.Item is Interaction.Tools.ToolData ? DisplayStyle.Flex : DisplayStyle.None;
            _beltButton.SetEnabled(!IsHoldingItem);
            _dropButton.style.display = stack.Item && !stack.Item.PreventDropping ? DisplayStyle.Flex : DisplayStyle.None;
            _dropButton.SetEnabled(stack.Item && !stack.Item.PreventDropping && !IsHoldingItem);
            var split = _boundRoot.Q<Button>("splitButton");
            split.style.display = stack.Item && stack.Quantity > 1 ? DisplayStyle.Flex : DisplayStyle.None;
            split.SetEnabled(!IsHoldingItem);
            _boundRoot.Q(className: "item-secondary-actions").style.display =
                split.style.display.value == DisplayStyle.Flex || _dropButton.style.display.value == DisplayStyle.Flex || _beltButton.style.display.value == DisplayStyle.Flex ? DisplayStyle.Flex : DisplayStyle.None;
            _selectionLabel.text = stack.IsOccupied ? stack.Item.ItemName : "Your bag";
            _description.text = stack.Item ? stack.Item.Description : stack.IsOccupied
                ? "This item is unavailable. Its place in your bag is preserved." : "Choose an item to see what you can do with it.";
            if (stack.Item is StaminaConsumableItem meal) _description.text += $"\nRestores {meal.StaminaRestored} stamina.";
            _description.style.display = string.IsNullOrWhiteSpace(_description.text) ? DisplayStyle.None : DisplayStyle.Flex;
            var icon = _boundRoot.Q("selectedIcon");
            icon.style.backgroundImage = stack.Item && stack.Item.Icon ? new StyleBackground(stack.Item.Icon) : new StyleBackground();
            icon.style.visibility = stack.Item && stack.Item.Icon ? Visibility.Visible : Visibility.Hidden;
            var state = stack.Item && stack.Item.PreventDropping ? "Essential item · stays with you" :
                stack.Quantity > 1 ? $"{stack.Quantity} in this stack" : string.Empty;
            if (inHand) state = string.IsNullOrEmpty(state) ? "In hand" : $"In hand · {state}";
            var stateLabel = _boundRoot.Q<Label>("itemState"); stateLabel.text = state;
            stateLabel.style.display = string.IsNullOrEmpty(state) ? DisplayStyle.None : DisplayStyle.Flex;
            if (_context.style.display.value == DisplayStyle.Flex || _boundRoot.Q("quickChoices").style.display.value == DisplayStyle.Flex)
                PresentPrompt();
        }
        private void OnUseButtonClicked()
        {
            if (!ReceivesInput || IsHoldingItem || !_useButton.enabledSelf) return;
            if (Selected.Item is ConsumableItem) { HideContext(); Feedback(TargetInventory.Actions.TryConsume(_selectedSlotIndex, MainCharacter.CurrentMainCharacter)); return; }
            if (Selected.Item is WornEquipmentItem wearable)
            {
                _equipmentSlotId = wearable.AllowedSlots.FirstOrDefault()?.Id;
                Menu.SelectPage("equipment"); return;
            }
            if (Selected.Item is not EquippableItem) return;
            HideContext();
            var success = TargetInventory.Loadout.SelectItem(_selectedSlotIndex);
            Feedback(success);
            if (success && Selected.Item is Plants.SeedItem) CloseInventory();
        }
        private void ShowToolbeltChoices()
        {
            if (!ReceivesInput || IsHoldingItem || Selected.Item is not Interaction.Tools.ToolData) return;
            HideContext();
            var choices = _boundRoot.Q("quickChoices"); choices.style.display = DisplayStyle.Flex;
            PresentPrompt();
            AddLabel(choices, "Assign a toolbelt shortcut", "inventory-hint");
            var grid = new VisualElement(); grid.AddToClassList("quick-choice-grid"); choices.Add(grid);
            for (var i = 0; i < TargetInventory.Loadout.ToolbeltSize; i++)
            {
                var destination = i; var source = _selectedSlotIndex;
                var tool = TargetInventory.Loadout.GetToolbeltTool(i);
                var button = new Button(() =>
                {
                    if (!ReceivesInput || IsHoldingItem || source != _selectedSlotIndex) return;
                    var success = TargetInventory.Loadout.AssignToolbeltSlot(source, destination);
                    HideContext(); Feedback(success);
                }) { text = $"{i + 1}: {(tool ? tool.ItemName : "Empty")}", name = $"quickChoice{i}" };
                var cell = new VisualElement(); cell.AddToClassList("toolbelt-choice");
                grid.Add(cell); button.AddToClassList("quick-choice"); cell.Add(button);
                var clear = new Button(() =>
                {
                    if (!ReceivesInput || IsHoldingItem) return;
                    HideContext(); Feedback(TargetInventory.Loadout.AssignToolbeltSlot(-1, destination));
                }) { text = $"Clear {i + 1}", name = $"clearBelt{i}" };
                clear.AddToClassList("quiet-action"); cell.Add(clear);
            }
        }
        private void OnDestroyButtonClicked()
        {
            if (!ReceivesInput || !Selected.Item || Selected.Item.PreventDropping || IsHoldingItem || !_dropButton.enabledSelf) return;
            var index = _selectedSlotIndex; var stack = Selected;
            HideContext(); _context.style.display = DisplayStyle.Flex;
            PresentPrompt();
            AddLabel(_context, $"Leave {stack.Quantity} × {stack.Item.ItemName} on the ground?", "inventory-description");
            AddPromptButton("Leave on ground", () =>
            {
                var current = Selected;
                if (index != _selectedSlotIndex || current.Item != stack.Item || current.Quantity != stack.Quantity) { HideContext(); return; }
                var character = MainCharacter.CurrentMainCharacter;
                HideContext(); Feedback(ItemManager.Instance.TryDrop(TargetInventory, index, character.transform.position));
            }, "confirmDropButton");
            AddPromptButton("Keep in bag", HideContext, "cancelPromptButton").Focus();
        }
        private void ShowSplitPrompt()
        {
            if (!ReceivesInput || !Selected.Item || Selected.Quantity <= 1 || IsHoldingItem) return;
            var index = _selectedSlotIndex;
            HideContext(); _context.style.display = DisplayStyle.Flex;
            PresentPrompt();
            var quantity = new IntegerField("Take from stack") { value = Mathf.Max(1, Selected.Quantity / 2) };
            _context.Add(quantity);
            AddPromptButton("Pick up", () =>
            {
                if (index != _selectedSlotIndex) return;
                var amount = Mathf.Clamp(quantity.value, 1, Selected.Quantity - 1);
                HideContext(); Feedback(TargetInventory.Interaction.TryPickUp(index, amount));
            }, "confirmSplitButton");
            AddPromptButton("Cancel", HideContext, "cancelPromptButton"); quantity.Focus();
        }
        private Button AddPromptButton(string label, System.Action action, string name)
        {
            var button = new Button(() => { if (ReceivesInput && !IsHoldingItem) action(); }) { text = label, name = name };
            button.AddToClassList("quiet-action"); _context.Add(button); return button;
        }
        private void HideContext()
        {
            if (_context != null) { _context.Clear(); _context.style.display = DisplayStyle.None; }
            var choices = _boundRoot?.Q("quickChoices");
            if (choices != null) { choices.Clear(); choices.style.display = DisplayStyle.None; }
            UpdateActionButtons();
        }
        private void PresentPrompt()
        {
            _description.style.display = DisplayStyle.None;
            _boundRoot.Q("itemState").style.display = DisplayStyle.None;
            _useButton.style.display = DisplayStyle.None;
            _boundRoot.Q(className: "item-secondary-actions").style.display = DisplayStyle.None;
        }
        private void RefreshEquipment()
        {
            _equipment.Clear(); var config = TargetInventory.Configuration;
            var choices = _boundRoot.Q("equipmentChoices"); choices.Clear();
            var title = _boundRoot.Q<Label>("equipmentChoiceTitle");
            var remove = _boundRoot.Q<Button>("unequipButton"); remove.style.display = DisplayStyle.None;
            if (!config) { title.text = "No equipment is available yet."; return; }
            var selected = config.EquipmentSlots.FirstOrDefault(s => s.Id == _equipmentSlotId);
            foreach (var definition in config.EquipmentSlots)
            {
                var equipped = TargetInventory.Loadout.GetEquipment(definition.Id);
                var button = new Button(() =>
                {
                    if (!ReceivesInput || IsHoldingItem) return;
                    _boundRoot.Q<Label>("equipmentStatus").text = string.Empty;
                    _equipmentSlotId = definition.Id; PlayUISound(UISoundCue.Click); RefreshEquipment();
                    _equipment.Q<Button>($"equipmentSlot_{definition.Id}")?.Focus();
                }) { name = $"equipmentSlot_{definition.Id}", userData = definition };
                button.AddToClassList("equipment-slot");
                button.EnableInClassList("equipment-slot-selected", definition == selected);
                AddLabel(button, definition.Label, "inventory-kicker");
                var icon = new VisualElement { pickingMode = PickingMode.Ignore }; icon.AddToClassList("equipment-icon");
                var sprite = equipped.Item && equipped.Item.Icon ? equipped.Item.Icon : definition.Icon;
                if (sprite) icon.style.backgroundImage = new StyleBackground(sprite);
                else icon.style.display = DisplayStyle.None;
                button.Add(icon);
                AddLabel(button, equipped.IsOccupied ? equipped.Item.ItemName : "Nothing worn", "inventory-hint");
                _equipment.Add(button);
            }
            title.text = selected ? $"For your {selected.Label.ToLowerInvariant()}" : "Choose a worn slot";
            if (!selected) return;
            var worn = TargetInventory.Loadout.GetEquipment(selected.Id);
            remove.style.display = worn.Item ? DisplayStyle.Flex : DisplayStyle.None;
            remove.SetEnabled(!IsHoldingItem);
            var content = TargetInventory.GetSnapshot();
            for (var i = 0; i < content.Length; i++)
            {
                if (content[i].Item is not WornEquipmentItem item || !item.Fits(selected)) continue;
                var index = i;
                var button = new Button(() =>
                {
                    if (!ReceivesInput || IsHoldingItem) return;
                    var success = TargetInventory.Actions.TryEquip(index, selected); Feedback(success);
                    _boundRoot.Q<Label>("equipmentStatus").text = success ? $"Now wearing {item.ItemName}." : "Make room in your bag before changing equipment.";
                }) { text = $"Wear {item.ItemName}", name = $"wearItem{i}" };
                button.AddToClassList("equipment-choice"); button.SetEnabled(!IsHoldingItem); choices.Add(button);
            }
            if (choices.childCount == 0) AddLabel(choices, "No matching items in your bag.", "inventory-description");
        }
        private void Feedback(bool success) { PlayUISound(success ? UISoundCue.Click : UISoundCue.Denied); RequestRefresh(); }
        private void RefreshHeldCursor()
        {
            var held = _heldStack; _heldCursor.style.display = held.IsOccupied ? DisplayStyle.Flex : DisplayStyle.None;
            _heldIcon.style.backgroundImage = held.Item && held.Item.Icon ? new StyleBackground(held.Item.Icon) : new StyleBackground();
            _heldQuantity.text = held.Quantity > 1 ? held.Quantity.ToString() : string.Empty;
        }
        private void PositionHeldCursor(Vector2 position)
        { if (_heldCursor != null) { var local = _overlay.WorldToLocal(position); _heldCursor.style.translate = new Translate(local.x + 16, local.y + 16); } }
        private void OnKeyDown(KeyDownEvent evt)
        {
            if (!ReceivesInput || evt.keyCode != KeyCode.Escape) return;
            CancelInteraction(); evt.StopPropagation();
        }
        private void CancelInteraction()
        {
            if (_context.style.display.value != DisplayStyle.None || _boundRoot.Q("quickChoices").style.display.value == DisplayStyle.Flex) HideContext();
            else if (IsHoldingItem) { CancelPointer(); Feedback(TargetInventory.Interaction.TryReturnHeld()); }
            else CloseInventory();
        }
    }
}
