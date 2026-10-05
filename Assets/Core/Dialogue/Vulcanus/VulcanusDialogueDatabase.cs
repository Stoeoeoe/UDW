using System;
using System.Collections.Generic;
using Core.Catalogs;
using Core.Tile.Vulcanus;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    [CreateAssetMenu(fileName = "VulcanusDialogueDatabase", menuName = "Game/Vulcanus/Dialogue Database")]
    public class VulcanusDialogueDatabase : ScriptableObject
    {
        [SerializeField] private VulcanusProject project;
        [SerializeField] private VulcanusDialogueAsset[] dialogues = Array.Empty<VulcanusDialogueAsset>();

        [NonSerialized] private Dictionary<string, VulcanusDialogueAsset> _dialogueById;

        public VulcanusProject Project => project;
        public VulcanusDialogueAsset[] Dialogues => dialogues == null
            ? Array.Empty<VulcanusDialogueAsset>()
            : (VulcanusDialogueAsset[])dialogues.Clone();

        public void Configure(VulcanusProject sourceProject, VulcanusDialogueAsset[] importedDialogues)
        {
            project = sourceProject;
            dialogues = importedDialogues == null
                ? Array.Empty<VulcanusDialogueAsset>()
                : (VulcanusDialogueAsset[])importedDialogues.Clone();
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
            _dialogueById = IdIndex.FirstWins(dialogues, dialogue => dialogue ? dialogue.DialogueId : null,
                StringComparer.OrdinalIgnoreCase);
        }
    }
}
