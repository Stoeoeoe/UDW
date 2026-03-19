using MoreMountains.InventoryEngine;
using MoreMountains.Tools;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UI.InventoryScreen
{
    /// <summary>
    /// Displays the currently held item next to the cursor.
    /// Follows the mouse position and shows the item icon and quantity.
    /// </summary>
    public class InventoryHeldItemDisplay : MonoBehaviour, MMEventListener<InventoryHeldItemEvent>
    {
        [Header("Components")]
        [Tooltip("The image that displays the held item's icon")]
        public Image ItemIcon;

        [Tooltip("Text component for displaying quantity")]
        public TMP_Text QuantityText;

        [Header("Settings")]
        [Tooltip("Offset from the cursor position")]
        public Vector2 CursorOffset = new Vector2(20f, -20f);

        [Tooltip("Canvas for proper coordinate conversion")]
        public Canvas ParentCanvas;

        // Current state
        protected InventoryItem _currentHeldItem;
        protected int _currentQuantity;
        protected RectTransform _rectTransform;
        protected CanvasGroup _canvasGroup;
        protected Camera _uiCamera;

        /// <summary>
        /// The currently held item
        /// </summary>
        public InventoryItem CurrentHeldItem => _currentHeldItem;

        /// <summary>
        /// The quantity of the held item
        /// </summary>
        public int CurrentQuantity => _currentQuantity;

        /// <summary>
        /// Whether an item is currently being held
        /// </summary>
        public bool IsHoldingItem => !InventoryItem.IsNull(_currentHeldItem);

        protected virtual void Awake()
        {
            _rectTransform = GetComponent<RectTransform>();
            _canvasGroup = GetComponent<CanvasGroup>();

            if (_canvasGroup == null)
            {
                _canvasGroup = gameObject.AddComponent<CanvasGroup>();
            }

            // Find the parent canvas if not set
            if (ParentCanvas == null)
            {
                ParentCanvas = GetComponentInParent<Canvas>();
            }

            // Determine if we need a camera for coordinate conversion
            if (ParentCanvas != null && ParentCanvas.renderMode != RenderMode.ScreenSpaceOverlay)
            {
                _uiCamera = ParentCanvas.worldCamera;
            }

            // Hide initially
            SetVisible(false);
        }

        protected virtual void OnEnable()
        {
            this.MMEventStartListening();
        }

        protected virtual void OnDisable()
        {
            this.MMEventStopListening();
        }

        protected virtual void Update()
        {
            if (IsHoldingItem)
            {
                FollowCursor();
            }
        }

        /// <summary>
        /// Updates the position to follow the cursor
        /// </summary>
        protected virtual void FollowCursor()
        {
            Vector2 mousePosition = Mouse.current.position.value;

            if (ParentCanvas != null)
            {
                RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    ParentCanvas.transform as RectTransform,
                    mousePosition,
                    _uiCamera,
                    out Vector2 localPoint);

                _rectTransform.anchoredPosition = localPoint + CursorOffset;
            }
            else
            {
                _rectTransform.position = mousePosition + CursorOffset;
            }
        }

        /// <summary>
        /// Sets the held item to display
        /// </summary>
        public virtual void SetHeldItem(InventoryItem item, int quantity)
        {
            _currentHeldItem = item;
            _currentQuantity = quantity;

            if (!InventoryItem.IsNull(item))
            {
                // Update icon
                if (ItemIcon != null)
                {
                    ItemIcon.sprite = item.Icon;
                    ItemIcon.enabled = true;
                }

                // Update quantity text
                if (QuantityText != null)
                {
                    QuantityText.enabled = quantity > 1;
                    QuantityText.text = quantity.ToString();
                }

                SetVisible(true);
            }
            else
            {
                ClearHeldItem();
            }
        }

        /// <summary>
        /// Clears the currently held item
        /// </summary>
        public virtual void ClearHeldItem()
        {
            _currentHeldItem = null;
            _currentQuantity = 0;

            SetVisible(false);
        }

        /// <summary>
        /// Sets the visibility of the held item display
        /// </summary>
        protected virtual void SetVisible(bool visible)
        {
            if (_canvasGroup != null)
            {
                _canvasGroup.alpha = visible ? 1f : 0f;
                _canvasGroup.blocksRaycasts = false; // Never block raycasts
                _canvasGroup.interactable = false;
            }

            if (ItemIcon != null)
            {
                ItemIcon.enabled = visible;
            }

            if (QuantityText != null && !visible)
            {
                QuantityText.enabled = false;
            }
        }

        /// <summary>
        /// Responds to held item events
        /// </summary>
        public void OnMMEvent(InventoryHeldItemEvent eventData)
        {
            if (!InventoryItem.IsNull(eventData.HeldItem))
            {
                SetHeldItem(eventData.HeldItem, eventData.Quantity);
            }
            else
            {
                ClearHeldItem();
            }
        }
    }
}

