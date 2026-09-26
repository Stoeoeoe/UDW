using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    public class VulcanusNullDialogueScriptEngine : MonoBehaviour, IDialogueScriptEngine
    {
        public bool EvaluateCondition(string conditionExpression, VulcanusDialogueExecutionContext context, out bool isVisible)
        {
            isVisible = false;
            Debug.LogWarning($"[VulcanusNullDialogueScriptEngine] Cannot evaluate condition '{conditionExpression}' because no Lua backend is configured.");
            return false;
        }

        public bool ExecuteAction(string luaChunk, VulcanusDialogueExecutionContext context)
        {
            Debug.LogWarning($"[VulcanusNullDialogueScriptEngine] Cannot execute action '{luaChunk}' because no Lua backend is configured.");
            return false;
        }
    }
}
