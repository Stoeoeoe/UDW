using Core.Scripting;
using Core.Scripting.Editor;
using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor.AssetImporters;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class CutsceneImporter
    {
        public static void ImportCutscene(AssetImportContext ctx)
        {
            ctx.DependsOnCustomDependency(LuaBindingManifestExporter.DependencyName);
            var definition = CreateDefinition(VulcanusSchema.Read<JObject>(ctx), ctx.assetPath);
            ctx.AddObjectToAsset("cutsceneDefinition", definition);
            ctx.SetMainObject(definition);
        }

        internal static CutsceneDefinition Parse(string json, string schemaPath, string sourcePath) =>
            CreateDefinition(VulcanusSchema.Deserialize<JObject>(json, schemaPath, sourcePath), sourcePath);

        internal static void ValidateSource(string path)
        {
            var source = VulcanusSchema.Read<JObject>(path);
            CutsceneSequenceCompiler.Compile((JArray)source["sequence"], path);
        }

        private static CutsceneDefinition CreateDefinition(JObject source, string path)
        {
            var compiled = CutsceneSequenceCompiler.Compile((JArray)source["sequence"], path);
            var definition = ScriptableObject.CreateInstance<CutsceneDefinition>();
            try
            {
                definition.name = (string)source["id"];
                var steps = ((JArray)source["sequence"]).Cast<JObject>().Select(step => new CutsceneStep(
                    (string)step["id"], (string)step["action"], ((JObject)step["arguments"]).Properties()
                        .OrderBy(argument => argument.Name, StringComparer.Ordinal)
                        .Select(argument => new CutsceneArgument(argument.Name, (string)argument.Value)).ToArray()));
                definition.Configure((string)source["id"], (string)source["mapId"], compiled.Lua, steps);
                return definition;
            }
            catch { Object.DestroyImmediate(definition); throw; }
        }
    }
}
