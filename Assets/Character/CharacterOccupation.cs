using System;
using Core.Location;
using DG.Tweening;
using Interaction;
using UnityEngine;

namespace Character
{
    /// <summary>Owns this character's slot use, hop motion, pose and physics, including interrupted release.</summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Rigidbody2D))]
    public sealed class CharacterOccupation : MonoBehaviour, ILocationLifecycle
    {
        public enum OccupationPhase { Empty, Entering, Occupied, Exiting }

        public InteractionSlot CurrentSlot { get; private set; }
        public OccupationPhase Phase { get; private set; }
        public bool IsOccupied => Phase != OccupationPhase.Empty;

        private GameCharacter _character;
        private Tween _hop;
        private Rigidbody2D _body;
        private Transform _graphics;
        private Vector3 _graphicsPosition, _graphicsScale;
        private Vector3 _entryPosition;

        private void Awake()
        {
            _character = GetComponent<GameCharacter>();
            if (!_character) throw new InvalidOperationException("CharacterOccupation requires its character.");
            _body = GetComponent<Rigidbody2D>();
        }

        private void OnEnable()
        {
            _character.OnConditionStateChanged += OnConditionChanged;
            LevelManager.Instance.RegisterLifecycle(this);
        }

        private void OnDisable()
        {
            _character.OnConditionStateChanged -= OnConditionChanged;
            ReleaseImmediately();
            // The systems scene can already be tearing down.
            if (LevelManager.Instance) LevelManager.Instance.UnregisterLifecycle(this);
        }

        private void OnConditionChanged(ConditionState condition)
        {
            if (condition == ConditionState.Dead) ReleaseImmediately();
        }

        /// <summary>Claims an available slot, then hops onto it. Already occupied or dead characters reject entry.</summary>
        public bool TryEnter(InteractionSlot slot)
        {
            if (IsOccupied || !slot.IsAvailable || _character.ConditionState == ConditionState.Dead)
                return false;

            _graphics = _character.Graphics;
            _graphicsPosition = _graphics.localPosition;
            _graphicsScale = _graphics.localScale;
            _entryPosition = transform.position;
            CurrentSlot = slot;
            Phase = OccupationPhase.Entering;
            _character.Controller.Stop();
            _character.SetMovementState(MovementState.Idle);
            _character.Orientation.ForceDirection(slot.Facing);
            // Scripted placement owns position until release; physics must not push this character off the anchor.
            _body.simulated = false;
            HopTo(slot.transform, () =>
            {
                Phase = OccupationPhase.Occupied;
                _character.Animator.PlayInteractionAnimation(slot.OccupiedAnimation);
            });
            // Publish only once both sides and the character's entry sequence are ready.
            slot.SetOccupant(this);
            if (slot.EntryFeedback) slot.EntryFeedback.PlayFeedbacks();
            return true;
        }

        /// <summary>Hops to the exit, retaining the claim until arrival. Busy entry/exit sequences reject another request.</summary>
        public bool TryExit()
        {
            if (Phase != OccupationPhase.Occupied) return false;
            Phase = OccupationPhase.Exiting;
            _character.Animator.EndInteractionAnimation();
            RestoreGraphics();
            HopTo(CurrentSlot.ExitPoint, ReleaseImmediately);
            if (CurrentSlot.ExitFeedback) CurrentSlot.ExitFeedback.PlayFeedbacks();
            return true;
        }

        private void HopTo(Transform destination, Action finished)
        {
            var start = transform.position;
            var slot = CurrentSlot;
            // The root follows the floor; only the artwork follows the vertical arc.
            _hop = DOTween.To(() => 0f, progress =>
            {
                transform.position = Vector3.Lerp(start, destination.position, progress);
                _graphics.localPosition = _graphicsPosition + Vector3.up * (Mathf.Sin(progress * Mathf.PI) * slot.HopHeight);
            }, 1f, slot.HopDuration).SetEase(Ease.Linear).OnComplete(() => finished());
        }

        /// <summary>Interrupts entry back to its start or exit to its endpoint; a seated character stays in place. Plays no exit cue.</summary>
        public void ReleaseImmediately() => ReleaseAt(Phase switch
        {
            OccupationPhase.Entering => _entryPosition,
            OccupationPhase.Exiting => CurrentSlot.ExitPoint.position,
            _ => transform.position
        });

        private void ReleaseAt(Vector3 position)
        {
            if (!IsOccupied) return;
            _hop?.Kill();
            var slot = CurrentSlot;
            transform.position = position;
            _character.Animator.EndInteractionAnimation();
            RestoreGraphics();
            _body.simulated = true;
            CurrentSlot = null;
            Phase = OccupationPhase.Empty;
            slot.SetOccupant(null);
        }

        private void RestoreGraphics()
        {
            _graphics.localPosition = _graphicsPosition;
            _graphics.localScale = _graphicsScale;
        }

        /// <summary>Occupation is runtime-local; entering a location does not restore a claim.</summary>
        public void OnLocationEnter(LocationData location) { }

        /// <summary>Releases without repositioning; location placement owns the character's next position.</summary>
        public void OnLocationLeave(LocationData location) => ReleaseAt(transform.position);
    }
}
