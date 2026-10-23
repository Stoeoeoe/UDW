using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NJsonSchema;
using UnityEditor.AssetImporters;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class VulcanusSchema
    {
        public static T Read<T>(AssetImportContext ctx) => Read<T>(ctx.assetPath, ctx.DependsOnSourceAsset);

        public static T Read<T>(string sourcePath) => Read<T>(sourcePath, null);

        private static T Read<T>(string sourcePath, Action<string> schemaDependency)
        {
            var json = File.ReadAllText(sourcePath);
            var reference = JObject.Parse(json)["$schema"];
            if (reference?.Type != JTokenType.String || string.IsNullOrWhiteSpace((string)reference))
                throw new FormatException($"{sourcePath}: '$schema' must point to a local schema file.");

            var absolutePath = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(sourcePath), (string)reference));
            if (!VulcanusImportHelpers.TryAbsoluteToAssetPath(absolutePath, out var schemaPath))
                throw new FormatException($"{sourcePath}: schema must be inside Assets: '{reference}'.");
            schemaDependency?.Invoke(schemaPath);
            return Deserialize<T>(json, schemaPath, sourcePath);
        }

        internal static T Deserialize<T>(string json, string schemaPath, string sourcePath)
        {
            var schema = JsonSchema.FromFileAsync(Path.GetFullPath(schemaPath)).GetAwaiter().GetResult();
            var errors = schema.Validate(json);
            if (errors.Count != 0)
                throw new FormatException($"{sourcePath}: schema validation failed ({schemaPath}):\n" +
                    string.Join("\n", errors.Select(error => $"{error.Path}: {error.Kind}")));
            return JsonConvert.DeserializeObject<T>(json);
        }
    }
}
