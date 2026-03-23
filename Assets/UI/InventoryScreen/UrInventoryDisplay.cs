using Core.Equipment;
using Core.Events;
using Core.Inventory;
using Items;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UI.InventoryScreen
{
    /// <summary>
    /// Main inventory display that shows all items in a grid layout.
    /// Uses the same inventory as the hotbar - this displays ALL slots while hotbar shows first N.
    /// 
    /// Interaction model (Stardew Valley-like):
    /// - Left-click: Pick up entire stack / Place entire held stack / Swap items
    /// - Right-click: Pick up half stack / Place one item from held stack
    /// - Items held persist when closing inventory
    /// </summary>
    public class UrInventoryDisplay : MonoBehaviour, IEventListener<InventoryChangedEvent>
    {
        [Header("Inventory Binding")]
        [Tooltip("The name of the inventory to display")]
        public string TargetInventoryName = "MainInventory";

        [Tooltip("The player ID to match for inventory lookup")]
        public string PlayerId = "Player1";

        [Header("Slot Configuration")]
        [Tooltip("The prefab to instantiate for each inventory slot")]
        public GameObject SlotPrefab;

        [Tooltip("The container transform where slots will be parented (should have GridLayoutGroup)")]
        public Transform SlotContainer;

        [Header("Held Item Display")]
        [Tooltip("Reference to the held item display component")]
        public InventoryHeldItemDisplay HeldItemDisplay;

        [Header("Action Buttons")]
        [Tooltip("Button to use the currently selected item")]
        public Button UseButton;

        [Tooltip("Button to destroy the currently selected item")]
        public Button DestroyButton;

        [Header("Input Actions")]
        [Tooltip("Input action to open/close inventory")]
        public InputActionProperty OpenInventoryAction;

        [Header("Canvas Group")]
        [Tooltip("Canvas group for showing/hiding the inventory")]
        public CanvasGroup InventoryCanvasGroup;

        // Protected state
        protected SlotInventory _targetInventory;
        protected UrInventorySlot[] _slots;
        protected bool _initialized = false;
        protected bool _isOpen = false;

        // Held item state - this persists even when inventory is closed
        protected ItemStack _heldStack;
        protected int _heldItemSourceIndex = -1;

        // Selected slot for action buttons
        protected int _selectedSlotIndex = -1;

        /// <summary>
        /// Gets the target inventory by name and player ID
        /// </summary>
        public virtual SlotInventory TargetInventory
        {
            get
            {
                if (_targetInventory == null)
                {
                    _targetInventory = SlotInventory.FindInventory(TargetInventoryName, PlayerId);
                }
                return _targetInventory;
            }
        }

        /// <summary>
        /// Whether the inventory is currently open
        /// </summary>
        public bool IsOpen => _isOpen;

        /// <summary>
        /// Whether an item is currently being held
        /// </summary>
        public bool IsHoldingItem => !_heldStack.IsEmpty;

        /// <summary>
        /// The currently held item
        /// </summary>
        public ItemDefinition HeldItem => _heldStack.Item;

        /// <summary>
        /// The quantity of the held item
        /// </summary>
        public int HeldItemQuantity => _heldStack.Quantity;

        protected virtual void Awake()
        {
            // Ensure canvas group exists
            if (InventoryCanvasGroup == null)
            {
                InventoryCanvasGroup = GetComponent<CanvasGroup>();
                if (InventoryCanvasGroup == null)
                {
                    InventoryCanvasGroup = gameObject.AddComponent<CanvasGroup>();
                }
            }
        }

        protected virtual void Start()
        {
            SetupButtons();
            CloseInventory();

            // Delayed initialization to ensure inventory is ready
            Invoke(nameof(InitializeInventory), 0.1f);
        }

        protected virtual void OnEnable()
        {
            OpenInventoryAction.action?.Enable();
            this.Subscribe<InventoryChangedEvent>();
        }

        protected virtual void OnDisable()
        {
            OpenInventoryAction.action?.Disable();
            this.Unsubscribe<InventoryChangedEvent>();
        }

        protected virtual void Update()
        {
            // Handle open/close input
            if (OpenInventoryAction.action != null && OpenInventoryAction.action.triggered)
            {
                ToggleInventory();
            }
        }

        /// <summary>
        /// Initializes the inventory grid with slots
        /// </summary>
        protected virtual void InitializeInventory()
        {
            if (_initialized) return;
            if (TargetInventory == null)
            {
                Debug.LogWarning($"UrInventoryDisplay: Could not find inventory '{TargetInventoryName}' for player '{PlayerId}'");
                return;
            }

            CreateSlots();
            _initialized = true;
            RefreshAllSlots();
        }

        /// <summary>
        /// Creates inventory slots based on inventory size
        /// </summary>
        protected virtual void CreateSlots()
        {
            // Clear existing slots
            if (_slots != null)
            {
                foreach (var slot in _slots)
                {
                    if (slot != null)
                    {
                        Destroy(slot.gameObject);
                    }
                }
            }

            int slotCount = TargetInventory.Content.Length;
            _slots = new UrInventorySlot[slotCount];

            for (int i = 0; i < slotCount; i++)
            {
                GameObject slotGo = Instantiate(SlotPrefab, SlotContainer);
                slotGo.name = $"InventorySlot_{i}";

                UrInventorySlot slot = slotGo.GetComponent<UrInventorySlot>();
                if (slot == null)
                {
                    slot = slotGo.AddComponent<UrInventorySlot>();
                }

                slot.Initialize(this, i);
                _slots[i] = slot;
            }
        }

        /// <summary>
        /// Refreshes the display of all slots
        /// </summary>
        public virtual void RefreshAllSlots()
        {
            if (TargetInventory == null || _slots == null) return;

            // Resize slots if inventory size changed
            if (_slots.Length != TargetInventory.Content.Length)
            {
                CreateSlots();
            }

            for (int i = 0; i < _slots.Length; i++)
            {
                if (i < TargetInventory.Content.Length)
                {
                    _slots[i].UpdateDisplay(TargetInventory.Content[i]);
                }
                else
                {
                    _slots[i].UpdateDisplay(ItemStack.Empty);
                }
            }

            UpdateActionButtons();
        }

        /// <summary>
        /// Sets up button listeners
        /// </summary>
        protected virtual void SetupButtons()
        {
            if (UseButton != null)
            {
                UseButton.onClick.RemoveAllListeners();
                UseButton.onClick.AddListener(OnUseButtonClicked);
            }

            if (DestroyButton != null)
            {
                DestroyButton.onClick.RemoveAllListeners();
                DestroyButton.onClick.AddListener(OnDestroyButtonClicked);
            }
        }

        /// <summary>
        /// Updates the state of action buttons based on selected slot
        /// </summary>
        protected virtual void UpdateActionButtons()
        {
            bool hasSelectedItem = _selectedSlotIndex >= 0 &&
                                   TargetInventory != null &&
                                   _selectedSlotIndex < TargetInventory.Content.Length &&
                                   !TargetInventory.Content[_selectedSlotIndex].IsEmpty;

            if (UseButton != null)
                UseButton.interactable = hasSelectedItem;

            if (DestroyButton != null)
                DestroyButton.interactable = hasSelectedItem;
        }

        #region Open/Close

        /// <summary>
        /// Toggles the inventory open/closed
        /// </summary>
        public virtual void ToggleInventory()
        {
            if (_isOpen)
            {
                CloseInventory();
            }
            else
            {
                OpenInventory();
            }
        }

        /// <summary>
        /// Opens the inventory
        /// </summary>
        public virtual void OpenInventory()
        {
            _isOpen = true;

            if (InventoryCanvasGroup != null)
            {
                InventoryCanvasGroup.alpha = 1f;
                InventoryCanvasGroup.interactable = true;
                InventoryCanvasGroup.blocksRaycasts = true;
            }

            RefreshAllSlots();
        }

        /// <summary>
        /// Closes the inventory (item remains held - Stardew Valley style)
        /// </summary>
        public virtual void CloseInventory()
        {
            _isOpen = false;

            if (InventoryCanvasGroup != null)
            {
                InventoryCanvasGroup.alpha = 0f;
                InventoryCanvasGroup.interactable = false;
                InventoryCanvasGroup.blocksRaycasts = false;
            }

            _selectedSlotIndex = -1;
        }

        #endregion

        #region Slot Click Handling

        /// <summary>
        /// Called when a slot is left-clicked.
        /// Picks up entire stack, places entire held stack, or swaps items.
        /// </summary>
        public virtual void OnSlotLeftClicked(int slotIndex)
        {
            if (TargetInventory == null) return;

            _selectedSlotIndex = slotIndex;
            UpdateActionButtons();

            if (IsHoldingItem)
            {
                PlaceHeldItem(slotIndex);
            }
            else
            {
                PickUpEntireStack(slotIndex);
            }
        }

        /// <summary>
        /// Called when a slot is right-clicked.
        /// Picks up half the stack, or places one item from held stack.
        /// </summary>
        public virtual void OnSlotRightClicked(int slotIndex)
        {
            if (TargetInventory == null) return;

            _selectedSlotIndex = slotIndex;
            UpdateActionButtons();

            if (IsHoldingItem)
            {
                PlaceOneItem(slotIndex);
            }
            else
            {
                PickUpHalfStack(slotIndex);
            }
        }

        #endregion

        #region Pick Up Items

        /// <summary>
        /// Picks up the entire stack at the specified slot
        /// </summary>
        protected virtual void PickUpEntireStack(int slotIndex)
        {
            if (slotIndex < 0 || slotIndex >= TargetInventory.Content.Length) return;

            ItemStack stack = TargetInventory.Content[slotIndex];
            if (stack.IsEmpty) return;

            _heldStack           = stack;
            _heldItemSourceIndex = slotIndex;
            TargetInventory.SetSlot(slotIndex, ItemStack.Empty);
            NotifyChange();
        }

        /// <summary>
        /// Picks up half the stack at the specified slot (rounded up)
        /// </summary>
        protected virtual void PickUpHalfStack(int slotIndex)
        {
            if (slotIndex < 0 || slotIndex >= TargetInventory.Content.Length) return;

            ItemStack stack = TargetInventory.Content[slotIndex];
            if (stack.IsEmpty) return;

            int pickUpAmount = Mathf.CeilToInt(stack.Quantity / 2f);
            int remaining    = stack.Quantity - pickUpAmount;

            _heldStack           = new ItemStack(stack.Item, pickUpAmount);
            _heldItemSourceIndex = slotIndex;
            TargetInventory.SetSlot(slotIndex, remaining > 0
                ? new ItemStack(stack.Item, remaining)
                : ItemStack.Empty);
            NotifyChange();
        }

        #endregion

        #region Place Items

        /// <summary>
        /// Places the held item at the specified slot.
        /// Handles stacking, swapping, and placing in empty slots.
        /// </summary>
        protected virtual void PlaceHeldItem(int slotIndex)
        {
            if (_heldStack.IsEmpty) return;
            if (slotIndex < 0 || slotIndex >= TargetInventory.Content.Length) return;

            ItemStack target = TargetInventory.Content[slotIndex];

            if (target.IsEmpty)
            {
                TargetInventory.SetSlot(slotIndex, _heldStack);
                ClearHeldItem();
            }
            else if (target.Item == _heldStack.Item && target.Item.MaxStackSize > 1)
            {
                int space = target.Item.MaxStackSize - target.Quantity;
                int toAdd = Mathf.Min(_heldStack.Quantity, space);

                if (toAdd > 0)
                {
                    TargetInventory.SetSlot(slotIndex, new ItemStack(target.Item, target.Quantity + toAdd));
                    int remaining = _heldStack.Quantity - toAdd;
                    if (remaining <= 0)
                        ClearHeldItem();
                    else
                    {
                        _heldStack = new ItemStack(_heldStack.Item, remaining);
                        InventoryHeldItemEvent.Trigger(_heldStack.Item, _heldStack.Quantity, _heldItemSourceIndex);
                    }
                }
                else
                {
                    SwapWithHeldItem(slotIndex, target);
                }
            }
            else
            {
                SwapWithHeldItem(slotIndex, target);
            }

            NotifyChange();
        }

        /// <summary>
        /// Swaps the target slot item with the held item
        /// </summary>
        protected virtual void SwapWithHeldItem(int slotIndex, ItemStack target)
        {
            TargetInventory.SetSlot(slotIndex, _heldStack);
            _heldStack           = target;
            _heldItemSourceIndex = slotIndex;
            InventoryHeldItemEvent.Trigger(_heldStack.Item, _heldStack.Quantity, slotIndex);
        }

        /// <summary>
        /// Places one item from the held stack into the specified slot
        /// </summary>
        protected virtual void PlaceOneItem(int slotIndex)
        {
            if (_heldStack.IsEmpty) return;
            if (slotIndex < 0 || slotIndex >= TargetInventory.Content.Length) return;

            ItemStack target = TargetInventory.Content[slotIndex];

            if (target.IsEmpty)
            {
                TargetInventory.SetSlot(slotIndex, new ItemStack(_heldStack.Item, 1));
                DecreaseHeld();
            }
            else if (target.Item == _heldStack.Item && target.Quantity < target.Item.MaxStackSize)
            {
                TargetInventory.SetSlot(slotIndex, new ItemStack(target.Item, target.Quantity + 1));
                DecreaseHeld();
            }

            NotifyChange();
        }

        void DecreaseHeld()
        {
            int remaining = _heldStack.Quantity - 1;
            if (remaining <= 0)
                ClearHeldItem();
            else
            {
                _heldStack = new ItemStack(_heldStack.Item, remaining);
                InventoryHeldItemEvent.Trigger(_heldStack.Item, _heldStack.Quantity, _heldItemSourceIndex);
            }
        }

        /// <summary>
        /// Clears the held item
        /// </summary>
        protected virtual void ClearHeldItem()
        {
            _heldStack           = ItemStack.Empty;
            _heldItemSourceIndex = -1;
            InventoryHeldItemEvent.TriggerClear();
        }

        /// <summary>
        /// Notifies that inventory content changed and refreshes display
        /// </summary>
        protected virtual void NotifyChange()
        {
            RefreshAllSlots();
            if (!_heldStack.IsEmpty)
                InventoryHeldItemEvent.Trigger(_heldStack.Item, _heldStack.Quantity, _heldItemSourceIndex);
        }

        #endregion

        #region Action Buttons

        /// <summary>
        /// Called when the Use button is clicked
        /// </summary>
        protected virtual void OnUseButtonClicked()
        {
            if (_selectedSlotIndex < 0 || _selectedSlotIndex >= TargetInventory.Content.Length) return;

            ItemStack stack = TargetInventory.Content[_selectedSlotIndex];
            if (stack.IsEmpty) return;

            ItemSelectedEvent.Trigger(stack.Item as EquippableItem, _selectedSlotIndex);
            RefreshAllSlots();
        }

        /// <summary>
        /// Called when the Destroy button is clicked
        /// </summary>
        protected virtual void OnDestroyButtonClicked()
        {
            if (_selectedSlotIndex < 0 || _selectedSlotIndex >= TargetInventory.Content.Length) return;
            if (TargetInventory.Content[_selectedSlotIndex].IsEmpty) return;

            TargetInventory.SetSlot(_selectedSlotIndex, ItemStack.Empty);
            _selectedSlotIndex = -1;
            RefreshAllSlots();
        }

        #endregion

        #region Event Handling

        /// <summary>
        /// Responds to inventory events
        /// </summary>
        public void OnEvent(InventoryChangedEvent e)
        {
            if (e.InventoryRef == TargetInventory)
                RefreshAllSlots();
        }

        #endregion
    }
}