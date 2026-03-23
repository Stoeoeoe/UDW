using Character;
using MoreMountains.Feedbacks;
using UnityEngine;

namespace Interaction
{
    /// <summary>
    /// Extends AbstractInteractable with MMFeedbacks and a configurable activation limit.
    /// </summary>
    public abstract class BasicInteractable : AbstractInteractable
    {
        [Header("Activations")]
        [SerializeField] protected bool UnlimitedActivations = true;
        [SerializeField] protected int  MaxNumberOfActivations = 1;

        [Header("Feedbacks")]
        [SerializeField] protected MMFeedbacks ActivationFeedback;
        [SerializeField] protected MMFeedbacks DeniedFeedback;
        [SerializeField] protected MMFeedbacks EnterFeedback;
        [SerializeField] protected MMFeedbacks ExitFeedback;

        protected override void Awake()
        {
            _maxActivations = UnlimitedActivations ? -1 : MaxNumberOfActivations;
            base.Awake();
        }

        public override void TriggerInteraction(GameCharacter instigator)
        {
            if (!CanInteract) { DeniedFeedback?.PlayFeedbacks(); return; }
            ActivationFeedback?.PlayFeedbacks();
            base.TriggerInteraction(instigator);
        }

        protected virtual void OnTriggerEnter2D_Entered() => EnterFeedback?.PlayFeedbacks();
        protected virtual void OnTriggerExit2D_Exited()   => ExitFeedback?.PlayFeedbacks();
    }
}