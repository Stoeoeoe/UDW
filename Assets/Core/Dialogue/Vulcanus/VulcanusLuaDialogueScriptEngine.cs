using System;
using Core.Scripting;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    /// <summary>Dialogue-specific error handling around the shared Lua engine.</summary>
    public sealed class VulcanusLuaDialogueScriptEngine
    {
        private readonly VulcanusLuaEngine _lua;

        public VulcanusLuaDialogueScriptEngine(VulcanusLuaEngine lua)
        {
            _lua = lua ?? throw new ArgumentNullException(nameof(lua));
        }

        public bool EvaluateCondition(string conditionExpression, VulcanusDialogueExecutionContext context, out bool isVisible)
        {
            isVisible = false;
            try
            {
                isVisible = _lua.EvaluateCondition(conditionExpression);
                return true;
            }
            catch (Exception exception)
            {
                Debug.LogError($"[VulcanusLuaDialogueScriptEngine] Condition failed in '{context?.CurrentDialogue?.DialogueId}': {exception}");
                return false;
            }
        }

        public bool ExecuteAction(string luaChunk, VulcanusDialogueExecutionContext context)
        {
            try
            {
                _lua.Execute(luaChunk);
                return true;
            }
            catch (Exception exception)
            {
                Debug.LogError($"[VulcanusLuaDialogueScriptEngine] Action failed in '{context?.CurrentDialogue?.DialogueId}': {exception}");
                return false;
            }
        }
    }
}
