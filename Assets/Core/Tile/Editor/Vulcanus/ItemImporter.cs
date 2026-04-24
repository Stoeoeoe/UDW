using System;
using System.Linq;
using Core.Inventory;
using Core.Tile.Vulcanus;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class ItemImporter
    {
        public static void ImportItem(AssetImportContext ctx)
        {
            var dto = VulcanusImportHelpers.LoadDto<ItemDto>(ctx.assetPath);

            var projectAssetPath = VulcanusImportHelpers.FindProjectAssetPath(ctx.assetPath);
            ProjectDto projectDto = null;
            VulcanusProject projectAsset = null;
            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                try
                {
                    VulcanusImportHelpers.AddDependency(ctx, projectAssetPath);
                    projectDto = VulcanusImportHelpers.LoadDto<ProjectDto>(projectAssetPath);
                }
                catch { /* best-effort */ }

                try
                {
                    projectAsset = AssetDatabase.LoadAssetAtPath<VulcanusProject>(projectAssetPath);
                }
                catch
                {
                    projectAsset = null;
                }
            }

            ItemClassDto classDto = null;
            if (!string.IsNullOrEmpty(dto.ClassId))
            {
                if (projectAsset?.ItemClassMappings != null)
                {
                    var mapping = projectAsset.ItemClassMappings.FirstOrDefault(x =>
                        string.Equals(x.classId, dto.ClassId, StringComparison.OrdinalIgnoreCase));
                    if (mapping != null)
                        classDto = new ItemClassDto
                        {
                            Id = mapping.classId,
                            ClassName = mapping.className,
                            Extra = new System.Collections.Generic.Dictionary<string, Newtonsoft.Json.Linq.JToken>()
                        };
                }

                if (classDto == null && projectDto?.ItemClasses != null)
                    classDto = projectDto.ItemClasses.FirstOrDefault(c =>
                        string.Equals(c.Id, dto.ClassId, StringComparison.OrdinalIgnoreCase));
            }

            Type itemType = null;
            if (classDto != null && !string.IsNullOrWhiteSpace(classDto.ClassName))
                itemType = VulcanusImportHelpers.ResolveTypeByName(classDto.ClassName);

            if (itemType == null && projectAsset?.ItemClassMappings != null)
            {
                var mapping = projectAsset.ItemClassMappings.FirstOrDefault(x =>
                    string.Equals(x.classId, dto.ClassId, StringComparison.OrdinalIgnoreCase));
                if (mapping?.candidateTypeNames != null)
                {
                    foreach (var candidate in mapping.candidateTypeNames)
                    {
                        itemType = VulcanusImportHelpers.ResolveTypeByName(candidate);
                        if (itemType != null) break;
                    }
                }
            }

            if (itemType == null || !typeof(ItemDefinition).IsAssignableFrom(itemType) || itemType.IsAbstract)
            {
                Debug.LogError(
                    $"[VulcanusJsonImporter] Could not resolve ItemDefinition class '{classDto?.ClassName}' for item '{dto.Id}'. Importing as text fallback.");
                VulcanusImportHelpers.ImportAsText(ctx);
                return;
            }

            var item = (ScriptableObject)ScriptableObject.CreateInstance(itemType);
            item.name = !string.IsNullOrEmpty(dto.Id) ? dto.Id : VulcanusImportHelpers.GetBaseName(ctx.assetPath);

            VulcanusImportHelpers.TrySetMemberValue(item, "ItemId", dto.Id);
            VulcanusImportHelpers.TrySetMemberValue(item, "ItemName", dto.Name);
            VulcanusImportHelpers.TrySetMemberValue(item, "Category", dto.Category);
            VulcanusImportHelpers.TrySetMemberValue(item, "Description", dto.Description);
            VulcanusImportHelpers.TrySetMemberValue(item, "MaxStackSize", dto.MaxStackSize);

            var iconAssetPath =
                VulcanusImportHelpers.ResolveAssetReferencePath(ctx.assetPath, dto.Icon, projectAssetPath);
            if (!string.IsNullOrEmpty(iconAssetPath))
            {
                VulcanusImportHelpers.AddDependency(ctx, iconAssetPath);
                var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(iconAssetPath);
                if (sprite != null)
                    VulcanusImportHelpers.TrySetMemberValue(item, "Icon", sprite);
            }

            if (!string.IsNullOrWhiteSpace(dto.PickupSound))
            {
                var soundPath =
                    VulcanusImportHelpers.ResolveAssetReferencePath(ctx.assetPath, dto.PickupSound, projectAssetPath);
                if (!string.IsNullOrEmpty(soundPath))
                {
                    VulcanusImportHelpers.AddDependency(ctx, soundPath);
                    var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(soundPath);
                    if (clip != null)
                        VulcanusImportHelpers.TrySetMemberValue(item, "PickupSound", clip);
                }
            }

            if (dto.ClassProperties != null && dto.ClassProperties.Count > 0)
            {
                foreach (var kv in dto.ClassProperties)
                    VulcanusImportHelpers.TryApplyPropertyToObject(item, kv.Key, kv.Value);
            }

            ctx.AddObjectToAsset("item", item);
            ctx.SetMainObject(item);
        }
    }
}
