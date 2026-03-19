using System.Collections.Generic;
using Character;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction.Tools
{
    /// <summary>
    /// Manages tool action instances. Maps ToolData to their corresponding AbstractToolAction.
    /// Used by UseToolAction to dispatch to the correct tool action based on the equipped tool.
    /// </summary>
    public class ToolActionRegistry : MonoBehaviour
    {
        [AssetList] 
        [SerializeField] private List<ToolAction> toolActionPrefabs;
        
        private readonly Dictionary<string, ToolAction> _toolActions = new();

        /// <summary>
        /// Initializes all tool actions with the owning character.
        /// </summary>
        public void Initialize(UrCharacter owner)
        {
            foreach (var prefab in toolActionPrefabs)
            {
                if (prefab.ToolData == null)
                {
                    Debug.LogWarning($"Tool action prefab '{prefab.name}' has no ToolData assigned. Skipping.");
                    continue;
                }
                
                var toolAction = Instantiate(prefab, transform, false);
                var id = toolAction.ToolData.ItemID;
                
                if (_toolActions.ContainsKey(id))
                {
                    Debug.LogWarning($"Duplicate tool action with id '{id}' found. Skipping duplicate.");
                    Destroy(toolAction.gameObject);
                    continue;
                }

                toolAction.Initialize(owner);
                toolAction.gameObject.SetActive(false);
                _toolActions.Add(id, toolAction);
            }
        }

        /// <summary>
        /// Gets the tool action for the specified tool ID.
        /// </summary>
        public ToolAction GetToolAction(string toolId)
        {
            return _toolActions.GetValueOrDefault(toolId);
        }

        /// <summary>
        /// Gets the tool action for the specified ToolData.
        /// </summary>
        public ToolAction GetToolAction(ToolData toolData)
        {
            return toolData != null ? GetToolAction(toolData.ItemID) : null;
        }
    }
}

