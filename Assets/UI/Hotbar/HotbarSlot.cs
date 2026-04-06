using Core.Inventory;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UI.Hotbar
{
    /// <summary>
    /// Individual hotbar slot that displays an item icon, quantity, and key binding
    /// </summary>
    public class HotbarSlot : MonoBehaviour
    {
        [Header("Visual Components")]
        [Tooltip("The image component that displays the item icon")]
        public Image IconImage;
        
        [Tooltip("The background image of the slot")]
        public Image BackgroundImage;
        
        [Tooltip("The image shown when this slot is selected")]
        public Image SelectedIndicator;
        
        [Header("Text Components")]
        [Tooltip("TextMeshPro component for displaying item quantity")]
        public TMP_Text QuantityText;
        
        [Tooltip("TextMeshPro component for displaying the key binding")]
        public TMP_Text KeyBindingText;

        
        [Header("Button")]
        [Tooltip("Button component for mouse/touch input")]
        public Button SlotButton;
        
        [Header("Colors")]
        [Tooltip("Color for empty slot")]
        public Color EmptySlotColor = new Color(1f, 1f, 1f, 0.3f);
        
        [Tooltip("Color for filled slot")]
        public Color FilledSlotColor = new Color(1f, 1f, 1f, 1f);
        
        [Tooltip("Color for selected indicator")]
        public Color SelectedColor = new Color(1f, 0.8f, 0f, 1f);
        
        // Protected properties
        protected ToolHotbar _parentHotbar;
        protected int _slotIndex;
        protected ItemStack _currentItem;
        
        /// <summary>
        /// Initialize the slot with parent hotbar reference and index
        /// </summary>
        public virtual void Initialize(ToolHotbar parentHotbar, int slotIndex)
        {
            _parentHotbar = parentHotbar;
            _slotIndex = slotIndex;
            
            // Set up button click listener
            if (SlotButton != null)
            {
                SlotButton.onClick.RemoveAllListeners();
                SlotButton.onClick.AddListener(OnSlotClicked);
            }
            
            // Initialize visual state
            SetSelected(false);
            UpdateDisplay(ItemStack.Empty);
        }
        
        /// <summary>
        /// Updates the slot's visual display based on the item stack
        /// </summary>
        public virtual void UpdateDisplay(ItemStack stack)
        {
            _currentItem = stack;
            
            bool hasItem = !stack.IsEmpty;
            
            // Update icon
            if (IconImage != null)
            {
                IconImage.enabled = hasItem;
                
                if (hasItem)
                {
                    IconImage.sprite = stack.Item.Icon;
                    IconImage.color = FilledSlotColor;
                }
            }
            
            // Update quantity
            UpdateQuantityDisplay(stack);
            
            // Update background
            if (BackgroundImage != null)
            {
                BackgroundImage.color = hasItem ? FilledSlotColor : EmptySlotColor;
            }
        }
        
        /// <summary>
        /// Updates the quantity text display
        /// </summary>
        protected virtual void UpdateQuantityDisplay(ItemStack stack)
        {
            if (QuantityText == null) return;
            
            bool hasItem = !stack.IsEmpty;
            bool shouldShowQuantity = hasItem && stack.Item.MaxStackSize > 1;
            
            QuantityText.enabled = shouldShowQuantity;
            if (shouldShowQuantity)
            {
                QuantityText.text = stack.Quantity.ToString();
            }
        }
        
        /// <summary>
        /// Sets the key binding display text
        /// </summary>
        public virtual void SetKeyBindingText(string bindingName)
        {
            if (KeyBindingText != null)
            {
                KeyBindingText.text = bindingName;
            }
        }
        
        /// <summary>
        /// Sets the selected state of this slot
        /// </summary>
        public virtual void SetSelected(bool selected)
        {
            if (SelectedIndicator != null)
            {
                SelectedIndicator.enabled = selected;
                
                if (selected)
                {
                    SelectedIndicator.color = SelectedColor;
                }
            }
        }
        
        /// <summary>
        /// Called when the slot is clicked
        /// </summary>
        protected virtual void OnSlotClicked()
        {
            if (_parentHotbar != null)
            {
                _parentHotbar.OnSlotActionTriggered(_slotIndex);
            }
        }
        
        /// <summary>
        /// Uses the item in this slot
        /// </summary>
        public virtual void UseItem()
        {
            if (_parentHotbar != null)
            {
                _parentHotbar.SwitchSlotItem(_slotIndex);
            }
        }
    }
}
