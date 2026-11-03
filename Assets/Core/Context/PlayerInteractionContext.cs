using VContainer;
using System;
using Character;
using Core.Dialogue.Vulcanus;
using Core.Location;
using Core.TimeAndWeather;
using Core.Events;
using Core.Tile;
using Interaction;
using Interaction.Pointer;
using UI.Shared;

namespace Core.Context
{
    public class PlayerInteractionContext : Core.GameManager,
        ILocationLifecycle, IEventListener<PointerInteractableChangedEvent>, IEventListener<TileDataUnderPointerChangedEvent>
    {
        [Inject] private UrGUIManager _urGUIManager;

        [Inject] private LocationContext _locationContext;
        [Inject] private UrTimeManager _urTimeManager;
        private AbstractInteractable _hoveredInteractable;
        private TileData _hoveredTile;

        public PlayerInteractionContextSnapshot CurrentSnapshot { get; private set; } =
            PlayerInteractionContextSnapshot.Empty();

        public event Action<PlayerInteractionContextSnapshot> OnContextChanged;
        public event Action<InteractionMode> OnModeChanged;

        protected override void OnEnable()
        {
            base.OnEnable();
            this.Subscribe<PointerInteractableChangedEvent>();
            this.Subscribe<TileDataUnderPointerChangedEvent>();
            _urGUIManager.InteractionStateChanged += Refresh;
        }
        protected override void OnDisable()
        {
            _urGUIManager.InteractionStateChanged -= Refresh;
            this.Unsubscribe<PointerInteractableChangedEvent>();
            this.Unsubscribe<TileDataUnderPointerChangedEvent>();
            base.OnDisable();
        }
        public void OnEvent(PointerInteractableChangedEvent change) => _hoveredInteractable = change.Interactable;
        public void OnEvent(TileDataUnderPointerChangedEvent change) => _hoveredTile = change.TileData;

        public void OnLocationEnter(LocationData location) => this.enabled = true;
        public void OnLocationLeave(LocationData location) { }

        private void Start() => UpdateContextSnapshot();

        public void Refresh() => UpdateContextSnapshot();

        private void UpdateContextSnapshot()
        {
            var character = MainCharacter.CurrentMainCharacter;
            // e.g. during scene transitions, the character reference may be null. In that case, reset to an empty snapshot
            // instead of null so listeners can handle the cleared state safely.
            var snapshot = !character
                ? PlayerInteractionContextSnapshot.Empty() with { WorldInteractionBlocked = _urGUIManager.IsWorldInteractionBlocked }
                : PlayerInteractionContextSnapshot.Create(
                    _locationContext.SceneReady,
                    character,
                    character.CurrentInteractable,
                    _hoveredTile,
                    _hoveredInteractable,
                    character.Tiles.Current,
                    character.CurrentTool,
                    character.CurrentlyHeldItem,
                    character.ConditionState,
                    character.MovementState,
                    ResolveCurrentConversation(),
                    _urTimeManager.CurrentTime,
                    _urGUIManager.IsWorldInteractionBlocked
                );

            if (CurrentSnapshot == snapshot)
                return;

            var modeChanged = snapshot.Mode != CurrentSnapshot.Mode;
            CurrentSnapshot = snapshot;
            if (modeChanged)
            {
                OnModeChanged?.Invoke(snapshot.Mode);
            }

            OnContextChanged?.Invoke(CurrentSnapshot);
        }

        private void LateUpdate()
        {
            UpdateContextSnapshot();
        }

        private static string ResolveCurrentConversation()
        {
            return VulcanusDialogueRunner.Instance != null
                ? VulcanusDialogueRunner.Instance.CurrentDialogueId
                : null;
        }
    }
}
