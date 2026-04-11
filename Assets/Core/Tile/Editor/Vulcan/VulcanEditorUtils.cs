using System;
using System.Collections.Generic;
using System.Linq;
using Core.Tile.Vulcan;
using UnityEditor;
using UnityEngine;

namespace Core.Tile.Editor.Vulcan
{
    /// <summary>
    /// Shared editor utilities used by both VulcanJsonImporter and VulcanWorldCatalogEditor.
    /// </summary>
    internal static class VulcanEditorUtils
    {
        // ── Entity mapping ────────────────────────────────────────────────────

        /// <summary>
        /// Builds a fresh EntityPrefabMapping array from entity type definitions,
        /// preserving any prefab assignments that already exist in <paramref name="existingMappings"/>.
        /// Missing prefabs are appended to <paramref name="warnings"/>.
        /// </summary>
        public static VulcanProject.EntityPrefabMapping[] BuildEntityMappings(
            VulcanProject.EntityTypeDefinition[] entityTypes,
            VulcanProject.EntityPrefabMapping[]  existingMappings,
            List<string>                         warnings,
            bool                                 autoAssignSingleMatch = false,
            Action<int> reportUnresolved = null)
        {
            var existingByType = IndexByTypeId(existingMappings);
            var result = new List<VulcanProject.EntityPrefabMapping>();
            var unresolved = 0;

            foreach (var type in entityTypes ?? Array.Empty<VulcanProject.EntityTypeDefinition>())
            {
                if (string.IsNullOrWhiteSpace(type.id)) continue;

                existingByType.TryGetValue(type.id, out var old);
                var mapping = new VulcanProject.EntityPrefabMapping
                {
                    entityTypeId      = type.id,
                    entityDisplayName = string.IsNullOrWhiteSpace(type.displayName) ? type.id : type.displayName,
                    prefab            = old?.prefab,
                    candidatePrefabPaths = old?.candidatePrefabPaths ?? Array.Empty<string>()
                };

                if (mapping.prefab == null)
                {
                    var candidates = FindCandidatePrefabPaths(type.id, type.displayName);
                    mapping.candidatePrefabPaths = candidates;

                    if (autoAssignSingleMatch && candidates.Length == 1)
                    {
                        var auto = AssetDatabase.LoadAssetAtPath<GameObject>(candidates[0]);
                        if (auto != null) mapping.prefab = auto;
                    }
                }

                if (mapping.prefab == null)
                {
                    unresolved++;
                    warnings?.Add($"No prefab mapped for entity type '{type.id}'. Assign it in a VulcanWorldCatalog asset.");
                }

                result.Add(mapping);
                existingByType.Remove(type.id);
            }

            // Keep any manual rows for entity types not in the current definition.
            foreach (var leftover in existingByType.Values.Where(m => m != null))
                result.Add(leftover);

            reportUnresolved?.Invoke(unresolved);
            return result.ToArray();
        }

        // ── Prefab candidate search ───────────────────────────────────────────

        public static string[] FindCandidatePrefabPaths(string entityTypeId, string displayName)
        {
            var searchTokens = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(entityTypeId)) searchTokens.Add(entityTypeId);
            if (!string.IsNullOrWhiteSpace(displayName))  searchTokens.Add(displayName);

            var normalizedTokens = new HashSet<string>(
                searchTokens.Select(NormalizeName).Where(t => !string.IsNullOrEmpty(t)),
                StringComparer.OrdinalIgnoreCase);

            var exact = new List<string>();
            var fuzzy = new List<string>();
            var seen  = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var token in searchTokens.Concat(normalizedTokens).Where(t => !string.IsNullOrWhiteSpace(t)))
                CollectCandidates(AssetDatabase.FindAssets($"t:Prefab {token}"), normalizedTokens, exact, fuzzy, seen);

            return exact.Count > 0
                ? exact.OrderBy(p => p, StringComparer.OrdinalIgnoreCase).ToArray()
                : fuzzy.OrderBy(p => p, StringComparer.OrdinalIgnoreCase).ToArray();
        }

        private static void CollectCandidates(
            string[] guids,
            HashSet<string> normalizedTokens,
            List<string> exactMatches,
            List<string> fuzzyMatches,
            HashSet<string> seenPaths)
        {
            foreach (var guid in guids)
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (string.IsNullOrWhiteSpace(path) || seenPaths.Contains(path)) continue;

                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (prefab == null) continue;

                var norm    = NormalizeName(prefab.name);
                var isExact = normalizedTokens.Contains(norm);
                var isFuzzy = !isExact && normalizedTokens.Any(t => norm.Contains(t) || t.Contains(norm));
                if (!isExact && !isFuzzy) continue;

                seenPaths.Add(path);
                (isExact ? exactMatches : fuzzyMatches).Add(path);
            }
        }

        // ── Shared helpers ────────────────────────────────────────────────────

        public static string NormalizeName(string value) =>
            string.IsNullOrWhiteSpace(value)
                ? string.Empty
                : new string(value.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();

        private static Dictionary<string, VulcanProject.EntityPrefabMapping> IndexByTypeId(
            VulcanProject.EntityPrefabMapping[] mappings)
        {
            var dict = new Dictionary<string, VulcanProject.EntityPrefabMapping>(StringComparer.OrdinalIgnoreCase);
            if (mappings == null) return dict;
            foreach (var m in mappings)
                if (m != null && !string.IsNullOrWhiteSpace(m.entityTypeId))
                    dict[m.entityTypeId] = m;
            return dict;
        }
    }
}
