using MoreMountains.InventoryEngine;
using MoreMountains.Tools;
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
    public class UrInventoryDisplay : MonoBehaviour, MMEventListener<MMInventoryEvent>
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
        protected Inventory _targetInventory;
        protected UrInventorySlot[] _slots;
        protected bool _initialized = false;
        protected bool _isOpen = false;

        // Held item state - this persists even when inventory is closed
        protected InventoryItem _heldItem;
        protected int _heldItemQuantity;
        protected int _heldItemSourceIndex = -1;

        // Selected slot for action buttons
        protected int _selectedSlotIndex = -1;

        /// <summary>
        /// Gets the target inventory by name and player ID
        /// </summary>
        public virtual Inventory TargetInventory
        {
            get
            {
                if (_targetInventory == null)
                {
                    _targetInventory = Inventory.FindInventory(TargetInventoryName, PlayerId);
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
        public bool IsHoldingItem => !InventoryItem.IsNull(_heldItem);

        /// <summary>
        /// The currently held item
        /// </summary>
        public InventoryItem HeldItem => _heldItem;

        /// <summary>
        /// The quantity of the held item
        /// </summary>
        public int HeldItemQuantity => _heldItemQuantity;

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
            this.MMEventStartListening();
        }

        protected virtual void OnDisable()
        {
            OpenInventoryAction.action?.Disable();
            this.MMEventStopListening();
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
                    _slots[i].UpdateDisplay(null);
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
                                   _selectedSlotIndex < TargetInventory.Content.Length &&
                                   !InventoryItem.IsNull(TargetInventory.Content[_selectedSlotIndex]);

            if (UseButton != null)
            {
                UseButton.interactable = hasSelectedItem &&
                                         TargetInventory.Content[_selectedSlotIndex].IsUsable;
            }

            if (DestroyButton != null)
            {
                DestroyButton.interactable = hasSelectedItem;
            }
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

            InventoryItem item = TargetInventory.Content[slotIndex];
            if (InventoryItem.IsNull(item)) return;

            // Store the held item data
            _heldItem = item.Copy();
            _heldItemQuantity = item.Quantity;
            _heldItemSourceIndex = slotIndex;

            // Remove from inventory
            TargetInventory.Content[slotIndex] = null;
            
            NotifyChange();
        }

        /// <summary>
        /// Picks up half the stack at the specified slot (rounded up)
        /// </summary>
        protected virtual void PickUpHalfStack(int slotIndex)
        {
            if (slotIndex < 0 || slotIndex >= TargetInventory.Content.Length) return;

            InventoryItem item = TargetInventory.Content[slotIndex];
            if (InventoryItem.IsNull(item)) return;

            int totalQuantity = item.Quantity;
            int pickUpAmount = Mathf.CeilToInt(totalQuantity / 2f);
            int remainingAmount = totalQuantity - pickUpAmount;

            // Store the held item data
            _heldItem = item.Copy();
            _heldItemQuantity = pickUpAmount;
            _heldItemSourceIndex = slotIndex;

            // Update or remove from inventory
            if (remainingAmount > 0)
            {
                TargetInventory.Content[slotIndex].Quantity = remainingAmount;
            }
            else
            {
                TargetInventory.Content[slotIndex] = null;
            }

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
            if (!IsHoldingItem) return;
            if (slotIndex < 0 || slotIndex >= TargetInventory.Content.Length) return;

            InventoryItem targetItem = TargetInventory.Content[slotIndex];

            if (InventoryItem.IsNull(targetItem))
            {
                // Empty slot - place the entire held stack
                TargetInventory.Content[slotIndex] = _heldItem.Copy();
                TargetInventory.Content[slotIndex].Quantity = _heldItemQuantity;
                ClearHeldItem();
            }
            else if (targetItem.ItemID == _heldItem.ItemID && targetItem.MaximumStack > 1)
            {
                // Same item type - try to stack
                int spaceInStack = targetItem.MaximumStack - targetItem.Quantity;
                int amountToStack = Mathf.Min(_heldItemQuantity, spaceInStack);

                if (amountToStack > 0)
                {
                    targetItem.Quantity += amountToStack;
                    _heldItemQuantity -= amountToStack;

                    if (_heldItemQuantity <= 0)
                    {
                        ClearHeldItem();
                    }
                    else
                    {
                        // Still holding some items
                        InventoryHeldItemEvent.Trigger(_heldItem, _heldItemQuantity, _heldItemSourceIndex);
                    }
                }
                else
                {
                    // Stack is full, swap instead
                    SwapWithHeldItem(slotIndex, targetItem);
                }
            }
            else if (targetItem.CanSwapObject && _heldItem.CanSwapObject)
            {
                // Different items - swap
                SwapWithHeldItem(slotIndex, targetItem);
            }

            NotifyChange();
        }

        /// <summary>
        /// Swaps the target slot item with the held item
        /// </summary>
        protected virtual void SwapWithHeldItem(int slotIndex, InventoryItem targetItem)
        {
            InventoryItem tempItem = targetItem.Copy();
            int tempQuantity = targetItem.Quantity;

            TargetInventory.Content[slotIndex] = _heldItem.Copy();
            TargetInventory.Content[slotIndex].Quantity = _heldItemQuantity;

            _heldItem = tempItem;
            _heldItemQuantity = tempQuantity;
            _heldItemSourceIndex = slotIndex;

            InventoryHeldItemEvent.Trigger(_heldItem, _heldItemQuantity, slotIndex);
        }

        /// <summary>
        /// Places one item from the held stack into the specified slot
        /// </summary>
        protected virtual void PlaceOneItem(int slotIndex)
        {
            if (!IsHoldingItem) return;
            if (slotIndex < 0 || slotIndex >= TargetInventory.Content.Length) return;

            InventoryItem targetItem = TargetInventory.Content[slotIndex];

            if (InventoryItem.IsNull(targetItem))
            {
                // Empty slot - place one item
                TargetInventory.Content[slotIndex] = _heldItem.Copy();
                TargetInventory.Content[slotIndex].Quantity = 1;
                _heldItemQuantity--;

                if (_heldItemQuantity <= 0)
                {
                    ClearHeldItem();
                }
                else
                {
                    InventoryHeldItemEvent.Trigger(_heldItem, _heldItemQuantity, _heldItemSourceIndex);
                }
            }
            else if (targetItem.ItemID == _heldItem.ItemID && targetItem.Quantity < targetItem.MaximumStack)
            {
                // Same item with room - add one
                targetItem.Quantity++;
                _heldItemQuantity--;

                if (_heldItemQuantity <= 0)
                {
                    ClearHeldItem();
                }
                else
                {
                    InventoryHeldItemEvent.Trigger(_heldItem, _heldItemQuantity, _heldItemSourceIndex);
                }
            }
            // If different item or stack full, do nothing on right-click

            NotifyChange();
        }

        /// <summary>
        /// Clears the held item
        /// </summary>
        protected virtual void ClearHeldItem()
        {
            _heldItem = null;
            _heldItemQuantity = 0;
            _heldItemSourceIndex = -1;

            InventoryHeldItemEvent.TriggerClear();
        }

        /// <summary>
        /// Notifies that inventory content changed and refreshes display
        /// </summary>
        protected virtual void NotifyChange()
        {
            MMInventoryEvent.Trigger(MMInventoryEventType.ContentChanged, null, TargetInventoryName, null, 0, 0, PlayerId);
            RefreshAllSlots();
            
            // Also update the held item display
            if (IsHoldingItem)
            {
                InventoryHeldItemEvent.Trigger(_heldItem, _heldItemQuantity, _heldItemSourceIndex);
            }
        }

        #endregion

        #region Action Buttons

        /// <summary>
        /// Called when the Use button is clicked
        /// </summary>
        protected virtual void OnUseButtonClicked()
        {
            if (_selectedSlotIndex < 0 || _selectedSlotIndex >= TargetInventory.Content.Length) return;

            InventoryItem item = TargetInventory.Content[_selectedSlotIndex];
            if (InventoryItem.IsNull(item) || !item.IsUsable) return;

            // Use the item
            bool useSuccessful = item.Use(PlayerId);

            if (useSuccessful && item.Consumable)
            {
                // Consume the item
                int consumeQuantity = Mathf.Min(item.ConsumeQuantity, item.Quantity);
                TargetInventory.RemoveItem(_selectedSlotIndex, consumeQuantity);
            }

            MMInventoryEvent.Trigger(MMInventoryEventType.ItemUsed, null, TargetInventoryName, item, item.Quantity, _selectedSlotIndex, PlayerId);
            RefreshAllSlots();
        }

        /// <summary>
        /// Called when the Destroy button is clicked
        /// </summary>
        protected virtual void OnDestroyButtonClicked()
        {
            if (_selectedSlotIndex < 0 || _selectedSlotIndex >= TargetInventory.Content.Length) return;

            InventoryItem item = TargetInventory.Content[_selectedSlotIndex];
            if (InventoryItem.IsNull(item)) return;

            // Destroy the entire stack
            TargetInventory.DestroyItem(_selectedSlotIndex);

            MMInventoryEvent.Trigger(MMInventoryEventType.Destroy, null, TargetInventoryName, item, 0, _selectedSlotIndex, PlayerId);

            _selectedSlotIndex = -1;
            RefreshAllSlots();
        }

        #endregion

        #region Event Handling

        /// <summary>
        /// Responds to inventory events
        /// </summary>
        public virtual void OnMMEvent(MMInventoryEvent inventoryEvent)
        {
            // Only respond to events for our inventory and player
            if (inventoryEvent.TargetInventoryName != TargetInventoryName ||
                inventoryEvent.PlayerID != PlayerId)
            {
                return;
            }

            switch (inventoryEvent.InventoryEventType)
            {
                case MMInventoryEventType.ContentChanged:
                case MMInventoryEventType.InventoryLoaded:
                    RefreshAllSlots();
                    break;
            }
        }

        #endregion
    }
}