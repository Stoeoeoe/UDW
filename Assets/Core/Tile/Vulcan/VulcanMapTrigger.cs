using System;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    public class VulcanusMapTrigger : MonoBehaviour
    {
        [SerializeField] private string triggerId;
        [SerializeField] private string label;
        [SerializeField] private string triggerType;
        [SerializeField] private string shape;
        [SerializeField] private string[] tags = Array.Empty<string>();

        public string TriggerId => triggerId;
        public string Label => label;
        public string TriggerType => triggerType;
        public string Shape => shape;
        public string[] Tags => tags;

        public void Configure(string id, string displayName, string type, string triggerShape, string[] triggerTags)
        {
            triggerId = id ?? string.Empty;
            label = string.IsNullOrWhiteSpace(displayName) ? triggerId : displayName;
            triggerType = type ?? string.Empty;
            shape = string.IsNullOrWhiteSpace(triggerShape) ? "rectangle" : triggerShape;
            tags = triggerTags ?? Array.Empty<string>();
        }
    }
}