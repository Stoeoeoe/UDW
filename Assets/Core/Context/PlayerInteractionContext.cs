using System;
using Core.Dialogue.Vulcanus;
using Core.Events;
using Core.Location;
using Core.TimeAndWeather;
using Core.Tile;
using Interaction;
using Interaction.Pointer;
using UI.Shared;
using VContainer.Unity;

namespace Core.Context
{
    /// <summary>Builds the registered player's interaction snapshot once per frame and when screen state changes.</summary>
    public sealed class PlayerInteractionContext : ILateTickable, IDisposable,
        IEventListener<PointerInteractableChangedEvent>, IEventListener<TileDataUnderPointerChangedEvent>
    {
        private readonly UrGUIManager _gui;
        private readonly LocationContext _location;
        private readonly CharacterManager _characters;
        private readonly GameClock _clock;
        private readonly VulcanusDialogueRunner _dialogue;
        private AbstractInteractable _hoveredInteractable;
        private TileData _hoveredTile;

        public PlayerInteractionContext(UrGUIManager gui, LocationContext location, CharacterManager characters, GameClock clock,
            VulcanusDialogueRunner dialogue)
        {
            _gui = gui;
            _location = location;
            _characters = characters;
            _clock = clock;
            _dialogue = dialogue;
            this.Subscribe<PointerInteractableChangedEvent>();
            this.Subscribe<TileDataUnderPointerChangedEvent>();
            _gui.InteractionStateChanged += Refresh;
        }

        public PlayerInteractionContextSnapshot CurrentSnapshot { get; private set; } =
            PlayerInteractionContextSnapshot.Empty();

        public event Action<PlayerInteractionContextSnapshot> OnContextChanged;
        public event Action<InteractionMode> OnModeChanged;

        public void OnEvent(PointerInteractableChangedEvent change) => _hoveredInteractable = change.Interactable;
        public void OnEvent(TileDataUnderPointerChangedEvent change) => _hoveredTile = change.TileData;

        public void LateTick() => Refresh();

        public void Dispose()
        {
            _gui.InteractionStateChanged -= Refresh;
            this.Unsubscribe<PointerInteractableChangedEvent>();
            this.Unsubscribe<TileDataUnderPointerChangedEvent>();
        }

        /// <summary>Rebuilds the snapshot now, notifying listeners only when it differs from the previous one.</summary>
        public void Refresh()
        {
            var character = _characters.MainCharacter;
            // During scene transitions there is no registered player. Reset to an empty snapshot rather than null
            // so listeners can handle the cleared state safely.
            var snapshot = !character
                ? PlayerInteractionContextSnapshot.Empty() with { WorldInteractionBlocked = _gui.IsWorldInteractionBlocked }
                : PlayerInteractionContextSnapshot.Create(
                    _location.SceneReady,
                    character,
                    character.CurrentInteractable,
                    _hoveredTile,
                    _hoveredInteractable,
                    character.Tiles.Current,
                    character.CurrentTool,
                    character.CurrentlyHeldItem,
                    character.ConditionState,
                    character.MovementState,
                    _dialogue.CurrentDialogueId,
                    _clock.CurrentTime,
                    _gui.IsWorldInteractionBlocked
                );

            if (CurrentSnapshot == snapshot)
                return;

            var modeChanged = snapshot.Mode != CurrentSnapshot.Mode;
            CurrentSnapshot = snapshot;
            if (modeChanged)
                OnModeChanged?.Invoke(snapshot.Mode);

            OnContextChanged?.Invoke(CurrentSnapshot);
        }
    }
}
