using Core.Equipment;
using Core.Events;
using Core.Inventory;
using UI.Shared;
using UnityEngine;

namespace UI.InventoryScreen
{
    public abstract class InventoryScreenView : ManagedUIScreen,
        IEventListener<InventoryChangedEvent>, IEventListener<ItemSelectedEvent>
    {
        public string TargetInventoryName = "MainInventory";
        public string PlayerId = "Player1";
        protected SlotInventory _targetInventory;
        protected int _selectedSlotIndex = -1;
        private bool _refreshPending;

        public virtual SlotInventory TargetInventory => _targetInventory
            ? _targetInventory : _targetInventory = SlotInventory.FindInventory(TargetInventoryName, PlayerId);
        protected ItemStack _heldStack => TargetInventory ? TargetInventory.HeldStack : ItemStack.Empty;
        public bool IsOpen => IsManagedOpen;
        public bool IsHoldingItem => _heldStack.IsOccupied;
        public ItemDefinition HeldItem => _heldStack.Item;
        public int HeldItemQuantity => _heldStack.Quantity;

        protected virtual void OnEnable()
        {
            this.Subscribe<InventoryChangedEvent>();
            this.Subscribe<ItemSelectedEvent>();
            RequestRefresh();
        }

        protected override void OnDisable()
        {
            base.OnDisable();
            this.Unsubscribe<InventoryChangedEvent>();
            this.Unsubscribe<ItemSelectedEvent>();
            _refreshPending = false;
        }

        public void OnEvent(InventoryChangedEvent change)
        {
            if (change.InventoryRef == TargetInventory) RequestRefresh();
        }

        public void OnEvent(ItemSelectedEvent change)
        {
            if (change.Inventory == TargetInventory) RequestRefresh();
        }

        protected void RequestRefresh() => _refreshPending = true;
        protected void ClearRefreshRequest() => _refreshPending = false;
        protected virtual void LateUpdate()
        {
            if (_refreshPending) RefreshAllSlots();
        }

        public void ToggleInventory()
        {
            if (IsOpen) CloseInventory();
            else OpenInventory();
        }

        public virtual void SelectSlot(int index)
        {
            if (!TargetInventory || index < 0 || index >= TargetInventory.Capacity) return;
            _selectedSlotIndex = index;
            PlayUISound(UISoundCue.Click);
            RefreshAllSlots();
        }

        protected override void OnScreenClosed() => _selectedSlotIndex = -1;
        public abstract void OpenInventory();
        public abstract void CloseInventory();
        public abstract void RefreshAllSlots();
    }
}
