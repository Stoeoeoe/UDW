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

        /// <summary>The file's JSON once its schema has accepted it.</summary>
        public static string ReadChecked(AssetImportContext ctx) => ReadChecked(ctx.assetPath, ctx.DependsOnSourceAsset);

        public static string ReadChecked(string sourcePath) => ReadChecked(sourcePath, null);

        private static T Read<T>(string sourcePath, Action<string> schemaDependency) =>
            JsonConvert.DeserializeObject<T>(ReadChecked(sourcePath, schemaDependency),
                new JsonSerializerSettings { DateParseHandling = DateParseHandling.None });

        private static string ReadChecked(string sourcePath, Action<string> schemaDependency)
        {
            var json = File.ReadAllText(sourcePath);
            var reference = JObject.Parse(json)["$schema"];
            if (reference?.Type != JTokenType.String || string.IsNullOrWhiteSpace((string)reference))
                throw new FormatException($"{sourcePath}: '$schema' must point to a local schema file.");

            var absolutePath = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(sourcePath), (string)reference));
            if (!VulcanusImportHelpers.TryAbsoluteToAssetPath(absolutePath, out var schemaPath))
                throw new FormatException($"{sourcePath}: schema must be inside Assets: '{reference}'.");
            schemaDependency?.Invoke(schemaPath);
            Check(json, schemaPath, sourcePath);
            return json;
        }

        internal static T Deserialize<T>(string json, string schemaPath, string sourcePath)
        {
            Check(json, schemaPath, sourcePath);
            return JsonConvert.DeserializeObject<T>(json, new JsonSerializerSettings { DateParseHandling = DateParseHandling.None });
        }

        private static void Check(string json, string schemaPath, string sourcePath)
        {
            var schema = JsonSchema.FromFileAsync(Path.GetFullPath(schemaPath)).GetAwaiter().GetResult();
            var errors = schema.Validate(json);
            if (errors.Count != 0)
                throw new FormatException($"{sourcePath}: schema validation failed ({schemaPath}):\n" +
                    string.Join("\n", errors.Select(error => error.ToString())));
        }
    }
}
