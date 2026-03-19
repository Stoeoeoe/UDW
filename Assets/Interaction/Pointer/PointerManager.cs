using System;
using Core;
using Core.Context;
using Core.Equipment;
using Core.Tile;
using Interaction.Dialogue;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Interaction.Pointer
{
    public class PointerManager : MMSingleton<PointerManager>, MMEventListener<TopDownEngineEvent>
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
            PlayerInteractionContext.Current.OnContextChanged += HandleContextChange;
            this.MMEventStartListening();
        }

        private void OnDisable()
        {
            PlayerInteractionContext.Current.OnContextChanged -= HandleContextChange;
            // Reset cursor to default and make it visible when this manager is disabled
            Cursor.SetCursor(null, Vector2.zero, UnityEngine.CursorMode.Auto);
            Cursor.visible = true;
            this.MMEventStopListening();
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
                    if (snapshot.InteractableInFront is ShowDialogueInteractable)
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

            // MapManager.Current.StopHighlightingTilesAroundCursor();
            switch (pointerMode)
            {
                case PointerMode.Default:
                    ApplyCursorSprite(defaultCursor);
                    break;
                case PointerMode.PlaceItems:
                    ApplyCursorSprite(placeItemCursor);
                    // MapManager.Current.StartHighlightingTilesAroundCursor();
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

            // Check tile
            var tileData = MapManager.Current.GetTileDataAtWorldPosition(worldPos);
            if (tileData != CurrentTileDataUnderPointer)
            {
                CurrentTileDataUnderPointer = tileData;
                TileDataUnderPointerChangedEvent.Trigger(tileData);
            }

            // Check for interactables
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


        public void OnMMEvent(TopDownEngineEvent eventType)
        {
            if (eventType.EventType == TopDownEngineEventTypes.LevelEnd)
            {
                this.enabled = false;
            }
            else if (eventType.EventType == TopDownEngineEventTypes.LevelStart)
            {
                this.enabled = true;
            }
        }
    }
}