using System;
using System.Collections.Generic;
using Core.Tile.Vulcanus;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    [CreateAssetMenu(fileName = "VulcanusDialogueDatabase", menuName = "Game/Vulcanus/Dialogue Database")]
    public class VulcanusDialogueDatabase : ScriptableObject
    {
        [SerializeField] private VulcanusProject project;
        [SerializeField] private VulcanusDialogueAsset[] dialogues = Array.Empty<VulcanusDialogueAsset>();

        private Dictionary<string, VulcanusDialogueAsset> _dialogueById;

        public VulcanusProject Project => project;
        public VulcanusDialogueAsset[] Dialogues => dialogues;

        public void Configure(VulcanusProject sourceProject, VulcanusDialogueAsset[] importedDialogues)
        {
            project = sourceProject;
            dialogues = importedDialogues ?? Array.Empty<VulcanusDialogueAsset>();
            RebuildCache();
        }

        public bool TryGetDialogue(string dialogueId, out VulcanusDialogueAsset dialogue)
        {
            EnsureCache();
            if (string.IsNullOrWhiteSpace(dialogueId))
            {
                dialogue = null;
                return false;
            }

            return _dialogueById.TryGetValue(dialogueId, out dialogue);
        }

        private void OnEnable()
        {
            RebuildCache();
        }

        private void OnValidate()
        {
            RebuildCache();
        }

        private void EnsureCache()
        {
            if (_dialogueById == null)
                RebuildCache();
        }

        private void RebuildCache()
        {
            _dialogueById = new Dictionary<string, VulcanusDialogueAsset>(StringComparer.OrdinalIgnoreCase);
            if (dialogues == null)
                return;

            for (var i = 0; i < dialogues.Length; i++)
            {
                var dialogue = dialogues[i];
                if (dialogue == null || string.IsNullOrWhiteSpace(dialogue.DialogueId))
                    continue;

                if (!_dialogueById.ContainsKey(dialogue.DialogueId))
                    _dialogueById.Add(dialogue.DialogueId, dialogue);
            }
        }
    }
}
