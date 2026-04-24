using System.IO;
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
    }
}
