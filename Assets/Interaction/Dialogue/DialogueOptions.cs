using System;
using UnityEngine;

namespace Interaction.Dialog
{
    [Serializable]
    public class DialogueOptions
    {
        [Tooltip("if this is set to true, the character will be able to move while dialogue is in progress")]
        public bool CanMoveWhileTalking = false;
    
        [Tooltip("")]
        public bool RotateDialogueStarterTowardsTarget = true;

        [Tooltip("")]
        public bool RotateTargetTowardsDialogueStarter = true;

        [Tooltip("")]
        public bool ReturnDialogueStarterRotationAfterDialogue = false;

        [Tooltip("")]
        public bool ReturnDialogueTargetRotationAfterDialogue = true;
    
    }
}
