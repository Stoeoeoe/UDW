using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using Character;
using Character.Animations;
using Core.Catalogs;
using Core.Catalogs.Editor;
using Newtonsoft.Json;
using UnityEditor;
using UnityEditor.Callbacks;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Scripting.Editor
{
    internal sealed class LuaBindingManifestExporter : AssetPostprocessor
    {
        private const string RelativePath = "Generated/Scripting/bindings.json";
        internal const string DependencyName = "UrdewValley.LuaBindings";
        private static bool _scheduled;

        [DidReloadScripts]
        private static void Reloaded() => Schedule();

        [MenuItem("Tools/Scripting/Regenerate Lua bindings.json")]
        public static void Export()
        {
            try
            {
                var manifest = VulcanusLuaEngine.DescribeBindings();
                DefaultCatalogAssets.CreateMissingCatalogs();
                PopulateResources(manifest);
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

        internal static void PopulateResources(LuaBindingManifest manifest)
        {
            var catalogs = TypeCache.GetTypesWithAttribute<LuaResourceAttribute>()
                .Select(DefaultCatalogAssets.Load).ToArray();
            foreach (var catalog in catalogs) CatalogDiscovery.Refresh(catalog);
            PopulateResources(manifest, catalogs);
        }

        internal static void PopulateResources(LuaBindingManifest manifest, IEnumerable<DefinitionCatalog> catalogs)
        {
            manifest.resources.Add("direction", DescribeDirections());
            foreach (var catalog in catalogs.OrderBy(catalog => catalog.GetType().GetCustomAttribute<LuaResourceAttribute>().Type, StringComparer.Ordinal))
            {
                var resourceType = catalog.GetType().GetCustomAttribute<LuaResourceAttribute>().Type;
                if (manifest.resources.ContainsKey(resourceType))
                    throw new InvalidOperationException($"Duplicate Lua resource catalog for type '{resourceType}'.");
                manifest.resources.Add(resourceType, catalog is CharacterAnimationCatalog animations
                    ? DescribeAnimations(animations, CatalogAssetDiscovery.Find("Assets", typeof(MemaoAnimationLibrary)).Cast<MemaoAnimationLibrary>().ToArray())
                    : DescribeCatalog(catalog));
            }
            foreach (var parameter in manifest.modules.SelectMany(module => module.methods).SelectMany(method => method.parameters))
                // Vulcanus owns the character definitions and supplies this selector itself.
                if (parameter.resourceType != null && parameter.resourceType != "character" && !manifest.resources.ContainsKey(parameter.resourceType))
                    throw new InvalidOperationException($"No resources exported for type '{parameter.resourceType}'.");
        }

        internal static LuaResourceDescription[] DescribeCatalog(DefinitionCatalog catalog)
        {
            var metadata = catalog.GetType().GetCustomAttribute<LuaResourceAttribute>();
            var member = catalog.DefinitionType.GetMember(metadata.DescriptionMember, BindingFlags.Public | BindingFlags.Instance).SingleOrDefault();
            Func<Object, string> description = member switch
            {
                PropertyInfo property when property.PropertyType == typeof(string) => definition => (string)property.GetValue(definition),
                FieldInfo field when field.FieldType == typeof(string) => definition => (string)field.GetValue(definition),
                _ => throw new InvalidOperationException($"Lua resource '{metadata.Type}': {catalog.DefinitionType.Name}.{metadata.DescriptionMember} must be a public string field or property.")
            };
            return catalog.Entries.Where(entry => entry.Enabled).Select(entry => entry.Definition)
                .OrderBy(catalog.GetId, StringComparer.Ordinal)
                .Select(definition => new LuaResourceDescription { id = catalog.GetId(definition), description = description(definition) }).ToArray();
        }

        internal static LuaResourceDescription[] DescribeDirections() => CardinalDirections.Values.Keys.OrderBy(id => id, StringComparer.Ordinal)
            .Select(id => new LuaResourceDescription { id = id, description = id }).ToArray();

        internal static LuaResourceDescription[] DescribeAnimations(CharacterAnimationCatalog catalog, MemaoAnimationLibrary[] libraries) =>
            catalog.EnabledDefinitions.OfType<CharacterAnimation>()
                .Where(animation => IsOneShotCandidate(animation, libraries))
                .OrderBy(animation => animation.Id, StringComparer.Ordinal)
                .Select(animation => new LuaResourceDescription { id = animation.Id, description = animation.name }).ToArray();

        private static bool IsOneShotCandidate(CharacterAnimation animation, MemaoAnimationLibrary[] libraries)
        {
            var errors = animation.ValidateConfiguration();
            if (errors.Count > 0) throw new InvalidOperationException(string.Join("\n", errors));
            if (animation.Clip) return !animation.Clip.isLooping && animation.Clip.length > 0;
            // Different characters can offer different actions; binding checks the selected character's library.
            return libraries.Any(library => new[] { Vector2.down, Vector2.up, Vector2.left, Vector2.right }.All(facing =>
                library.TryGet(MemaoAnimationLibrary.DirectionalName(animation.MemaoAction, facing), out var clip) &&
                !clip.isLooping && clip.length > 0));
        }

        private static void Schedule()
        {
            if (_scheduled) return;
            _scheduled = true;
            EditorApplication.delayCall += () =>
            {
                _scheduled = false;
                if (!EditorApplication.isPlayingOrWillChangePlaymode) Export();
            };
        }

        private static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
        {
            if (imported.Concat(deleted).Concat(moved).Concat(movedFrom).Any(path =>
                path.EndsWith(".asset", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".anim", StringComparison.OrdinalIgnoreCase) ||
                path.EndsWith(".apollocue", StringComparison.OrdinalIgnoreCase)))
                Schedule();
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
