using Character;
using UnityEditor.AssetImporters;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class CharacterImporter
    {
        public static void ImportCharacter(AssetImportContext ctx) =>
            VulcanusJson.Import<CharacterDefinition>(ctx, "characterDefinition", character => character.DisplayName);
    }
}
