using System;
using UnityEngine;
using MoreMountains.InventoryEngine;
using MoreMountains.Tools;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Equipment;
using Items;
using MoreMountains.TopDownEngine;
using UnityEngine.InputSystem;

namespace UI.Hotbar
{
    /// <summary>
    /// Lightweight hotbar component that displays the first N items from an inventory
    /// and provides quick-use functionality via input actions or mouse clicks
    /// </summary>
    public class ToolHotbar : MonoBehaviour, MMEventListener<MMInventoryEvent>, MMEventListener<TopDownEngineEvent>
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

        [Header("Navigation")] [Tooltip("The currently selected slot index (0-based)")] [MMReadOnly]
        public int CurrentSelectedIndex = 0;

        // Protected properties
        protected Inventory _targetInventory;
        protected List<HotbarSlot> _hotbarSlots = new List<HotbarSlot>();
        protected bool _initialized = false;

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

        private void Awake()
        {
            this.enabled = false; // Disable until we receive SpawnComplete event
        }

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
            // Wait for one frame to ensure inventory is ready (TODO: Better solution?)
            if (_initialized) return;

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
            if (_hotbarSlots.Count > 0 && _targetInventory.Content.Any(item => !InventoryItem.IsNull(item)))
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
                    _hotbarSlots[i].UpdateDisplay(null);
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

            if (TargetInventory.Content[slotIndex] == null)
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

            InventoryItem item = TargetInventory.Content[slotIndex];

            // TODO: Check if there are no changes, then return early

            if (InventoryItem.IsNull(item))
            {
                // var player = (UrLevelManager.Current as UrLevelManager).GetPlayerById(PlayerId);
                var player = MainCharacter.CurrentMainCharacter;
                player.CurrentlyHeldItem?.UnEquip(PlayerId);
                ItemSelectedEvent.Trigger(null, slotIndex);
            }
            else if (item is EquippableItem equippableItem)
            {
                // We don't send an equipment request because, from the point of the inventory, we are not equipping it.

                // This will not yet update the "equipment" in the character and mainly serves to play feedbacks etc
                // It is not really needed and the whole concept of "Equippable" in the InventoryEngine sense can probably
                // be removed...
                item.Equip(PlayerId);       
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

            // Refresh on relevant events
            switch (inventoryEvent.InventoryEventType)
            {
                case MMInventoryEventType.ContentChanged:
                    // case MMInventoryEventType.ItemUsed:
                    // case MMInventoryEventType.ItemEquipped:
                    // case MMInventoryEventType.ItemUnEquipped:
                    // case MMInventoryEventType.Pick:
                    // case MMInventoryEventType.Drop:
                    // case MMInventoryEventType.Destroy:
                    // case MMInventoryEventType.InventoryLoaded:
                    RefreshAllSlots();
                    break;
            }
        }

        /// <summary>
        /// Start listening to events on enable
        /// </summary>
        protected virtual void OnEnable()
        {
            // Enable input actions
            if (SlotActions != null)
            {
                foreach (var action in SlotActions)
                {
                    action.action?.Enable();
                }
            }

            NextSlotAction.action?.Enable();
            PreviousSlotAction.action?.Enable();

            this.MMEventStartListening<MMInventoryEvent>();
            this.MMEventStartListening<TopDownEngineEvent>();
        }

        /// <summary>
        /// Stop listening to events on disable
        /// </summary>
        protected virtual void OnDisable()
        {
            // Disable input actions
            if (SlotActions != null)
            {
                foreach (var action in SlotActions)
                {
                    action.action?.Disable();
                }
            }

            NextSlotAction.action?.Disable();
            PreviousSlotAction.action?.Disable();

            this.MMEventStopListening<MMInventoryEvent>();
            this.MMEventStopListening<TopDownEngineEvent>();
        }

        public void OnMMEvent(TopDownEngineEvent eventType)
        {
            if (eventType.EventType == TopDownEngineEventTypes.SpawnComplete)
            {
                this.enabled = true;
            }
        }
    }
}