using Core.Tile.Vulcanus;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    public class VulcanusDialogueContextResolver : MonoBehaviour, IDialogueContextResolver
    {
        public object ResolveSelf(VulcanusProject project, VulcanusDialogueAsset dialogue)
        {
            return null;
        }

        public bool TryResolveContextType(VulcanusProject project, VulcanusDialogueAsset dialogue,
            out VulcanusProject.ScriptContextTypeDefinition contextType)
        {
            contextType = default;
            if (project == null)
                return false;

            var contextTypeId = dialogue != null ? project.ResolveDialogueContextTypeId(dialogue.DialogueTypeId) : project.DefaultDialogueContextTypeId;
            return project.TryGetScriptContextType(contextTypeId, out contextType);
        }
    }
}
