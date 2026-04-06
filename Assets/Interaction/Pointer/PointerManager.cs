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

        public AbstractInteractable CurrentInteractableUnderPointer { get; private set; }
        public TileData CurrentTileDataUnderPointer { get; private set; }

        protected override void Awake()
        {
            base.Awake();
            _interactableLayerMask = LayerMask.GetMask("Interactable");
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
            LevelManager.Instance?.UnregisterLifecycle(this);
        }

        public void OnLocationEnter(LocationData location)
        {
            this.enabled = true;
        }

        public void OnLocationLeave(LocationData location) { }

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
                    if (snapshot.CurrentInteractable is ShowDialogueInteractable)
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

            switch (pointerMode)
            {
                case PointerMode.Default:
                    ApplyCursorSprite(defaultCursor);
                    break;
                case PointerMode.PlaceItems:
                    ApplyCursorSprite(placeItemCursor);
                    break;
                case PointerMode.GiftItems:
                    ApplyCursorSprite(giftItemCursor);
                    break;
                case PointerMode.UseTool:
                    ApplyCursorSprite(defaultCursor);
                    break;
                case PointerMode.Dialogue:
                    ApplyCursorSprite(dialogueCursor);
                    break;
            }
        }

        private void ApplyCursorSprite(Texture2D cursorTexture)
        {
            Cursor.SetCursor(cursorTexture, cursorHotspot, UnityEngine.CursorMode.Auto);
            Cursor.visible = true;
        }

        private void Update()
        {
            if (Camera.main == null) return;

            var mouseScreenPos = Mouse.current.position.ReadValue();
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
                ? raycastHit.collider.GetComponent<AbstractInteractable>()
                : null;
            if (interactable != CurrentInteractableUnderPointer)
            {
                CurrentInteractableUnderPointer = interactable;
                PointerInteractableChangedEvent.Trigger(interactable);
            }
        }
    }
}