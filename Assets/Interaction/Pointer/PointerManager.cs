using Core;
using Core.Context;
using Core.Events;
using Core.Location;
using Core.Tile;
using Interaction.Dialogue;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Interaction.Pointer
{
    public class PointerManager : Singleton<PointerManager>, ILocationLifecycle
    {
        public PointerMode CurrentPointerMode { get; private set; } = PointerMode.Default;

        [SerializeField] protected Texture2D defaultCursor;
        [SerializeField] protected Texture2D giftItemCursor;
        [SerializeField] protected Texture2D placeItemCursor;
        [SerializeField] protected Texture2D dialogueCursor;
        [SerializeField] protected Vector2 cursorHotspot = Vector2.zero;

        private LayerMask _interactableLayerMask;
        private bool _hasAppliedCursor;
        private PointerMode _appliedPointerMode;

        public AbstractInteractable CurrentInteractableUnderPointer { get; private set; }
        public TileData CurrentTileDataUnderPointer { get; private set; }

#if UNITY_EDITOR
        private bool _isMouseOverGameView = true;
        private bool _suppressCustomCursor;
#endif

        protected override void Awake()
        {
            base.Awake();
            _interactableLayerMask = LayerMask.GetMask("Interactable");
            Cursor.lockState = CursorLockMode.Confined;
        }

        private void OnEnable()
        {
            PlayerInteractionContext.Instance.OnContextChanged += HandleContextChange;
            LevelManager.Instance?.RegisterLifecycle(this);
        }

        private void OnDisable()
        {
            PlayerInteractionContext.Instance.OnContextChanged -= HandleContextChange;
            Cursor.SetCursor(null, Vector2.zero, UnityEngine.CursorMode.Auto);
            Cursor.visible = true;
            Cursor.lockState = CursorLockMode.None;
            LevelManager.Instance?.UnregisterLifecycle(this);
        }

        public void OnLocationEnter(LocationData location)
        {
            this.enabled = true;
        }

        public void OnLocationLeave(LocationData location)
        {
            CurrentInteractableUnderPointer = null;
            CurrentTileDataUnderPointer = null;
            PointerInteractableChangedEvent.Trigger(null);
            TileDataUnderPointerChangedEvent.Trigger(null);
        }

        private void HandleContextChange(PlayerInteractionContextSnapshot snapshot)
        {
            var mode = snapshot.Mode;
            switch (mode)
            {
                case InteractionMode.PlantSeed:
                    SetCursorMode(PointerMode.PlaceItems);
                    break;
                case InteractionMode.Interact:
                    SetCursorMode(PointerMode.Dialogue);
                    break;
                case InteractionMode.Gift:
                    SetCursorMode(PointerMode.GiftItems);
                    break;
                case InteractionMode.Tool:
                    SetCursorMode(PointerMode.UseTool);
                    break;
                case InteractionMode.DialogueReady:
                    if (snapshot.ActionableInteractable is ShowVulcanusDialogueInteractable)
                    {
                        SetCursorMode(PointerMode.Dialogue);
                        break;
                    }
                    goto default;
                default:
                    SetCursorMode(PointerMode.Default);
                    break;
            }
        }

        private void SetCursorMode(PointerMode pointerMode)
        {
            CurrentPointerMode = pointerMode;
            ApplyCursorMode(pointerMode);
        }

        private void ApplyCursorMode(PointerMode pointerMode, bool force = false)
        {
#if UNITY_EDITOR
            if (_suppressCustomCursor && !force)
            {
                return;
            }
#endif

            if (!force && _hasAppliedCursor && _appliedPointerMode == pointerMode)
            {
                return;
            }

            Texture2D cursorTexture;
            switch (pointerMode)
            {
                case PointerMode.PlaceItems:
                    cursorTexture = placeItemCursor;
                    break;
                case PointerMode.GiftItems:
                    cursorTexture = giftItemCursor;
                    break;
                case PointerMode.Dialogue:
                    cursorTexture = dialogueCursor;
                    break;
                case PointerMode.Default:
                case PointerMode.UseTool:
                default:
                    cursorTexture = defaultCursor;
                    break;
            }

            Cursor.SetCursor(cursorTexture, cursorHotspot, UnityEngine.CursorMode.Auto);
            Cursor.visible = true;
            _appliedPointerMode = pointerMode;
            _hasAppliedCursor = true;
        }

        private void Update()
        {
            if (LevelManager.Instance == null || !LevelManager.Instance.SceneReady || Camera.main == null) return;

            var mouseScreenPos = Mouse.current.position.ReadValue();

#if UNITY_EDITOR
            bool inGameView = mouseScreenPos.x >= 0 && mouseScreenPos.x <= Screen.width &&
                              mouseScreenPos.y >= 0 && mouseScreenPos.y <= Screen.height;
            if (!inGameView)
            {
                if (_isMouseOverGameView)
                {
                    Cursor.SetCursor(null, Vector2.zero, UnityEngine.CursorMode.Auto);
                    _isMouseOverGameView = false;
                    _suppressCustomCursor = true;
                }
                return;
            }
            if (!_isMouseOverGameView)
            {
                _isMouseOverGameView = true;
                _suppressCustomCursor = false;
                ApplyCursorMode(CurrentPointerMode, true);
            }
#endif

            var worldPos = Camera.main.ScreenToWorldPoint(mouseScreenPos);

            var tileData = MapManager.Instance.GetTileDataAtWorldPosition(worldPos);
            if (tileData != CurrentTileDataUnderPointer)
            {
                CurrentTileDataUnderPointer = tileData;
                TileDataUnderPointerChangedEvent.Trigger(tileData);
            }

            var ray = Camera.main.ScreenPointToRay(mouseScreenPos);
            var raycastHit = Physics2D.GetRayIntersection(ray, Mathf.Infinity, _interactableLayerMask);

            var interactable = raycastHit.collider != null
                ? raycastHit.collider.GetComponentInParent<AbstractInteractable>()
                : null;
            if (interactable && !interactable.CanInteract)
                interactable = null;
            if (interactable != CurrentInteractableUnderPointer)
            {
                CurrentInteractableUnderPointer = interactable;
                PointerInteractableChangedEvent.Trigger(interactable);
            }
        }
    }
}
