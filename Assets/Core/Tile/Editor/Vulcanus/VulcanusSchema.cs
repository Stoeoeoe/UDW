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
        public static T Read<T>(AssetImportContext ctx)
        {
            var json = File.ReadAllText(ctx.assetPath);
            var reference = JObject.Parse(json)["$schema"];
            if (reference?.Type != JTokenType.String || string.IsNullOrWhiteSpace((string)reference))
                throw new FormatException($"{ctx.assetPath}: '$schema' must point to a local schema file.");

            var absolutePath = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(ctx.assetPath), (string)reference));
            if (!VulcanusImportHelpers.TryAbsoluteToAssetPath(absolutePath, out var schemaPath))
                throw new FormatException($"{ctx.assetPath}: schema must be inside Assets: '{reference}'.");
            ctx.DependsOnSourceAsset(schemaPath);
            return Deserialize<T>(json, schemaPath, ctx.assetPath);
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
