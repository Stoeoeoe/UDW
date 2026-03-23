using Core;
using PixelCrushers.DialogueSystem;

namespace UI
{
    public class GUIManager : Singleton<GUIManager>
    {
        public StandardDialogueUI DialogueUI { get; private set; }

        protected override void OnAwake()
        {
            if (DialogueUI == null)
                DialogueUI = FindFirstObjectByType<StandardDialogueUI>();
        }
    }
}