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
                manifest.clock = DescribeClock(AssetDatabase.LoadAssetAtPath<SystemRoot>(SystemRoot.PrefabPath).Clock);
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
            var catalog = DefaultCatalogAssets.Load();
            CatalogDiscovery.Refresh(catalog);
            PopulateResources(manifest, catalog, DefinitionCatalog.DefinitionTypes
                .Where(type => type.IsDefined(typeof(LuaResourceAttribute), false)));
        }

        internal static void PopulateResources(LuaBindingManifest manifest, DefinitionCatalog catalog, IEnumerable<Type> definitionTypes)
        {
            manifest.resources.Add("direction", DescribeDirections());
            foreach (var type in definitionTypes.OrderBy(type => type.GetCustomAttribute<LuaResourceAttribute>().Type, StringComparer.Ordinal))
            {
                var resourceType = type.GetCustomAttribute<LuaResourceAttribute>().Type;
                if (manifest.resources.ContainsKey(resourceType))
                    throw new InvalidOperationException($"Duplicate Lua resource catalog for type '{resourceType}'.");
                manifest.resources.Add(resourceType, type == typeof(CharacterAnimationDefinition)
                    ? DescribeAnimations(catalog, CatalogAssetDiscovery.Find("Assets", typeof(MemaoAnimationLibrary)).Cast<MemaoAnimationLibrary>().ToArray())
                    : DescribeCatalog(catalog, type));
            }
            foreach (var parameter in manifest.modules.SelectMany(module => module.methods).SelectMany(method => method.parameters))
                // Vulcanus owns the character definitions and supplies this selector itself.
                if (parameter.resourceType != null && parameter.resourceType != "character" && !manifest.resources.ContainsKey(parameter.resourceType))
                    throw new InvalidOperationException($"No resources exported for type '{parameter.resourceType}'.");
        }

        internal static LuaResourceDescription[] DescribeCatalog(DefinitionCatalog catalog, Type type)
        {
            var metadata = type.GetCustomAttribute<LuaResourceAttribute>();
            var member = type.GetMember(metadata.DescriptionMember, BindingFlags.Public | BindingFlags.Instance).SingleOrDefault();
            Func<Object, string> description = member switch
            {
                PropertyInfo property when property.PropertyType == typeof(string) => definition => (string)property.GetValue(definition),
                FieldInfo field when field.FieldType == typeof(string) => definition => (string)field.GetValue(definition),
                _ => throw new InvalidOperationException($"Lua resource '{metadata.Type}': {type.Name}.{metadata.DescriptionMember} must be a public string field or property.")
            };
            return catalog.All(type).OrderBy(DefinitionCatalog.GetId, StringComparer.Ordinal)
                .Select(definition => new LuaResourceDescription { id = DefinitionCatalog.GetId(definition), description = description(definition) }).ToArray();
        }

        internal static LuaClockDescription DescribeClock(Core.TimeAndWeather.ClockSettings clock) => new()
        {
            secondsPerInGameMinute = clock.SecondsPerMinute,
            startOfDay = clock.startOfDay,
            endOfDay = clock.endOfDay
        };

        internal static LuaResourceDescription[] DescribeDirections() => CardinalDirections.Values.Keys.OrderBy(id => id, StringComparer.Ordinal)
            .Select(id => new LuaResourceDescription { id = id, description = id }).ToArray();

        internal static LuaResourceDescription[] DescribeAnimations(DefinitionCatalog catalog, MemaoAnimationLibrary[] libraries) =>
            catalog.All<CharacterAnimation>()
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
                path.EndsWith(".apollocue", StringComparison.OrdinalIgnoreCase) ||
                path.Equals(SystemRoot.PrefabPath, StringComparison.OrdinalIgnoreCase)))
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
