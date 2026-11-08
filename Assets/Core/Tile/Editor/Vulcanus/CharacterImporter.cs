using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Newtonsoft.Json;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class CharacterImporter
    {
        public static void ImportCharacter(AssetImportContext ctx)
        {
            var projectAssetPath = VulcanusImportHelpers.FindProjectAssetPath(ctx.assetPath);
            Texture2D LoadPortrait(string path)
            {
                var assetPath = VulcanusImportHelpers.ResolveAssetReferencePath(ctx.assetPath, path, projectAssetPath)
                    ?? throw new FormatException($"{ctx.assetPath}: portrait '{path}' does not exist.");
                VulcanusImportHelpers.AddDependency(ctx, assetPath);
                return AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath)
                    ?? throw new FormatException($"{ctx.assetPath}: portrait '{path}' is not an image.");
            }
            var definition = CreateDefinition(VulcanusSchema.Read<CharacterDto>(ctx), LoadPortrait);
            definition.name = definition.DisplayName;
            ctx.AddObjectToAsset("characterDefinition", definition);
            ctx.SetMainObject(definition);
        }

        /// <summary>Parses a character document; <paramref name="loadPortrait"/> turns a portrait path into its image.</summary>
        internal static CharacterDefinition Parse(string json, string schemaPath, string sourcePath, Func<string, Texture2D> loadPortrait = null) =>
            CreateDefinition(VulcanusSchema.Deserialize<CharacterDto>(json, schemaPath, sourcePath), loadPortrait);

        private static CharacterDefinition CreateDefinition(CharacterDto data, Func<string, Texture2D> loadPortrait)
        {
            var definition = ScriptableObject.CreateInstance<CharacterDefinition>();
            try { definition.Configure(data.Id, data.Name, data.TypewriterSound,
                    (data.EmotionTypewriterSounds ?? new Dictionary<string, string>())
                    .Select(each => new EmotionTypewriterSound { emotionId = each.Key, soundId = each.Value }).ToArray(),
                    data.DefaultPortrait == null ? null : loadPortrait(data.DefaultPortrait),
                    (data.Portraits ?? new Dictionary<string, string>())
                    .Select(each => new EmotionPortrait { emotionId = each.Key, portrait = loadPortrait(each.Value) }).ToArray());
                return definition; }
            catch { UnityEngine.Object.DestroyImmediate(definition); throw; }
        }

        private sealed class CharacterDto
        {
            [JsonProperty("id")] public string Id;
            [JsonProperty("name")] public string Name;
            [JsonProperty("defaultPortrait")] public string DefaultPortrait;
            [JsonProperty("portraits")] public Dictionary<string, string> Portraits;
            [JsonProperty("typewriterSound")] public string TypewriterSound;
            [JsonProperty("emotionTypewriterSounds")] public Dictionary<string, string> EmotionTypewriterSounds;
        }
    }
}
