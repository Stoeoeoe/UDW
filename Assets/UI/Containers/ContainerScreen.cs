using Core.Catalogs;
using System;
using Character;
using Core.Events;
using Core.Inventory;
using UI.Shared;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;

namespace UI.Containers
{
    [RequireComponent(typeof(UIDocument))]
    public sealed class ContainerScreen : ManagedUIScreen, IEventListener<InventoryChangedEvent>
    {
        [Inject] private DefinitionCatalog _characterCatalog;

        [SerializeField] private UIDocument document;
        private VisualElement _root, _bagGrid, _containerGrid;
        private Label _title, _owner, _message;
        private PersistentContainer _container;
        private GameCharacter _character;
        private bool _refreshPending;

        private void Awake()
        {
            ValidateConfiguration();
        }

        public void ValidateConfiguration()
        {
            if (!enabled || !gameObject.activeSelf || !document || !document.enabled || !document.panelSettings || !document.visualTreeAsset)
                throw new InvalidOperationException("ContainerScreen requires an enabled screen and document, panel settings and layout.");
        }

        private void OnEnable()
        {
            BindDocument();
            this.Subscribe<InventoryChangedEvent>();
        }
        protected override void OnDisable()
        {
            base.OnDisable();
            this.Unsubscribe<InventoryChangedEvent>();
        }

        private void BindDocument()
        {
            var root = document.rootVisualElement;
            if (ReferenceEquals(_root, root)) return;
            _root = root;
            root.StretchToParentSize();
            root.pickingMode = PickingMode.Ignore;
            T Require<T>(string name) where T : VisualElement => root.Q<T>(name)
                ?? throw new InvalidOperationException($"Container layout is missing '{name}'.");
            var overlay = Require<VisualElement>("containerOverlay");
            _title = Require<Label>("containerTitle");
            _owner = Require<Label>("containerOwner");
            _message = Require<Label>("containerMessage");
            _bagGrid = Require<VisualElement>("bagGrid");
            _containerGrid = Require<VisualElement>("containerGrid");
            Require<Button>("closeContainer").clicked += () => { if (ReceivesInput) CloseScreen(); };
            overlay.RegisterCallback<NavigationCancelEvent>(evt => {
                if (!ReceivesInput) return;
                CloseScreen(); evt.StopPropagation();
            });
            overlay.RegisterCallback<KeyDownEvent>(evt => {
                if (!ReceivesInput || evt.keyCode != KeyCode.Escape) return;
                CloseScreen(); evt.StopPropagation();
            });
            RebindRoot(overlay);
        }

        public void Open(PersistentContainer container, GameCharacter character)
        {
            if (!container || !character) throw new ArgumentNullException();
            BindDocument();
            _root.StretchToParentSize();
            if (IsManagedOpen) CloseScreen(false);
            _container = container;
            _character = character;
            _container.Changed += RequestRefresh;
            _title.text = container.DisplayName;
            _owner.text = "Belongs to " + _characterCatalog.Require<CharacterDefinition>(container.Storage.State.OwnerCharacterId).Name;
            _message.text = "";
            Refresh();
            OpenScreen(character);
        }

        public void OnEvent(InventoryChangedEvent change)
        {
            if (_character && change.InventoryRef == _character.MainInventory) RequestRefresh();
        }
        private void RequestRefresh() => _refreshPending = true;
        private void LateUpdate()
        {
            if (!IsManagedOpen) return;
            if (!_container || !_container.isActiveAndEnabled) { CloseScreen(false); return; }
            if (_refreshPending) Refresh();
        }

        private void Refresh()
        {
            _refreshPending = false;
            Fill(_bagGrid, _character.MainInventory.GetSnapshot(), true);
            Fill(_containerGrid, _container.Storage.Inventory.GetSnapshot(), false);
        }

        private void Fill(VisualElement grid, ItemStack[] slots, bool deposit)
        {
            grid.Clear();
            for (int i = 0; i < slots.Length; i++)
            {
                int index = i;
                var stack = slots[i];
                var button = new Button(() => Move(deposit, index, false));
                button.AddToClassList("container-slot");
                button.tooltip = stack.IsEmpty ? "Empty" : stack.Item.Name + " ×" + stack.Quantity;
                button.SetEnabled(stack.IsOccupied);
                var icon = new VisualElement { pickingMode = PickingMode.Ignore };
                icon.AddToClassList("container-icon");
                if (stack.IsOccupied) icon.style.backgroundImage = new StyleBackground(stack.Item.Icon);
                button.Add(icon);
                var quantity = new Label(stack.IsEmpty ? "" : stack.Quantity.ToString()) { pickingMode = PickingMode.Ignore };
                quantity.AddToClassList("container-quantity");
                button.Add(quantity);
                button.RegisterCallback<PointerDownEvent>(evt => {
                    if (evt.button != 1 || !ReceivesInput) return;
                    Move(deposit, index, true); evt.StopPropagation();
                });
                grid.Add(button);
            }
        }

        private void Move(bool deposit, int index, bool single)
        {
            if (!ReceivesInput) return;
            var slot = deposit ? _character.MainInventory.GetSlot(index) : _container.Storage.Inventory.GetSlot(index);
            if (slot.IsEmpty) return;
            bool moved = _container.TryTransfer(_character, deposit, index, single ? 1 : slot.Quantity);
            _message.text = moved ? "" : "There isn't enough room for that stack.";
            PlayUISound(moved ? UISoundCue.Click : UISoundCue.Denied);
        }

        protected override void OnScreenClosed()
        {
            if (_container) _container.Changed -= RequestRefresh;
            _container = null;
            _character = null;
            _refreshPending = false;
        }
    }
}
