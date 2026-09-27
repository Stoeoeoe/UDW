using System;
using System.IO;
using System.Text;
using Core.Scripting;
using UnityEditor;
using UnityEditor.Callbacks;
using UnityEngine;

internal static class LuaBindingManifestExporter
{
    private const string RelativePath = "Generated/Scripting/bindings.json";

    [DidReloadScripts]
    private static void AfterScriptsReload() => Export();

    [MenuItem("Tools/Scripting/Regenerate Lua bindings.json")]
    public static void Export()
    {
        try
        {
            var manifest = new VulcanusLuaEngine().DescribeBindings();
            var projectRoot = Path.GetDirectoryName(Application.dataPath);
            var path = Path.Combine(projectRoot, RelativePath);
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
        if (File.Exists(path))
        {
            try
            {
                var previous = JsonUtility.FromJson<LuaBindingManifest>(File.ReadAllText(path));
                if (previous != null && JsonUtility.ToJson(previous) == JsonUtility.ToJson(manifest))
                    return false;
            }
            catch (ArgumentException)
            {
                // An invalid old manifest is replaced by the current valid contract.
            }
        }
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        File.WriteAllText(path, JsonUtility.ToJson(manifest, true) + "\n", new UTF8Encoding(false));
        return true;
    }
}
