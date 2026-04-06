using Core.Context;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction
{
    /// <summary>
    /// Base class for non-tool actions like dialogue, planting seeds, etc.
    /// Provides serialized fields for action type, interaction mode, cooldown, etc.
    /// </summary>
    public abstract class PrimaryAction : AbstractAction
    {
        [PropertyOrder(-10)]
        [field: SerializeField] 
        public ActionType ActionTypeValue { get; private set; } = ActionType.Primary;
        
        [PropertyOrder(-9)]
        [field: SerializeField]
        public InteractionMode InteractionMode { get; private set; } = InteractionMode.None;
        
        [PropertyOrder(-7)]
        [field: SerializeField]
        public bool FreezeCharacterDuringActionValue { get; private set; } = true;
        

        
        // Override base virtual properties to use the serialized values
        public override bool FreezeCharacterDuringAction => FreezeCharacterDuringActionValue;
        public virtual ActionType Type => ActionType.Primary;

    }
}