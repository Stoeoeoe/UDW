using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using NJsonSchema;
using UnityEditor.AssetImporters;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// Checks Vulcanus files against the schemas in the repository's Schemas folder, chosen by file type. A file's own
    /// "$schema" is ignored, so projects carry no schema copies that could drift.
    /// </summary>
    internal static class VulcanusSchema
    {
        /// <summary>The repository's schema folder, next to Assets.</summary>
        public const string Folder = "Schemas";

        // No suffix ends with another, so the first match is the only one.
        private static readonly Dictionary<string, string> SchemaBySuffix = new()
        {
            [".runtime.dialogue.json"] = "dialogue",
            [".runtime.cutscene.json"] = "cutscene",
            [".character.json"] = "character",
            [".routine.json"] = "routine",
            [".entity.json"] = "entity-type",
            [".object.json"] = "object",
            [".quest.json"] = "quest",
            [".shop.json"] = "shop",
            [".i18n.json"] = "quest-i18n",
            [".vproj"] = "project",
            [".vitm"] = "item"
        };

        public static T Read<T>(AssetImportContext ctx) => Read<T>(ctx.assetPath);

        public static T Read<T>(string sourcePath) =>
            JsonConvert.DeserializeObject<T>(ReadChecked(sourcePath), new JsonSerializerSettings { DateParseHandling = DateParseHandling.None });

        /// <summary>The file's JSON once its schema has accepted it.</summary>
        public static string ReadChecked(AssetImportContext ctx) => ReadChecked(ctx.assetPath);

        public static string ReadChecked(string sourcePath) => ReadChecked(sourcePath, SchemaName(sourcePath));

        /// <summary>The file's JSON once the named schema has accepted it, for files whose suffix is shared, such as texts.</summary>
        public static string ReadChecked(string sourcePath, string schema)
        {
            var json = File.ReadAllText(sourcePath);
            Check(json, $"{Folder}/{schema}.schema.json", sourcePath);
            return json;
        }

        /// <summary>The schema for a Vulcanus file, by its type.</summary>
        public static string SchemaPath(string sourcePath) => $"{Folder}/{SchemaName(sourcePath)}.schema.json";

        private static string SchemaName(string sourcePath) =>
            SchemaBySuffix.FirstOrDefault(entry => sourcePath.EndsWith(entry.Key, StringComparison.OrdinalIgnoreCase)).Value
            ?? throw new FormatException($"{sourcePath}: no schema for this kind of file.");

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
