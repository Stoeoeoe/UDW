using System.IO;
using System.Linq;
using Core.Tile.Vulcanus;
using Newtonsoft.Json;
using UnityEditor;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class VulcanusProjectRegistry
    {
        /// <summary>
        /// Loads the VulcanusWorldCatalog for a project by convention:
        /// reads the project id, then loads &lt;id&gt;.project.world.asset from the same directory.
        /// Safe to call inside ScriptedImporter — no AssetDatabase.FindAssets.
        /// </summary>
        public static VulcanusWorldCatalog FindWorldCatalogForProject(string projectAssetPath)
        {
            if (string.IsNullOrWhiteSpace(projectAssetPath)) return null;

            string projectId;
            try
            {
                var dto = JsonConvert.DeserializeObject<ProjectDto>(
                    File.ReadAllText(VulcanusImportHelpers.ToAbsolutePath(projectAssetPath)));
                projectId = dto?.Id;
            }
            catch
            {
                return null;
            }

            if (string.IsNullOrWhiteSpace(projectId)) return null;

            var dir = Path.GetDirectoryName(projectAssetPath)?.Replace('\\', '/');
            var catalogAssetPath = $"{dir}/{projectId}.project.world.asset";
            return AssetDatabase.LoadAssetAtPath<VulcanusWorldCatalog>(catalogAssetPath);
        }

        public static VulcanEntityDefinition[] FindEntityDefinitionsForProject(string projectAssetPath)
        {
            if (string.IsNullOrWhiteSpace(projectAssetPath))
                return System.Array.Empty<VulcanEntityDefinition>();

            var projectRoot = Path.GetDirectoryName(VulcanusImportHelpers.ToAbsolutePath(projectAssetPath));
            if (string.IsNullOrWhiteSpace(projectRoot) || !Directory.Exists(projectRoot))
                return System.Array.Empty<VulcanEntityDefinition>();

            var assetPaths = Directory
                .GetFiles(projectRoot, "*.entity.json", SearchOption.AllDirectories)
                .OrderBy(path => path, System.StringComparer.OrdinalIgnoreCase)
                .Select(path => VulcanusImportHelpers.TryAbsoluteToAssetPath(path, out var assetPath) ? assetPath : null)
                .Where(path => !string.IsNullOrWhiteSpace(path));

            return assetPaths
                .Select(AssetDatabase.LoadAssetAtPath<VulcanEntityDefinition>)
                .Where(definition => definition != null)
                .ToArray();
        }
    }
}
