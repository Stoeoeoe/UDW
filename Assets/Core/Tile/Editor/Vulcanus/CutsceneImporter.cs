using Core.Scripting;
using Core.Scripting.Editor;
using System;
using System.Linq;
using System.IO;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor.AssetImporters;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class CutsceneImporter
    {
        // Source paths establish import order before catalog discovery has seen a newly created asset.
        internal static Dictionary<string, string> FindSources() => Directory
            .EnumerateFiles(Application.dataPath, "*.runtime.cutscene.json", SearchOption.AllDirectories)
            .Select(path => "Assets" + path.Substring(Application.dataPath.Length).Replace('\\', '/'))
            .ToDictionary(path => (string)VulcanusImportHelpers.LoadDto<JObject>(path)["id"], path => path, StringComparer.Ordinal);

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
            var definition = CreateDefinition(VulcanusSchema.Read<JObject>(path), path);
            Object.DestroyImmediate(definition);
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
                var completion = source["completion"];
                var outcomes = completion["actorOutcomes"].Select(outcome =>
                    new CutsceneActorOutcome((string)outcome["actor"], (string)outcome["anchor"])).ToArray();
                definition.Configure((string)source["id"], (string)source["mapId"], compiled.Lua, steps,
                    (bool)source["allowSkip"], new CutsceneCompletion(outcomes, (string)completion["outcome"] ?? "completed"));
                return definition;
            }
            catch { Object.DestroyImmediate(definition); throw; }
        }
    }
}
