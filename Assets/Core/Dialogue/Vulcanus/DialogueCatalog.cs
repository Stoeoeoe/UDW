using System;
using Core.Catalogs;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    /// <summary>Every imported Vulcanus dialogue, found by the shared catalog discovery and looked up by dialogue ID.</summary>
    [CreateAssetMenu(menuName = "Game/Catalogs/Dialogue")]
    [DefaultCatalog(DialogueCatalog.ResourceName)]
    public sealed class DialogueCatalog : DefinitionCatalog<VulcanusDialogueAsset>
    {
        public const string ResourceName = "DialogueCatalog";
        public override string Path => "Assets";
        public override StringComparer IdComparer => StringComparer.OrdinalIgnoreCase;
        protected override string GetDefinitionId(VulcanusDialogueAsset definition) => definition.DialogueId;
    }
}
