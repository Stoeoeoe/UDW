using Core.Equipment;
using Core.Inventory;
using Items;
using UnityEngine;
using UnityEngine.UI;
using UI.Shared;

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
    public class UrInventoryDisplay : InventoryScreenView
    {
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

        [Header("Canvas Group")]
        [Tooltip("Canvas group for showing/hiding the inventory")]
        public CanvasGroup InventoryCanvasGroup;

        protected UrInventorySlot[] _slots;
        protected bool _initialized;

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

        protected override void OnInputActiveChanged(bool active)
        {
            InventoryCanvasGroup.interactable = active;
            InventoryCanvasGroup.blocksRaycasts = active;
        }

        protected virtual void Start()
        {
            SetupButtons();
            HideInventory();

            // Delayed initialization to ensure inventory is ready
            Invoke(nameof(InitializeInventory), 0.1f);
        }

        protected override void OnEnable()
        {
            base.OnEnable();
        }

        protected override void OnDisable()
        {
            base.OnDisable();
        }

        protected virtual void Update()
        {
            // Handle open/close input
            if (Input.InputManager.Instance.OpenInventoryPressed && (!UrGUIManager.HasOpenScreens || ReceivesInput))
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

            int slotCount = TargetInventory.Capacity;
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
        public override void RefreshAllSlots()
        {
            ClearRefreshRequest();
            if (!TargetInventory || !SlotPrefab || !SlotContainer) return;
            if (_slots == null) CreateSlots();
            var content = TargetInventory.GetSnapshot();

            // Resize slots if inventory size changed
            if (_slots.Length != content.Length)
            {
                CreateSlots();
            }

            for (int i = 0; i < _slots.Length; i++)
            {
                if (i < content.Length)
                {
                    _slots[i].UpdateDisplay(content[i]);
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
                                   _selectedSlotIndex < TargetInventory.Capacity &&
                                   !TargetInventory.GetSlot(_selectedSlotIndex).IsEmpty;

            if (UseButton != null)
                UseButton.interactable = hasSelectedItem;

            if (DestroyButton != null)
                DestroyButton.interactable = hasSelectedItem;
        }

        #region Open/Close

        /// <summary>
        /// Opens the inventory
        /// </summary>
        public override void OpenInventory()
        {
            if (!OpenScreen(ShowInventory, HideInventory)) return;
            RefreshAllSlots();
        }

        /// <summary>
        /// Closes the inventory (item remains held - Stardew Valley style)
        /// </summary>
        public override void CloseInventory() => CloseScreen();

        private void ShowInventory()
        {
            if (InventoryCanvasGroup == null) return;
            InventoryCanvasGroup.alpha = 1f;
            InventoryCanvasGroup.interactable = true;
            InventoryCanvasGroup.blocksRaycasts = true;
        }

        private void HideInventory()
        {
            if (InventoryCanvasGroup == null) return;
            InventoryCanvasGroup.alpha = 0f;
            InventoryCanvasGroup.interactable = false;
            InventoryCanvasGroup.blocksRaycasts = false;
        }

        #endregion

        #region Slot Click Handling

        /// <summary>
        /// Called when a slot is left-clicked.
        /// Picks up entire stack, places entire held stack, or swaps items.
        /// </summary>
        public virtual void OnSlotLeftClicked(int slotIndex)
        {
            if (!ReceivesInput || !TargetInventory) return;
            PlayUISound(UISoundCue.Click);

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
            if (!ReceivesInput || !TargetInventory) return;
            PlayUISound(UISoundCue.Click);

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

        protected virtual void PickUpEntireStack(int slotIndex)
        {
            var stack = TargetInventory.GetSlot(slotIndex);
            if (stack.IsOccupied) TargetInventory.Interaction.TryPickUp(slotIndex, stack.Quantity);
        }

        protected virtual void PickUpHalfStack(int slotIndex)
        {
            var stack = TargetInventory.GetSlot(slotIndex);
            if (stack.IsOccupied) TargetInventory.Interaction.TryPickUp(slotIndex, stack.Quantity / 2 + stack.Quantity % 2);
        }

        protected virtual void PlaceHeldItem(int slotIndex) => TargetInventory.Interaction.TryPlaceHeld(slotIndex);
        protected virtual void PlaceOneItem(int slotIndex) => TargetInventory.Interaction.TryPlaceHeld(slotIndex, true);

        #region Action Buttons

        /// <summary>
        /// Called when the Use button is clicked
        /// </summary>
        protected virtual void OnUseButtonClicked()
        {
            if (_selectedSlotIndex < 0 || _selectedSlotIndex >= TargetInventory.Capacity) return;

            ItemStack stack = TargetInventory.GetSlot(_selectedSlotIndex);
            if (stack.IsEmpty) return;

            TargetInventory.Loadout.SelectItem(_selectedSlotIndex);
            PlayUISound(UISoundCue.Click);
            RefreshAllSlots();
        }

        /// <summary>
        /// Called when the Destroy button is clicked
        /// </summary>
        protected virtual void OnDestroyButtonClicked()
        {
            if (_selectedSlotIndex < 0 || _selectedSlotIndex >= TargetInventory.Capacity) return;
            if (TargetInventory.GetSlot(_selectedSlotIndex).IsEmpty) return;

            PlayUISound(UISoundCue.Click);
            TargetInventory.SetSlot(_selectedSlotIndex, ItemStack.Empty);
            _selectedSlotIndex = -1;
            RefreshAllSlots();
        }

        #endregion

    }
}
