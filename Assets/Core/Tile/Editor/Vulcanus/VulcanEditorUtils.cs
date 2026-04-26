using System;
using System.Collections.Generic;
using System.Linq;
using Core.Tile.Vulcanus;
using UnityEditor;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// Shared editor utilities used by both VulcanusJsonImporter and VulcanusWorldCatalogEditor.
    /// </summary>
    internal static class VulcanusEditorUtils
    {
        // ── Entity mapping ────────────────────────────────────────────────────

        /// <summary>
        /// Builds a fresh EntityPrefabMapping array from entity definition assets,
        /// preserving any prefab assignments that already exist in <paramref name="existingMappings"/>.
        /// Missing prefabs are appended to <paramref name="warnings"/>.
        /// </summary>
        public static VulcanusProject.EntityPrefabMapping[] BuildEntityMappings(
            VulcanEntityDefinition[] entityDefinitions,
            VulcanusProject.EntityPrefabMapping[]  existingMappings,
            List<string>                         warnings,
            bool                                 autoAssignSingleMatch = false,
            Action<int> reportUnresolved = null)
        {
            var existingByType = IndexByTypeId(existingMappings);
            var result = new List<VulcanusProject.EntityPrefabMapping>();
            var unresolved = 0;

            foreach (var definition in entityDefinitions ?? Array.Empty<VulcanEntityDefinition>())
            {
                if (definition == null || string.IsNullOrWhiteSpace(definition.EntityTypeId))
                    continue;

                existingByType.TryGetValue(definition.EntityTypeId, out var old);
                var mapping = new VulcanusProject.EntityPrefabMapping
                {
                    prefab            = old?.prefab,
                    candidatePrefabPaths = old?.candidatePrefabPaths ?? Array.Empty<string>()
                };
                mapping.BindDefinition(definition);

                if (mapping.prefab == null)
                {
                    var candidates = FindCandidatePrefabPaths(definition.EntityTypeId, definition.DisplayName);
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
                    warnings?.Add($"No prefab mapped for entity type '{definition.EntityTypeId}'. Assign it in a VulcanusWorldCatalog asset.");
                }

                result.Add(mapping);
                existingByType.Remove(definition.EntityTypeId);
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

        private static Dictionary<string, VulcanusProject.EntityPrefabMapping> IndexByTypeId(
            VulcanusProject.EntityPrefabMapping[] mappings)
        {
            var dict = new Dictionary<string, VulcanusProject.EntityPrefabMapping>(StringComparer.OrdinalIgnoreCase);
            if (mappings == null) return dict;
            foreach (var m in mappings)
            {
                var typeId = m?.GetEntityTypeId();
                if (!string.IsNullOrWhiteSpace(typeId))
                    dict[typeId] = m;
            }
            return dict;
        }
    }
}
