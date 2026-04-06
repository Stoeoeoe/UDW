using Character;
using UnityEngine;

namespace Interaction
{
    /// <summary>
    /// Base for all interactable objects. Owns its own trigger detection, activation limits, and cooldown.
    /// </summary>
    [RequireComponent(typeof(Collider2D))]
    public abstract class AbstractInteractable : MonoBehaviour
    {
        [Header("Interaction")]
        [Tooltip("If false, triggers on contact (walk-in portals). If true, player must press Interact.")]
        [SerializeField] private bool requiresButtonPress = true;
        [Tooltip("-1 = unlimited")]
        [SerializeField] protected int  maxActivations = -1;
        [SerializeField] protected float cooldown = 0f;

        /// <summary>Whether this interactable requires the player to press a button to trigger it.</summary>
        public virtual bool RequiresButtonPress => requiresButtonPress;

        int   _activationsLeft;
        float _nextInteractTime;

        public bool CanInteract => (maxActivations < 0 || _activationsLeft > 0)
                                && Time.time >= _nextInteractTime;

        protected virtual void Awake()
        {
            _activationsLeft = maxActivations;
        }

        /// <summary>
        /// Called by InteractionSphere (button press) or OnTriggerEnter2D (walk-in).
        /// Enforces cooldown/activation limits before calling Interact().
        /// </summary>
        public virtual void TriggerInteraction(GameCharacter instigator)
        {
            if (!CanInteract) return;
            if (maxActivations > 0) _activationsLeft--;
            if (cooldown > 0) _nextInteractTime = Time.time + cooldown;
            Interact(instigator);
        }

        protected abstract void Interact(GameCharacter instigator);

        /// <summary>Walk-in interactables trigger automatically on contact.</summary>
        protected virtual void OnTriggerEnter2D(Collider2D other)
        {
            if (RequiresButtonPress) return;
            if (other.TryGetComponent<GameCharacter>(out var character))
                TriggerInteraction(character);
        }
    }
}