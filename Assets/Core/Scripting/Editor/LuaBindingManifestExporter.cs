using System;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using UnityEditor;
using UnityEditor.Callbacks;
using UnityEngine;

namespace Core.Scripting.Editor
{
    internal static class LuaBindingManifestExporter
    {
        private const string RelativePath = "Generated/Scripting/bindings.json";
        internal const string DependencyName = "UrdewValley.LuaBindings";

        [DidReloadScripts, MenuItem("Tools/Scripting/Regenerate Lua bindings.json")]
        public static void Export()
        {
            try
            {
                var manifest = VulcanusLuaEngine.DescribeBindings();
                AssetDatabase.RegisterCustomDependency(DependencyName, Hash128.Compute(Serialize(manifest)));
                var path = Path.Combine(Path.GetDirectoryName(Application.dataPath), RelativePath);
                if (!WriteIfChanged(path, manifest)) return;

                Debug.Log($"[Lua bindings] Updated {RelativePath}");
            }
            catch (Exception exception)
            {
                Debug.LogError($"[Lua bindings] Could not export {RelativePath}: {exception}");
            }
        }

        internal static bool WriteIfChanged(string path, LuaBindingManifest manifest)
        {
            var content = Serialize(manifest) + "\n";
            if (File.Exists(path) && File.ReadAllText(path) == content) return false;
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, content, new UTF8Encoding(false));
            return true;
        }

        private static string Serialize(LuaBindingManifest manifest) => JsonConvert.SerializeObject(manifest,
            Formatting.Indented, new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore });
    }
}
