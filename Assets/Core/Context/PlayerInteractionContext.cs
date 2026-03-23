using System;
using Character;
using Core.Events;
using Core.Location;
using Interaction.Pointer;

namespace Core.Context
{
    public class PlayerInteractionContext : Singleton<PlayerInteractionContext>,
        IEventListener<SceneReadyEvent>
    {
        public PlayerInteractionContextSnapshot CurrentSnapshot { get; private set; } =
            PlayerInteractionContextSnapshot.Empty();

        public event Action<PlayerInteractionContextSnapshot> OnContextChanged;
        public event Action<InteractionMode> OnModeChanged;

        void OnEnable()  => this.Subscribe<SceneReadyEvent>();
        void OnDisable() => this.Unsubscribe<SceneReadyEvent>();

        public void OnEvent(SceneReadyEvent e) => this.enabled = true;

        private void Start()
        {
            UpdateContextSnapshot();
        }

        private void UpdateContextSnapshot()
        {
            var character = MainCharacter.CurrentMainCharacter;
            // e.g. during scene transitions, the character reference may be null. In that case, we want to reset the snapshot to empty.
            if (!character)
            {
                CurrentSnapshot = null;
                return;
            }


            var snapshot = PlayerInteractionContextSnapshot.Create(
                character,
                character?.CurrentInteractable,
                PointerManager.Instance.CurrentTileDataUnderPointer,
                PointerManager.Instance.CurrentInteractableUnderPointer,
                character?.CurrentTileData,
                character?.CurrentTool,
                character?.CurrentlyHeldItem,
                character?.ConditionState,
                character?.MovementState,
                UrDialogueManager.Instance.CurrentConversation
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
    }
}