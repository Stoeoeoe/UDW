using System;
using System.Linq;
using Core.Inventory;
using Core.Tile.Vulcanus;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.AssetImporters;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// Imports a *.vitm file as the <see cref="ItemDefinition"/> class its project's item class names. The item's
    /// classProperties fill that class's own fields.
    /// </summary>
    internal static class ItemImporter
    {
        public static void ImportItem(AssetImportContext ctx)
        {
            var source = JObject.Parse(VulcanusSchema.ReadChecked(ctx));
            var type = ItemType(ctx, (string)source["classId"]);
            if (source["classProperties"] is JObject properties)
            {
                source.Remove("classProperties");
                source.Merge(properties);
            }
            VulcanusJson.Import(ctx, type, "item", source.ToString(), item => ((ItemDefinition)item).ItemId);
        }

        private static Type ItemType(AssetImportContext ctx, string classId)
        {
            var projectPath = VulcanusImportHelpers.FindProjectAssetPath(ctx.assetPath)
                ?? throw new FormatException($"{ctx.assetPath}: items need a Vulcanus project for their item class.");
            VulcanusImportHelpers.AddDependency(ctx, projectPath);
            var project = AssetDatabase.LoadAssetAtPath<VulcanusProject>(projectPath)
                ?? throw new FormatException($"{ctx.assetPath}: project '{projectPath}' has not imported successfully.");
            var itemClass = project.ItemClassMappings.FirstOrDefault(mapping => mapping.classId == classId)
                ?? throw new FormatException($"{ctx.assetPath}: unknown item class '{classId}'.");
            var type = VulcanusImportHelpers.ResolveTypeByName(itemClass.className);
            return type != null && typeof(ItemDefinition).IsAssignableFrom(type) && !type.IsAbstract
                ? type
                : throw new FormatException($"{ctx.assetPath}: item class '{classId}' needs className, the full name of a concrete ItemDefinition class.");
        }
    }
}
