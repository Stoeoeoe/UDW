using System;
using Character;
using Core.Equipment;
using Core.Tile;
using Interaction;
using Interaction.Pointer;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;

namespace Core.Context
{
    
    /// <summary>
    /// Old version of the context that uses event listeners, may be more efficient than polling every frame.
    /// Will keep for reference or until it's clear that the other version doesn't cause performance issues.
    /// </summary>
    public class OLD_EventDrivenPlayerInteractionContext : MMSingleton<PlayerInteractionContext>,
        MMEventListener<PointerInteractableChangedEvent>,
        MMEventListener<ItemSelectedEvent>,
        MMEventListener<InteractableChangedEvent>,
        MMEventListener<CharacterChangedTileEvent>,
        MMEventListener<MainCharacterChangedEvent>,
        MMEventListener<TileDataUnderPointerChangedEvent>
    // TODO: Tool changed
    // TODO: Dialogue
    // TODO: Pause
    {
        public PlayerInteractionContextSnapshot CurrentSnapshot { get; private set; } =
            PlayerInteractionContextSnapshot.Empty();

        public event Action<PlayerInteractionContextSnapshot> OnContextChanged;
        public event Action<InteractionMode> OnModeChanged;


        private readonly InteractionModeResolver _resolver = new();

        private void Start()
        {
            UpdateContextSnapshot();
        }

        private void UpdateContextSnapshot()
        {
            var currentMainCharacter = MainCharacter.CurrentMainCharacter;

            var snapshot = new PlayerInteractionContextSnapshot(
                currentMainCharacter,
                currentMainCharacter?.CurrentInteractable,
                PointerManager.Current.CurrentTileDataUnderPointer,
                PointerManager.Current.CurrentInteractableUnderPointer,
                currentMainCharacter?.CurrentTileData,
                // currentMainCharacter?.CurrentTool,
                currentMainCharacter?.CurrentTool,
                currentMainCharacter?.CurrentlyHeldItem,
                currentMainCharacter?.ConditionState.CurrentState,
                currentMainCharacter?.MovementState.CurrentState,
                UrDialogueManager.Current.CurrentConversation,
                default
            );

            if (CurrentSnapshot != null && CurrentSnapshot == snapshot)
                return;

            var mode = InteractionModeResolver.Resolve(snapshot);
            if (CurrentSnapshot != null && mode != CurrentSnapshot.Mode)
            {
                OnModeChanged?.Invoke(mode);
            }

            // TODO: Maybe do in one step, snapshot should not be mutable
            //CurrentSnapshot = snapshot.WithMode(mode);
            OnContextChanged?.Invoke(CurrentSnapshot);
        }

        public void OnEnable()
        {
            this.MMEventStartListening<PointerInteractableChangedEvent>();
            this.MMEventStartListening<ItemSelectedEvent>();
            this.MMEventStartListening<CharacterChangedTileEvent>();
            this.MMEventStartListening<InteractableChangedEvent>();
            this.MMEventStartListening<MainCharacterChangedEvent>();
            this.MMEventStartListening<TileDataUnderPointerChangedEvent>();
        }

        public void OnDisable()
        {
            this.MMEventStopListening<PointerInteractableChangedEvent>();
            this.MMEventStopListening<ItemSelectedEvent>();
            this.MMEventStopListening<CharacterChangedTileEvent>();
            this.MMEventStopListening<InteractableChangedEvent>();
            this.MMEventStopListening<MainCharacterChangedEvent>();
            this.MMEventStopListening<TileDataUnderPointerChangedEvent>();
            
            // TODO: May not be the same character
            MainCharacter.CurrentMainCharacter.ConditionState.OnStateChange -= UpdateContextSnapshot;
            MainCharacter.CurrentMainCharacter.MovementState.OnStateChange -= UpdateContextSnapshot;
        }

        // Events that only affect the main character / world
        public void OnMMEvent(PointerInteractableChangedEvent pointerInteractableChangedEvent) =>
            UpdateContextSnapshot();

        public void OnMMEvent(ItemSelectedEvent itemSelectedEvent) => UpdateContextSnapshot();

        public void OnMMEvent(MainCharacterChangedEvent mainCharacterChangedEvent)
        {
            UpdateContextSnapshot();
            // Also start listening to state changes of that character
            mainCharacterChangedEvent.MainCharacter.ConditionState.OnStateChange += UpdateContextSnapshot;      
            mainCharacterChangedEvent.MainCharacter.MovementState.OnStateChange += UpdateContextSnapshot;
        }


        // Events that can affect any character
        public void OnMMEvent(InteractableChangedEvent interactableChangedEvent)
        {
            if (interactableChangedEvent.Character != MainCharacter.CurrentMainCharacter) return;
            UpdateContextSnapshot();
        }

        public void OnMMEvent(CharacterChangedTileEvent characterChangedTileEvent)
        {
            if (characterChangedTileEvent.Character != MainCharacter.CurrentMainCharacter) return;
            UpdateContextSnapshot();
        }


        public void OnMMEvent(TileDataUnderPointerChangedEvent eventType)
        {
            UpdateContextSnapshot();
        }

        public void OnMMEvent(MMStateChangeEvent<CharacterStates.MovementStates> movementStateEvent)
        {
            if (movementStateEvent.Target != MainCharacter.CurrentMainCharacter) return;
            UpdateContextSnapshot();
        }

        public void OnMMEvent(MMStateChangeEvent<CharacterStates.CharacterConditions> characterConditionsEvent)
        {
            if (characterConditionsEvent.Target != MainCharacter.CurrentMainCharacter) return;
            UpdateContextSnapshot();
        }
    }
}