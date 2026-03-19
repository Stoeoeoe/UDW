using MoreMountains.InventoryEngine;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UI.InventoryScreen
{
    /// <summary>
    /// Individual inventory slot that displays an item icon and quantity.
    /// Handles click interactions for picking up and placing items.
    /// </summary>
    public class UrInventorySlot : MonoBehaviour, IPointerClickHandler
    {
        [Header("Visual Components")]
        [Tooltip("The image component that displays the item icon")]
        public Image IconImage;

        [Tooltip("The background image of the slot")]
        public Image BackgroundImage;

        [Tooltip("The image shown when this slot is selected/highlighted")]
        public Image HighlightImage;

        [Header("Text Components")]
        [Tooltip("TextMeshPro component for displaying item quantity")]
        public TMP_Text QuantityText;

        [Header("Colors")]
        [Tooltip("Color for empty slot background")]
        public Color EmptySlotColor = new Color(0.2f, 0.2f, 0.2f, 0.5f);

        [Tooltip("Color for filled slot background")]
        public Color FilledSlotColor = new Color(0.3f, 0.3f, 0.3f, 0.8f);

        [Tooltip("Color for highlighted slot")]
        public Color HighlightColor = new Color(1f, 0.8f, 0f, 0.5f);

        // Protected properties
        protected UrInventoryDisplay _parentDisplay;
        protected int _slotIndex;
        protected InventoryItem _currentItem;

        /// <summary>
        /// The current item in this slot
        /// </summary>
        public InventoryItem CurrentItem => _currentItem;

        /// <summary>
        /// The slot index in the inventory
        /// </summary>
        public int SlotIndex => _slotIndex;

        /// <summary>
        /// Initialize the slot with parent display reference and index
        /// </summary>
        public virtual void Initialize(UrInventoryDisplay parentDisplay, int slotIndex)
        {
            _parentDisplay = parentDisplay;
            _slotIndex = slotIndex;

            // Initialize visual state
            SetHighlighted(false);
            UpdateDisplay(null);
        }

        /// <summary>
        /// Updates the slot's visual display based on the item
        /// </summary>
        public virtual void UpdateDisplay(InventoryItem item)
        {
            _currentItem = item;

            bool hasItem = !InventoryItem.IsNull(item);

            // Update icon
            if (IconImage != null)
            {
                IconImage.enabled = hasItem;

                if (hasItem)
                {
                    IconImage.sprite = item.Icon;
                    IconImage.color = Color.white;
                }
            }

            // Update quantity
            UpdateQuantityDisplay(item);

            // Update background
            if (BackgroundImage != null)
            {
                BackgroundImage.color = hasItem ? FilledSlotColor : EmptySlotColor;
            }
        }

        /// <summary>
        /// Updates the quantity text display
        /// </summary>
        protected virtual void UpdateQuantityDisplay(InventoryItem item)
        {
            if (QuantityText == null) return;

            bool hasItem = !InventoryItem.IsNull(item);
            bool shouldShowQuantity = hasItem && item.Quantity > 1;

            QuantityText.enabled = shouldShowQuantity;
            if (shouldShowQuantity)
            {
                QuantityText.text = item.Quantity.ToString();
            }
        }

        /// <summary>
        /// Sets the highlighted state of this slot
        /// </summary>
        public virtual void SetHighlighted(bool highlighted)
        {
            if (HighlightImage != null)
            {
                HighlightImage.enabled = highlighted;
                if (highlighted)
                {
                    HighlightImage.color = HighlightColor;
                }
            }
        }

        /// <summary>
        /// Called when the slot is clicked (implements IPointerClickHandler)
        /// </summary>
        public virtual void OnPointerClick(PointerEventData eventData)
        {
            if (_parentDisplay == null) return;

            if (eventData.button == PointerEventData.InputButton.Left)
            {
                _parentDisplay.OnSlotLeftClicked(_slotIndex);
            }
            else if (eventData.button == PointerEventData.InputButton.Right)
            {
                _parentDisplay.OnSlotRightClicked(_slotIndex);
            }
        }
    }
}

