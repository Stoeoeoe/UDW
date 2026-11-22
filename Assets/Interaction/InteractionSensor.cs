using System;
using System.Collections.Generic;
using Character;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction
{
    /// <summary>
    /// Finds the interactables a character can use: ready ones that need a button press and whose footprint covers
    /// the character's tile or one of the eight around it. A physics query around the character supplies candidates.
    /// Facing play uses <see cref="Current"/>; pointer play asks for the one under the pointer.
    /// </summary>
    public class InteractionSensor : MonoBehaviour
    {
        // Targets further than this from where the character faces are never picked by facing.
        private const float MaxFacingAngle = 90f;
        // Any interaction collider reaching into the 3x3 tiles around the character is within this distance.
        private const float CandidateRadius = 2f;

        private GameCharacter _owner;
        private ContactFilter2D _interactables;
        private readonly List<Collider2D> _hits = new();
        private readonly List<AbstractInteractable> _candidates = new();

        /// <summary>The usable target closest to where the character faces, then closest in distance.</summary>
        [ReadOnly] [ShowInInspector] public AbstractInteractable Current { get; private set; }

        public void ValidateConfiguration()
        {
            if (!GetComponentInParent<GameCharacter>(true))
                throw new InvalidOperationException($"Interaction sensor '{name}' must belong to a character.");
        }

        private void Awake()
        {
            ValidateConfiguration();
            _owner = GetComponentInParent<GameCharacter>();
            // Interaction colliders are triggers on the Interactable layer.
            _interactables = new ContactFilter2D
                { useLayerMask = true, layerMask = LayerMask.GetMask("Interactable"), useTriggers = true };
        }

        private void LateUpdate()
        {
            var next = FindInFront();
            if (next == Current) return;
            Current = next;
            InteractableChangedEvent.Trigger(Current, _owner);
        }

        public AbstractInteractable FindInFront()
        {
            var origin = (Vector2)_owner.ToolInteractionAnchor.position;
            var facing = _owner.Orientation.FacingDirection;
            AbstractInteractable best = null;
            var bestAngle = float.PositiveInfinity;
            var bestDistance = float.PositiveInfinity;
            foreach (var candidate in Candidates())
            {
                var offset = candidate.ClosestFootprintPoint(origin) - origin;
                // Standing on the footprint counts as straight ahead.
                var angle = offset.sqrMagnitude < 0.0001f ? 0f : Vector2.Angle(facing, offset);
                if (angle > MaxFacingAngle) continue;
                var distance = offset.sqrMagnitude;
                if (angle > bestAngle || angle == bestAngle && distance >= bestDistance) continue;
                best = candidate;
                bestAngle = angle;
                bestDistance = distance;
            }
            return best;
        }

        /// <summary>The usable target under the pointer; where targets overlap, the one in front (lowest on screen).</summary>
        public AbstractInteractable FindUnderPointer(Vector2 point)
        {
            AbstractInteractable best = null;
            foreach (var candidate in Candidates())
                if ((!best || candidate.transform.position.y < best.transform.position.y) && candidate.IsUnderPointer(point))
                    best = candidate;
            return best;
        }

        private List<AbstractInteractable> Candidates()
        {
            _candidates.Clear();
            // Indoor floors and other cells may have no stored tile data, so reach uses plain coordinates.
            if (!_owner.Tiles.HasMap) return _candidates;
            var tile = _owner.Tiles.Coordinates;
            Physics2D.OverlapCircle(_owner.ToolInteractionAnchor.position, CandidateRadius, _interactables, _hits);
            foreach (var hit in _hits)
                if (hit.TryGetComponent<AbstractInteractable>(out var interactable) && !_candidates.Contains(interactable) &&
                    interactable.RequiresButtonPress && interactable.CanInteract && interactable.IsWithinReach(tile))
                    _candidates.Add(interactable);
            return _candidates;
        }
    }
}
