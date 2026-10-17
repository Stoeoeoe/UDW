using System;
using Character;
using Character.Animations;
using MoreMountains.Feedbacks;
using UnityEngine;

namespace Interaction
{
    /// <summary>One authored interaction position: placement, presentation settings, and its exclusive occupant.</summary>
    public sealed class InteractionSlot : MonoBehaviour
    {
        [SerializeField] private Transform exitPoint;
        [SerializeField] private Vector2 facing = Vector2.down;
        [SerializeField] private CharacterAnimationDefinition occupiedAnimation;
        [SerializeField, Min(0.01f)] private float hopDuration = 0.25f;
        [SerializeField, Min(0f)] private float hopHeight = 0.3f;
        [SerializeField] private MMFeedbacks entryFeedback;
        [SerializeField] private MMFeedbacks exitFeedback;

        public Transform ExitPoint => exitPoint;
        public Vector2 Facing => facing;
        public CharacterAnimationDefinition OccupiedAnimation => occupiedAnimation;
        public float HopDuration => hopDuration;
        public float HopHeight => hopHeight;
        public MMFeedbacks EntryFeedback => entryFeedback;
        public MMFeedbacks ExitFeedback => exitFeedback;
        public CharacterOccupation Occupant { get; private set; }

        /// <summary>Whether another character can start using this enabled slot.</summary>
        public bool IsAvailable => isActiveAndEnabled && Occupant == null;
        /// <summary>Notifies targeting after availability changes; both sides of occupation are already updated.</summary>
        public event Action StateChanged;

        private void Awake()
        {
            if (!exitPoint || !occupiedAnimation || facing == Vector2.zero || hopDuration <= 0f || hopHeight < 0f)
                throw new InvalidOperationException("An interaction slot requires an exit, animation, facing, positive hop duration and nonnegative height.");
        }

#if UNITY_EDITOR
        private void OnValidate()
        {
            if (hopDuration <= 0f)
                Debug.LogError("Interaction slot hop duration must be positive.", this);
        }
#endif

        // CharacterOccupation changes the linked state before publishing availability.
        internal void SetOccupant(CharacterOccupation occupant)
        {
            Occupant = occupant;
            StateChanged?.Invoke();
        }

        private void OnDisable()
        {
            if (Occupant) Occupant.ReleaseImmediately();
            else StateChanged?.Invoke();
        }

        private void OnEnable() => StateChanged?.Invoke();
    }
}
