using Core;
using Core.Context;
using Core.Location;
using Core.Tile;
using Interaction.Dialogue;
using UnityEngine;
using UnityEngine.InputSystem;
using PixelPerfectCamera = UnityEngine.Rendering.Universal.PixelPerfectCamera;
using VContainer;

namespace Interaction.Pointer
{
    public class PointerManager : GameManager, ILocationLifecycle
    {
        [Inject] private PlayerInteractionContext _playerInteractionContext;
        [Inject] private LocationContext _locationContext;
        [Inject] private MapManager _mapManager;
        [Inject] private CharacterManager _characterManager;

        public PointerMode CurrentPointerMode { get; private set; } = PointerMode.Default;

        [SerializeField] protected Texture2D defaultCursor;
        [SerializeField] protected Texture2D giftItemCursor;
        [SerializeField] protected Texture2D placeItemCursor;
        [SerializeField] protected Texture2D dialogueCursor;
        [Tooltip("Pixel in the cursor image that points, counted from its top-left corner.")]
        [SerializeField] protected Vector2 cursorHotspot = Vector2.zero;
        [Tooltip("Cursor size relative to the game's pixel scale: 1 draws one cursor pixel as large as one art " +
                 "pixel in the world. Always rounded to whole screen pixels, so the cursor stays crisp.")]
        [SerializeField, Range(0.25f, 2f)] private float cursorScale = 0.5f;

        // The game draws its own pointer: the operating system scales hardware cursors to its own size.
        private Texture2D _cursorTexture;
        private bool _drawCursor;

        public AbstractInteractable CurrentInteractableUnderPointer { get; private set; }
        public TileData CurrentTileDataUnderPointer { get; private set; }

        protected override void Awake()
        {
            base.Awake();
            Cursor.lockState = CursorLockMode.Confined;
        }

        protected override void OnEnable()
        {
            base.OnEnable();
            _playerInteractionContext.OnContextChanged += HandleContextChange;
        }

        protected override void OnDisable()
        {
            _playerInteractionContext.OnContextChanged -= HandleContextChange;
            _drawCursor = false;
            Cursor.visible = true;
            Cursor.lockState = CursorLockMode.None;
            base.OnDisable();
        }

        public void OnLocationEnter(LocationData location)
        {
            enabled = true;
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
            if (snapshot.WorldInteractionBlocked)
            {
                if (CurrentInteractableUnderPointer != null)
                {
                    CurrentInteractableUnderPointer = null;
                    PointerInteractableChangedEvent.Trigger(null);
                }
                if (CurrentTileDataUnderPointer != null)
                {
                    CurrentTileDataUnderPointer = null;
                    TileDataUnderPointerChangedEvent.Trigger(null);
                }
            }
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
            _cursorTexture = pointerMode switch
            {
                PointerMode.PlaceItems => placeItemCursor,
                PointerMode.GiftItems => giftItemCursor,
                PointerMode.Dialogue => dialogueCursor,
                _ => defaultCursor
            };
        }

        private static bool IsMouseOverGame(Vector2 position) =>
            position.x >= 0 && position.x <= Screen.width && position.y >= 0 && position.y <= Screen.height;

        // Runs in menus too, where world hovering stops. The system cursor shows only outside the game view (Editor).
        private void LateUpdate()
        {
            _drawCursor = IsMouseOverGame(Mouse.current.position.ReadValue());
            Cursor.visible = !_drawCursor;
        }

        private void OnGUI()
        {
            if (!_drawCursor || Event.current.type != EventType.Repaint) return;
            var texture = _cursorTexture ? _cursorTexture : defaultCursor;
            var scale = Mathf.Max(1, Mathf.RoundToInt(PixelScale() * cursorScale));
            var position = Mouse.current.position.ReadValue();
            GUI.depth = int.MinValue; // Above every other IMGUI drawing; IMGUI draws after all other UI.
            GUI.DrawTexture(new Rect(position.x - cursorHotspot.x * scale, Screen.height - position.y - cursorHotspot.y * scale,
                texture.width * scale, texture.height * scale), texture);
        }

        // Screen pixels per art pixel; SystemRoot's main camera is pixel perfect.
        private static int PixelScale() => Camera.main.GetComponent<PixelPerfectCamera>().pixelRatio;

        private void Update()
        {
            if (_playerInteractionContext.CurrentSnapshot.WorldInteractionBlocked) return;
            if (!_locationContext.SceneReady || Camera.main == null) return;

            var mouseScreenPos = Mouse.current.position.ReadValue();
            if (!IsMouseOverGame(mouseScreenPos)) return;

            var worldPos = Camera.main.ScreenToWorldPoint(mouseScreenPos);

            var tileData = _mapManager.GetTileDataAtWorldPosition(worldPos);
            if (tileData != CurrentTileDataUnderPointer)
            {
                CurrentTileDataUnderPointer = tileData;
                TileDataUnderPointerChangedEvent.Trigger(tileData);
            }

            var player = _characterManager.MainCharacter;
            var interactable = player ? player.InteractionSensor.FindUnderPointer(worldPos) : null;
            if (interactable != CurrentInteractableUnderPointer)
            {
                CurrentInteractableUnderPointer = interactable;
                PointerInteractableChangedEvent.Trigger(interactable);
            }
        }
    }
}
