using Core.Routines;
using UnityEditor.AssetImporters;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>Imports *.routine.json into a <see cref="RoutineDefinition"/>. Cross-references are checked by the routine catalog.</summary>
    internal static class RoutineImporter
    {
        public static void ImportRoutine(AssetImportContext ctx) => VulcanusJson.Import<RoutineDefinition>(ctx, "routine", routine => routine.Id);
    }
}
