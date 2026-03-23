using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Equipment;
using Core.Events;
using Core.Inventory;
using Core.Location;
using Items;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UI.Hotbar
{
    /// <summary>
    /// Lightweight hotbar component that displays the first N items from an inventory
    /// and provides quick-use functionality via input actions or mouse clicks
    /// </summary>
    public class ToolHotbar : MonoBehaviour, IEventListener<InventoryChangedEvent>, IEventListener<SceneReadyEvent>
    {
        [Header("Inventory Binding")] [Tooltip("The name of the inventory to display in the hotbar")]
        public string TargetInventoryName = "MainInventory";

        [Tooltip("The player ID to match for inventory lookup")]
        public string PlayerId = "Player1";

        [Header("Hotbar Configuration")] [Tooltip("Number of hotbar slots to display")] [Range(1, 10)]
        public int HotbarSize = 5;

        [Header("Slot Prefab")] [Tooltip("The prefab to instantiate for each hotbar slot")]
        public GameObject SlotPrefab;

        [Tooltip("The container transform where slots will be parented")]
        public Transform SlotContainer;

        [Header("Input Actions")]
#if ENABLE_INPUT_SYSTEM && !ENABLE_LEGACY_INPUT_MANAGER
        [Tooltip("Input actions for each slot (array size should match HotbarSize)")]
        public InputActionProperty[] SlotActions;

        [Tooltip("Input action to select the next hotbar slot")]
        public InputActionProperty NextSlotAction;

        [Tooltip("Input action to select the previous hotbar slot")]
        public InputActionProperty PreviousSlotAction;
#endif

        [Header("Navigation")] [Tooltip("The currently selected slot index (0-based)")]
        public int CurrentSelectedIndex = 0;

        // Protected properties
        protected SlotInventory _targetInventory;
        protected List<HotbarSlot> _hotbarSlots = new List<HotbarSlot>();
        protected bool _initialized = false;

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

        private void Awake() { }

        /// <summary>
        /// Initialize the hotbar on Start
        /// </summary>
        protected virtual void Start()
        {
            InitializeHotbar();
        }

        /// <summary>
        /// Creates hotbar slots and sets up input listeners
        /// </summary>
        protected virtual void InitializeHotbar()
        {
            if (_initialized) return;
            if (TargetInventory == null) return;

            // Clear existing slots
            var existingDesignHotbarSlots = SlotContainer.transform.GetComponentsInChildren<HotbarSlot>().ToList();
            var allExistingSlots = existingDesignHotbarSlots.Concat(_hotbarSlots).ToList();
            foreach (var slot in allExistingSlots)
            {
                if (slot != null)
                {
                    Destroy(slot.gameObject);
                }
            }

            _hotbarSlots.Clear();

            // Create new slots
            for (int i = 0; i < HotbarSize; i++)
            {
                GameObject newSlotGo = Instantiate(SlotPrefab, SlotContainer);
                newSlotGo.name = $"HotbarSlot_{i}";
                HotbarSlot newSlot = newSlotGo.GetComponent<HotbarSlot>();
                newSlot.Initialize(this, i);
                _hotbarSlots.Add(newSlot);

                // Set key binding label
                if (SlotActions != null && i < SlotActions.Length)
                {
                    string bindingName = GetBindingDisplayName(SlotActions[i].action);
                    newSlot.SetKeyBindingText(bindingName);
                }
            }

            _initialized = true;

            // Initial refresh
            RefreshAllSlots();

            // Set initial selection
            if (_hotbarSlots.Count > 0 && TargetInventory?.Content?.Any(s => !s.IsEmpty) == true)
            {
                SetSelectedSlot(CurrentSelectedIndex);
            }
        }

        /// <summary>
        /// Extracts the display name of an input binding (e.g., "1", "Q", "E")
        /// </summary>
        protected virtual string GetBindingDisplayName(InputAction action)
        {
            if (action == null || action.bindings.Count == 0)
            {
                return "";
            }

            // Get the first binding's display name
            // TODO: Enhance to handle composite bindings if needed
            return action.GetBindingDisplayString(0, InputBinding.DisplayStringOptions.DontIncludeInteractions);
        }

        /// <summary>
        /// Updates all slot displays to match the first N items in the inventory
        /// </summary>
        protected virtual void RefreshAllSlots()
        {
            if (TargetInventory == null || _hotbarSlots.Count == 0)
            {
                return;
            }

            for (int i = 0; i < _hotbarSlots.Count; i++)
            {
                if (i < TargetInventory.Content.Length)
                {
                    _hotbarSlots[i].UpdateDisplay(TargetInventory.Content[i]);
                }
                else
                {
                    _hotbarSlots[i].UpdateDisplay(ItemStack.Empty);
                }
            }

            // To make sure the selected item is equipped on refresh e.g. if we use up an item or we get a new item
            SwitchSlotItem(CurrentSelectedIndex);
        }

        /// <summary>
        /// Called when a slot action input is triggered
        /// </summary>
        public virtual void OnSlotActionTriggered(int slotIndex)
        {
            if (slotIndex < 0 || slotIndex >= _hotbarSlots.Count)
            {
                return;
            }

            if (TargetInventory.Content[slotIndex].IsEmpty)
            {
                return;
            }

            SetSelectedSlot(slotIndex);
            SwitchSlotItem(slotIndex);
        }

        /// <summary>
        /// Uses the item at the specified slot index
        /// </summary>
        public virtual void SwitchSlotItem(int slotIndex)
        {
            if (TargetInventory == null || slotIndex < 0 || slotIndex >= TargetInventory.Content.Length)
            {
                return;
            }

            ItemStack stack = TargetInventory.Content[slotIndex];

            if (stack.IsEmpty)
            {
                ItemSelectedEvent.Trigger(null, slotIndex);
            }
            else if (stack.Item is EquippableItem equippableItem)
            {
                ItemSelectedEvent.Trigger(equippableItem, slotIndex);
            }
        }


        /// <summary>
        /// Navigates to the next hotbar slot
        /// </summary>
        protected virtual void SelectNextSlot()
        {
            int nextIndex = (CurrentSelectedIndex + 1) % _hotbarSlots.Count;
            SetSelectedSlot(nextIndex);
            SwitchSlotItem(nextIndex);
        }

        /// <summary>
        /// Navigates to the previous hotbar slot
        /// </summary>
        protected virtual void SelectPreviousSlot()
        {
            int prevIndex = CurrentSelectedIndex - 1;
            if (prevIndex < 0)
            {
                prevIndex = _hotbarSlots.Count - 1;
            }

            SetSelectedSlot(prevIndex);
            SwitchSlotItem(prevIndex);
        }

        /// <summary>
        /// Sets the currently selected slot and updates visual feedback
        /// </summary>
        protected virtual void SetSelectedSlot(int index)
        {
            if (index < 0 || index >= _hotbarSlots.Count)
            {
                return;
            }

            // Deselect all slots
            foreach (var slot in _hotbarSlots)
            {
                slot.SetSelected(false);
            }

            // Select the new slot
            CurrentSelectedIndex = index;
            _hotbarSlots[index].SetSelected(true);
        }

        /// <summary>
        /// Check for input each frame
        /// </summary>
        protected virtual void Update()
        {
            if (!_initialized) return;

            // TODO: This looks extremly wrong???
            // Check slot actions
            if (SlotActions != null)
            {
                for (int i = 0; i < SlotActions.Length && i < HotbarSize; i++)
                {
                    if (SlotActions[i].action != null && SlotActions[i].action.triggered)
                    {
                        OnSlotActionTriggered(i);
                    }
                }
            }

            // Check next/previous actions
            if (NextSlotAction.action != null && NextSlotAction.action.triggered)
            {
                SelectNextSlot();
            }

            if (PreviousSlotAction.action != null && PreviousSlotAction.action.triggered)
            {
                SelectPreviousSlot();
            }
        }

        public virtual void OnEvent(InventoryChangedEvent e)
        {
            if (e.InventoryRef?.InventoryName != TargetInventoryName ||
                e.InventoryRef?.PlayerID != PlayerId)
                return;

            RefreshAllSlots();
        }

        protected virtual void OnEnable()
        {
            if (SlotActions != null)
                foreach (var action in SlotActions)
                    action.action?.Enable();

            NextSlotAction.action?.Enable();
            PreviousSlotAction.action?.Enable();

            this.Subscribe<InventoryChangedEvent>();
            this.Subscribe<SceneReadyEvent>();
        }

        protected virtual void OnDisable()
        {
            if (SlotActions != null)
                foreach (var action in SlotActions)
                    action.action?.Disable();

            NextSlotAction.action?.Disable();
            PreviousSlotAction.action?.Disable();

            this.Unsubscribe<InventoryChangedEvent>();
            this.Unsubscribe<SceneReadyEvent>();
        }

        public void OnEvent(SceneReadyEvent e)
        {
            InitializeHotbar();
        }
    }
}