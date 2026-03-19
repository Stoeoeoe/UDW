using System;
using Character;
using Interaction.Pointer;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;

namespace Core.Context
{
    public class PlayerInteractionContext : MMSingleton<PlayerInteractionContext>, MMEventListener<TopDownEngineEvent>
    {
        public PlayerInteractionContextSnapshot CurrentSnapshot { get; private set; } =
            PlayerInteractionContextSnapshot.Empty();

        public event Action<PlayerInteractionContextSnapshot> OnContextChanged;
        public event Action<InteractionMode> OnModeChanged;

        private void Start()
        {
            UpdateContextSnapshot();
        }

        private void UpdateContextSnapshot()
        {
            var character = MainCharacter.CurrentMainCharacter;

            var snapshot = PlayerInteractionContextSnapshot.Create(
                character,
                character?.CurrentInteractable,
                PointerManager.Current.CurrentTileDataUnderPointer,
                PointerManager.Current.CurrentInteractableUnderPointer,
                character?.CurrentTileData,
                character?.CurrentTool,
                character?.CurrentlyHeldItem,
                character?.ConditionState.CurrentState,
                character?.MovementState.CurrentState,
                UrDialogueManager.Current.CurrentConversation
            );

            if (CurrentSnapshot != null && CurrentSnapshot == snapshot)
                return;

            if (CurrentSnapshot != null && snapshot.Mode != CurrentSnapshot.Mode)
            {
                OnModeChanged?.Invoke(snapshot.Mode);
            }

            CurrentSnapshot = snapshot;
            OnContextChanged?.Invoke(CurrentSnapshot);
        }

        private void LateUpdate()
        {
            UpdateContextSnapshot();
        }

        public void OnMMEvent(TopDownEngineEvent topDownEngineEvent)
        {
            this.enabled = topDownEngineEvent.EventType switch
            {
                TopDownEngineEventTypes.Pause => false,
                TopDownEngineEventTypes.UnPause => true,
                TopDownEngineEventTypes.LevelEnd => false,
                TopDownEngineEventTypes.LevelStart => true,
                _ => this.enabled
            };
        }
    }
}