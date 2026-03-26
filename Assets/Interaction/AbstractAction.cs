using System.Collections;
using Character;
using Core.Context;
using MoreMountains.Feedbacks;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction
{
    /// <summary>
    /// Base class for all actions. Contains only the core lifecycle hooks and feedbacks.
    /// For regular actions (dialogue, planting, etc.), use PrimaryAction.
    /// For tool-based actions, use AbstractToolAction.
    /// </summary>
    public abstract class AbstractAction : MonoBehaviour
    {
        [field: SerializeField] public string ActionName { get; private set; }
        public virtual bool HasPreparationPhase => false;
        
        [field: SerializeField] 
        [field: FoldoutGroup("Feedbacks")]
        public MMFeedbacks PrepareFeedback { get; private set; }
        
        [field: SerializeField]
        [field: FoldoutGroup("Feedbacks")]
        public MMFeedbacks ExecuteFeedback { get; private set; }
        
        [field: SerializeField]
        [field: FoldoutGroup("Feedbacks")]
        public MMFeedbacks FinishFeedback  { get; private set; }
        
        [field: SerializeField]
        [field: FoldoutGroup("Feedbacks")]
        public MMFeedbacks FailureFeedback  { get; private set; }
        
        [field: SerializeField]
        [field: FoldoutGroup("Feedbacks")]
        public MMFeedbacks PostPrepareFailureFeedback { get; private set; }

        
        public GameCharacter Owner { get; private set; }
        
        // Virtual properties that subclasses define differently
        public virtual float ActionDuration => 0f;
        public virtual float CooldownTime => 0f;
        public virtual bool FreezeCharacterDuringAction => true;

        /// <summary>
        /// Initializes the action with its owning character.
        /// </summary>
        public virtual void Initialize(GameCharacter owner)
        {
            Owner = owner;
        }

        /// <summary>
        /// Override to specify what happens during the preparation phase of the action.
        /// It will execute the PrepareFeedback before this.
        /// This can be something like showing a preview of the action's effect area or showing a "charging" effect.
        /// </summary>
        public virtual IEnumerator OnPrepare(PlayerInteractionContextSnapshot snapshot)
        {
            yield break;
        }
        
        /// <summary>
        /// Override to specify what happens when the action is executed.
        /// It will execute the ExecuteFeedback before this.
        /// This should be the main logic of the action.
        /// </summary>
        public abstract IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot);

        /// <summary>
        /// Override to specify what happens when the action is interrupted.
        /// This will, for instance, be called when the scene is cleaned up.
        /// Therefore, it should not lead to any side effects.
        /// </summary>
        public abstract void Interrupt(PlayerInteractionContextSnapshot snapshot);

        /// <summary>
        /// Override to specify what happens when the action finishes (before cooldown).
        /// It will execute the FinishFeedback before this.
        /// </summary>
        public virtual IEnumerator OnFinish(PlayerInteractionContextSnapshot snapshot)
        {
            yield break;
        }
        
        /// <summary>
        /// Override to specify what happens when the action fails the CanExecute() check.
        /// It will execute the FailureFeedback before this.
        /// </summary>
        public virtual IEnumerator OnFailure(PlayerInteractionContextSnapshot snapshot)
        {
            yield break;
        }
        
        public virtual IEnumerator OnPostPrepareFailure(PlayerInteractionContextSnapshot snapshot)
        {
            yield break;
        }
        
        
        /// <summary>
        /// Override to specify whether the action can be executed in the given context.
        /// This will serve as a check BEFORE the action is executed.
        /// If it returns false, the FailureFeedback will be played and OnFailure() will be called but not the action itself.
        /// </summary>
        public virtual bool CanExecute(PlayerInteractionContextSnapshot snapshot)
        {
            return true;
        }
        
        
        /// <summary>
        /// Override to specify whether the action can fails AFTER the preparation is done.
        /// This can be used for checks that depend on the preparation phase (for example, checking if the target is
        /// still valid after aiming or when the player tries to plough grass. In that case, we still want to show the
        /// animation but then want to let the player know that this is not possible.
        /// If it returns false, the PostPrepareFailureFeedback will be played and OnPostPrepareFailure() will be called but not the action itself.
        /// </summary>
        public virtual bool CanExecuteAfterPreparation(PlayerInteractionContextSnapshot snapshot)
        {
            return true;
        }
        
        
        
        
        /// <summary>
        /// Optional override to specify where the action is executed from. For example, an effect might be executed
        /// from the character's position  rather than the tile in front.
        /// The feedbacks then use this location for their effects.
        /// </summary>
        public virtual Vector2 GetActionExecutionLocation(PlayerInteractionContextSnapshot snapshot)
        {
            return snapshot.Character.TileDataInFront?.WorldPosition ?? snapshot.Character.transform.position;
        }
    }
}