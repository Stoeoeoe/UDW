using System;
using System.Linq;
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
        public void Initialize(Character.GameCharacter owner)
        {
            ValidateConfiguration();
            foreach (var prefab in toolActionPrefabs)
            {
                var toolAction = Instantiate(prefab, transform, false);
                var id = toolAction.ToolData.ItemId;
                
                toolAction.Initialize(owner);
                toolAction.gameObject.SetActive(false);
                _toolActions.Add(id, toolAction);
            }
        }

        public void ValidateConfiguration()
        {
            if (toolActionPrefabs == null || toolActionPrefabs.Any(action => !action || !action.ToolData || string.IsNullOrWhiteSpace(action.ToolData.ItemId)))
                throw new InvalidOperationException("ToolActionRegistry requires tool prefabs with definitions and stable item IDs.");
            if (toolActionPrefabs.GroupBy(action => action.ToolData.ItemId).Any(group => group.Count() > 1))
                throw new InvalidOperationException("ToolActionRegistry contains duplicate tool IDs.");
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
            return toolData != null ? GetToolAction(toolData.ItemId) : null;
        }
    }
}

