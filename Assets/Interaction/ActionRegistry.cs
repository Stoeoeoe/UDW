using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Context;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction
{
    public class ActionRegistry : MonoBehaviour
    {
        
        [AssetList] [SerializeField] private List<PrimaryAction> actionPrefabs;
        
        [SerializeField] protected ActionType registryActionType;

        // Simple key: (ActionType, InteractionMode) -> Action
        private Dictionary<InteractionMode, PrimaryAction> _actions;

        public void Initialize(GameCharacter owner)
        {
            ValidateConfiguration();
            
            _actions = new Dictionary<InteractionMode, PrimaryAction>();
            
            foreach (var prefab in actionPrefabs)
            {
                var action = Instantiate(prefab, transform, false);
                action.Initialize(owner);
                _actions[action.InteractionMode] = action;
            }
        }

        public void ValidateConfiguration()
        {
            if (actionPrefabs == null || actionPrefabs.Any(action => !action))
                throw new InvalidOperationException("ActionRegistry requires a list without missing action prefabs.");
            var duplicates = actionPrefabs
                .GroupBy(a => a.InteractionMode)
                .Where(g => g.Count() > 1)
                .ToList();

            if (duplicates.Count <= 0) return;
            
            foreach (var duplicate in duplicates)
                Debug.LogError($"Duplicate action: {duplicate.Key}");
                
            throw new InvalidOperationException("ActionRegistry contains duplicate action bindings.");
        }

        public PrimaryAction GetActionForMode(InteractionMode mode)
        {
            return _actions.GetValueOrDefault(mode);
        }
        
        
    }
}
