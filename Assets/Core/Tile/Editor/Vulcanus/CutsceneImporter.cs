using Core.Scripting;
using Core.Scripting.Editor;
using System;
using System.Linq;
using System.IO;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using MoonSharp.Interpreter;
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
                var completion = source["onComplete"];
                var placements = completion["actorPlacements"].Select(placement =>
                    new CutsceneActorPlacement((string)placement["actor"], (string)placement["anchor"])).ToArray();
                var actions = (string)completion["actions"];
                try { new Script(CoreModules.Preset_HardSandbox).LoadString(actions, null, path + ":onComplete"); }
                catch (SyntaxErrorException error)
                {
                    throw new FormatException($"{path}, onComplete.actions: {error.DecoratedMessage}", error);
                }
                definition.Configure((string)source["id"], (string)source["mapId"], compiled, steps,
                    (bool)source["allowSkip"], new CutsceneCompletion(placements, actions));
                return definition;
            }
            catch { Object.DestroyImmediate(definition); throw; }
        }
    }
}
