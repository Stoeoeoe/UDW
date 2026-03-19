using MoreMountains.TopDownEngine;
using PixelCrushers.DialogueSystem;

namespace UI
{
    public class UrGUIManager : GUIManager
    {
        public StandardDialogueUI DialogueUI { get; private set; }

        // Will be instantiated at runtime by dialogue system.
        protected override void Start()
        {
            base.Awake();
            if (DialogueUI == null)
            {
                DialogueUI = FindFirstObjectByType<StandardDialogueUI>();
            }
        }
    }
}