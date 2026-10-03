using System;
using Character;
using Core.Dialogue.Vulcanus;
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
            // e.g. during scene transitions, the character reference may be null. In that case, reset to an empty snapshot
            // instead of null so listeners can handle the cleared state safely.
            var snapshot = !character
                ? PlayerInteractionContextSnapshot.Empty()
                : PlayerInteractionContextSnapshot.Create(
                    LevelManager.Instance != null && LevelManager.Instance.SceneReady,
                    character,
                    character.CurrentInteractable,
                    PointerManager.Instance != null ? PointerManager.Instance.CurrentTileDataUnderPointer : null,
                    PointerManager.Instance != null ? PointerManager.Instance.CurrentInteractableUnderPointer : null,
                    character.CurrentTileData,
                    character.CurrentTool,
                    character.CurrentlyHeldItem,
                    character.ConditionState,
                    character.MovementState,
                    ResolveCurrentConversation(),
                    (UrTimeManager.Instance)?.CurrentTime
                );

            if (CurrentSnapshot == snapshot)
                return;

            if (snapshot.Mode != CurrentSnapshot.Mode)
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

        private static string ResolveCurrentConversation()
        {
            return VulcanusDialogueRunner.Instance != null
                ? VulcanusDialogueRunner.Instance.CurrentDialogueId
                : null;
        }
    }
}
