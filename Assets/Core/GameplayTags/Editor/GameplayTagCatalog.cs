using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace Core.GameplayTags.Editor
{
    public sealed class GameplayTagCatalog : ScriptableObject
    {
        private const string AssetPath = "Assets/Core/GameplayTags/Editor/GameplayTagCatalog.asset";

        [SerializeField] private List<string> tags = new();

        internal IReadOnlyList<string> Tags => tags;
        internal bool Contains(string tag) => tags.Contains(tag);

        internal bool Add(string tag)
        {
            GameplayTag.Validate(tag);
            if (Contains(tag)) return false;
            Undo.RecordObject(this, "Add Gameplay Tag");
            tags.Add(tag);
            tags.Sort(StringComparer.Ordinal);
            return true;
        }

        internal void Remove(IEnumerable<string> tagsToRemove)
        {
            Undo.RecordObject(this, "Remove Gameplay Tags");
            tags.RemoveAll(new HashSet<string>(tagsToRemove).Contains);
        }

        internal static GameplayTagCatalog Load() =>
            AssetDatabase.LoadAssetAtPath<GameplayTagCatalog>(AssetPath);
    }
}
