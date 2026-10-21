using Character;
using Newtonsoft.Json;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class CharacterImporter
    {
        public static void ImportCharacter(AssetImportContext ctx)
        {
            var definition = CreateDefinition(VulcanusSchema.Read<CharacterDto>(ctx));
            definition.name = definition.DisplayName;
            ctx.AddObjectToAsset("characterDefinition", definition);
            ctx.SetMainObject(definition);
        }

        internal static CharacterDefinition Parse(string json, string schemaPath, string sourcePath) =>
            CreateDefinition(VulcanusSchema.Deserialize<CharacterDto>(json, schemaPath, sourcePath));

        private static CharacterDefinition CreateDefinition(CharacterDto data)
        {
            var definition = ScriptableObject.CreateInstance<CharacterDefinition>();
            try { definition.Configure(data.Id, data.Name, data.Icon); return definition; }
            catch { Object.DestroyImmediate(definition); throw; }
        }

        private sealed class CharacterDto
        {
            [JsonProperty("id")] public string Id;
            [JsonProperty("name")] public string Name;
            [JsonProperty("icon")] public string Icon;
        }
    }
}
