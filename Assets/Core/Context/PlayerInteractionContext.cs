using System;
using Character;
using Core.Location;
using Core.TimeAndWeather;
using Interaction.Pointer;

namespace Core.Context
{
    public class PlayerInteractionContext : Singleton<PlayerInteractionContext>,
        ILocationLifecycle
    {
        public PlayerInteractionContextSnapshot CurrentSnapshot { get; private set; } =
            PlayerInteractionContextSnapshot.Empty();

        public event Action<PlayerInteractionContextSnapshot> OnContextChanged;
        public event Action<InteractionMode> OnModeChanged;

        void OnEnable() => LevelManager.Instance?.RegisterLifecycle(this);
        void OnDisable() => LevelManager.Instance?.UnregisterLifecycle(this);

        public void OnLocationEnter(LocationData location) => this.enabled = true;
        public void OnLocationLeave(LocationData location) { }

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
                LevelManager.Instance.SceneReady,
                character,
                character?.CurrentInteractable,
                PointerManager.Instance.CurrentTileDataUnderPointer,
                PointerManager.Instance.CurrentInteractableUnderPointer,
                character?.CurrentTileData,
                character?.CurrentTool,
                character?.CurrentlyHeldItem,
                character?.ConditionState,
                character?.MovementState,
                UrDialogueManager.Instance.CurrentConversation,
                (UrTimeManager.Instance)?.CurrentTime
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