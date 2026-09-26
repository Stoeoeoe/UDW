using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using Core.Tile.Vulcanus;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class VulcanusImportHelpers
    {
        // ── Text fallback ─────────────────────────────────────────────────────

        public static void ImportAsText(AssetImportContext ctx)
        {
            var text = new TextAsset(File.ReadAllText(ToAbsolutePath(ctx.assetPath)));
            text.name = Path.GetFileNameWithoutExtension(ctx.assetPath);
            ctx.AddObjectToAsset("text", text);
            ctx.SetMainObject(text);
        }

        // ── Terrain mapping ───────────────────────────────────────────────────

        public static TerrainType MapTerrainIdToTerrainType(string terrainId, VulcanusProject project)
        {
            if (project != null && project.TryMapTerrainId(terrainId, out var mapped)) return mapped;
            if (string.IsNullOrWhiteSpace(terrainId)) return TerrainType.Invalid;

            if (terrainId.Equals("grass", StringComparison.OrdinalIgnoreCase)) return TerrainType.Grass;
            if (terrainId.Equals("dirt", StringComparison.OrdinalIgnoreCase) ||
                terrainId.Equals("soil", StringComparison.OrdinalIgnoreCase)) return TerrainType.Dirt;
            if (terrainId.Equals("sand", StringComparison.OrdinalIgnoreCase)) return TerrainType.Sand;
            if (terrainId.Equals("water", StringComparison.OrdinalIgnoreCase)) return TerrainType.Water;

            return TerrainType.Invalid;
        }

        // ── JSON helpers ──────────────────────────────────────────────────────

        public static T LoadDto<T>(string assetPath) =>
            JsonConvert.DeserializeObject<T>(File.ReadAllText(ToAbsolutePath(assetPath)));

        public static bool TryReadInt(JToken token, out int value)
        {
            value = 0;
            if (token == null || token.Type == JTokenType.Null) return false;
            if (token.Type == JTokenType.Integer)
            {
                value = token.Value<int>();
                return true;
            }

            if (token.Type == JTokenType.Float)
            {
                value = Mathf.RoundToInt(token.Value<float>());
                return true;
            }

            if (token.Type != JTokenType.String) return false;
            return int.TryParse(token.Value<string>(), NumberStyles.Integer, CultureInfo.InvariantCulture, out value);
        }

        public static Color ParseHexColor(string hex, Color fallback) =>
            !string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var color) ? color : fallback;

        // ── Path utilities ────────────────────────────────────────────────────

        public static string GetBaseName(string assetPath)
        {
            var fileName = Path.GetFileName(assetPath);
            if (fileName.EndsWith(".runtime.dialogue.json", StringComparison.OrdinalIgnoreCase)) return fileName[..^".runtime.dialogue.json".Length];
            if (fileName.EndsWith(".entity.json", StringComparison.OrdinalIgnoreCase)) return fileName[..^".entity.json".Length];
            if (fileName.EndsWith(".vmap", StringComparison.OrdinalIgnoreCase)) return fileName[..^".vmap".Length];
            if (fileName.EndsWith(".vts", StringComparison.OrdinalIgnoreCase)) return fileName[..^".vts".Length];
            if (fileName.EndsWith(".vproj", StringComparison.OrdinalIgnoreCase)) return fileName[..^".vproj".Length];
            if (fileName.EndsWith(".vitm", StringComparison.OrdinalIgnoreCase)) return fileName[..^".vitm".Length];
            return Path.GetFileNameWithoutExtension(fileName);
        }

        public static string ToAbsolutePath(string path) =>
            Path.IsPathRooted(path)
                ? Path.GetFullPath(path)
                : Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), path));

        public static bool TryAbsoluteToAssetPath(string absolutePath, out string assetPath)
        {
            var normalizedAbsolute = Path.GetFullPath(absolutePath).Replace('\\', '/');
            var assetsRoot = Path.GetFullPath(Application.dataPath).Replace('\\', '/');

            if (normalizedAbsolute.StartsWith(assetsRoot, StringComparison.OrdinalIgnoreCase))
            {
                assetPath = "Assets" + normalizedAbsolute[assetsRoot.Length..];
                return true;
            }

            assetPath = null;
            return false;
        }

        public static void AddDependency(AssetImportContext ctx, string assetPath)
        {
            if (string.IsNullOrEmpty(assetPath)) return;
            ctx.DependsOnSourceAsset(assetPath);
            ctx.DependsOnArtifact(assetPath);
        }

        public static string FindProjectAssetPath(string assetPath)
        {
            var directory = Path.GetDirectoryName(ToAbsolutePath(assetPath));
            while (!string.IsNullOrEmpty(directory))
            {
                var canonical = Path.Combine(directory, "vproj");
                if (File.Exists(canonical) && TryAbsoluteToAssetPath(canonical, out var canonicalPath))
                    return canonicalPath;

                var generic = Directory
                    .GetFiles(directory, "*.vproj", SearchOption.TopDirectoryOnly)
                    .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
                    .FirstOrDefault(p => TryAbsoluteToAssetPath(p, out _));

                if (generic != null && TryAbsoluteToAssetPath(generic, out var genericPath))
                    return genericPath;

                directory = Path.GetDirectoryName(directory);
            }

            return null;
        }

        public static int GetProjectTileSize(string projectAssetPath)
        {
            try
            {
                var dto = LoadDto<ProjectDto>(projectAssetPath);
                return Math.Max(1, dto.TileSize > 0 ? dto.TileSize : 16);
            }
            catch (Exception ex)
            {
                Debug.LogWarning(
                    $"[VulcanusJsonImporter] Could not read tileSize from '{projectAssetPath}': {ex.Message}");
                return 16;
            }
        }

        public static string FindTilesetById(string mapAssetPath, string tilesetId, string projectAssetPath)
        {
            if (string.IsNullOrEmpty(tilesetId)) return null;

            var mapFolder = Path.GetDirectoryName(ToAbsolutePath(mapAssetPath));
            var projectRoot = !string.IsNullOrEmpty(projectAssetPath)
                ? Path.GetDirectoryName(ToAbsolutePath(projectAssetPath))
                : Path.GetDirectoryName(mapFolder) ?? mapFolder;

            var canonical = Path.Combine(projectRoot, "tilesets", $"{tilesetId}.vts");
            if (File.Exists(canonical) && TryAbsoluteToAssetPath(canonical, out var canonicalAssetPath))
                return canonicalAssetPath;

            foreach (var filePath in Directory.GetFiles(projectRoot, "*.vts", SearchOption.AllDirectories)
                         .OrderBy(p => p))
            {
                try
                {
                    var dto = LoadDto<TilesetDto>(filePath);
                    if (!string.Equals(dto.Id, tilesetId, StringComparison.OrdinalIgnoreCase)) continue;
                    if (TryAbsoluteToAssetPath(filePath, out var path)) return path;
                }
                catch
                {
                    /* ignore malformed tileset candidates */
                }
            }

            return null;
        }

        public static string ResolveAssetReferencePath(string ownerAssetPath, string relativePath,
            string projectAssetPath)
        {
            if (string.IsNullOrWhiteSpace(relativePath)) return null;
            if (TryResolveRelative(ownerAssetPath, relativePath, out var byOwner)) return byOwner;
            if (!string.IsNullOrEmpty(projectAssetPath) &&
                TryResolveRelative(projectAssetPath, relativePath, out var byProject)) return byProject;

            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                var projectRoot = Path.GetDirectoryName(ToAbsolutePath(projectAssetPath));
                var targetFileName = Path.GetFileName(relativePath);
                if (!string.IsNullOrWhiteSpace(projectRoot) && !string.IsNullOrWhiteSpace(targetFileName) &&
                    Directory.Exists(projectRoot))
                {
                    var candidate = Directory
                        .GetFiles(projectRoot, targetFileName, SearchOption.AllDirectories)
                        .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
                        .FirstOrDefault(p => TryAbsoluteToAssetPath(p, out _));

                    if (candidate != null && TryAbsoluteToAssetPath(candidate, out var fallbackPath))
                        return fallbackPath;
                }
            }

            return null;
        }

        private static bool TryResolveRelative(string ownerAssetPath, string relativePath,
            out string resolvedAssetPath)
        {
            resolvedAssetPath = null;
            var ownerDir = Path.GetDirectoryName(ToAbsolutePath(ownerAssetPath));
            if (string.IsNullOrEmpty(ownerDir)) return false;

            var absolute = Path.IsPathRooted(relativePath)
                ? Path.GetFullPath(relativePath)
                : Path.GetFullPath(Path.Combine(ownerDir, relativePath));

            if (!File.Exists(absolute)) return false;
            return TryAbsoluteToAssetPath(absolute, out resolvedAssetPath);
        }

        // ── Reflection helpers ────────────────────────────────────────────────

        public static bool TryApplyPropertyToObject(object target, string key, JToken token)
        {
            if (target == null || string.IsNullOrWhiteSpace(key) || token == null) return false;

            var type = target.GetType();
            var flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.IgnoreCase;

            var field = type.GetField(key, flags);
            PropertyInfo prop = null;
            FieldInfo backingField = null;
            if (field == null)
            {
                prop = type.GetProperty(key, flags);
                if (prop == null)
                {
                    var backingName = $"<{key}>k__BackingField";
                    backingField = type.GetField(backingName, flags);
                }
            }

            if (field == null && prop == null && backingField == null) return false;

            Type targetType = field != null
                ? field.FieldType
                : (backingField != null ? backingField.FieldType : prop.PropertyType);

            object value = null;
            try
            {
                if (targetType == typeof(bool) || targetType == typeof(bool?))
                {
                    if (token.Type == JTokenType.Boolean)
                        value = token.Value<bool>();
                    else if (token.Type == JTokenType.Integer)
                        value = token.Value<int>() != 0;
                    else
                    {
                        var s = token.ToString();
                        if (bool.TryParse(s, out var b)) value = b;
                        else if (int.TryParse(s, out var iv)) value = iv != 0;
                        else value = false;
                    }
                }
                else
                {
                    value = token.ToObject(targetType);
                }

                if (field != null)
                    field.SetValue(target, value);
                else if (backingField != null)
                    backingField.SetValue(target, value);
                else
                    prop.SetValue(target, value);

                return true;
            }
            catch
            {
                return false;
            }
        }

        public static bool TrySetMemberValue(object target, string key, object value)
        {
            if (target == null || string.IsNullOrWhiteSpace(key)) return false;
            var type = target.GetType();
            var flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.IgnoreCase;

            var field = type.GetField(key, flags);
            PropertyInfo prop = null;
            FieldInfo backingField = null;
            if (field == null)
            {
                prop = type.GetProperty(key, flags);
                if (prop == null)
                {
                    var backingName = $"<{key}>k__BackingField";
                    backingField = type.GetField(backingName, flags);
                }
            }

            if (field == null && prop == null && backingField == null) return false;

            try
            {
                if (field != null)
                {
                    var converted = ConvertIfNeeded(value, field.FieldType);
                    field.SetValue(target, converted);
                }
                else if (backingField != null)
                {
                    var converted = ConvertIfNeeded(value, backingField.FieldType);
                    backingField.SetValue(target, converted);
                }
                else
                {
                    var converted = ConvertIfNeeded(value, prop.PropertyType);
                    prop.SetValue(target, converted);
                }

                return true;
            }
            catch
            {
                return false;
            }
        }

        private static object ConvertIfNeeded(object value, Type targetType)
        {
            if (value == null) return null;
            var valType = value.GetType();
            if (targetType.IsAssignableFrom(valType)) return value;
            try
            {
                if (targetType.IsEnum && value is string s)
                    return Enum.Parse(targetType, s, true);
                return Convert.ChangeType(value, Nullable.GetUnderlyingType(targetType) ?? targetType,
                    CultureInfo.InvariantCulture);
            }
            catch
            {
                return value;
            }
        }

        public static Type ResolveTypeByName(string fullName)
        {
            if (string.IsNullOrWhiteSpace(fullName)) return null;
            var t = Type.GetType(fullName, false, true);
            if (t != null) return t;

            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    t = asm.GetType(fullName, false, true);
                    if (t != null) return t;
                }
                catch { }
            }

            var shortName = fullName.Contains('.') ? fullName.Split('.').Last() : fullName;
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    var found = asm.GetTypes().FirstOrDefault(x =>
                        string.Equals(x.Name, shortName, StringComparison.OrdinalIgnoreCase));
                    if (found != null) return found;
                }
                catch { }
            }

            return null;
        }
    }
}
