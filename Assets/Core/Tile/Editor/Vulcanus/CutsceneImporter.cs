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
            var ids = new HashSet<string>(StringComparer.Ordinal);
            var setup = CutsceneSequenceCompiler.Compile((JArray)source["onStart"] ?? new JArray(), path, out var setupSteps, "setup", ids);
            var compiled = CutsceneSequenceCompiler.Compile((JArray)source["sequence"], path, out var steps, "sequence", ids);
            var completionLua = CutsceneSequenceCompiler.Compile((JArray)source["onComplete"]["steps"] ?? new JArray(),
                path, out var completionSteps, "completion", ids);
            var definition = ScriptableObject.CreateInstance<CutsceneDefinition>();
            try
            {
                definition.name = (string)source["id"];
                var completion = source["onComplete"];
                var placements = completion["characterPlacements"].Select(placement =>
                    placement["anchor"] != null
                        ? new CutsceneCharacterPlacement((string)placement["character"], (string)placement["anchor"])
                        : new CutsceneCharacterPlacement((string)placement["character"], CutsceneSequenceCompiler.RequiredPosition(
                            placement["position"], path, "onComplete.characterPlacements.position"))).ToArray();
                // Omitted completion Lua explicitly means no actions, like an empty steps list.
                var actions = (string)completion["actions"] ?? "";
                try { new Script(CoreModules.Preset_HardSandbox).LoadString(actions, null, path + ":onComplete"); }
                catch (SyntaxErrorException error)
                {
                    throw new FormatException($"{path}, onComplete.actions: {error.DecoratedMessage}", error);
                }
                definition.Configure((string)source["id"], (string)source["mapId"], compiled, steps,
                    (bool)source["allowSkip"], new CutsceneCompletion(placements, actions, completionLua, completionSteps), setup, setupSteps);
                return definition;
            }
            catch { Object.DestroyImmediate(definition); throw; }
        }
    }
}
