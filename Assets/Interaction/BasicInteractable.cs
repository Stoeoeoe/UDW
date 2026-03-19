using Character;
using MoreMountains.Feedbacks;
using UnityEngine;

namespace Interaction
{
    public abstract class BasicInteractable : AbstractInteractable
    {
        [SerializeField] protected bool UnlimitedActivations = true;
        [SerializeField] protected int MaxNumberOfActivations = 1;
        [SerializeField] protected int NumberOfActivationsLeft = 1;
        [SerializeField] protected MMFeedbacks ActivationFeedback;
        [SerializeField] protected MMFeedbacks DeniedFeedback;
        [SerializeField] protected MMFeedbacks EnterFeedback;
        [SerializeField] protected MMFeedbacks ExitFeedback;

        protected override void Awake()
        {
            base.Awake();
                        
            buttonActivated.UnlimitedActivations = UnlimitedActivations;
            buttonActivated.MaxNumberOfActivations = MaxNumberOfActivations;
            buttonActivated.NumberOfActivationsLeft = NumberOfActivationsLeft;
            buttonActivated.ActivationFeedback = ActivationFeedback;
            buttonActivated.DeniedFeedback = DeniedFeedback;
            buttonActivated.EnterFeedback = EnterFeedback;
            buttonActivated.ExitFeedback = ExitFeedback;
        }
    }
}