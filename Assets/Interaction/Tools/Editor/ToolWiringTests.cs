using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Interaction.Tools.Editor
{
    /// <summary>Authored tools must be usable: a tool asset without an action on the player character fails when first used.</summary>
    public sealed class ToolWiringTests
    {
        [Test]
        public void EveryToolAssetHasAnActionOnThePlayerCharacter()
        {
            var character = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Character/Player/TestCharacter.prefab");
            var registered = RegisteredToolIds(character);
            var tools = AssetDatabase.FindAssets("t:ToolData", new[] { "Assets" })
                .Select(AssetDatabase.GUIDToAssetPath)
                .Select(AssetDatabase.LoadAssetAtPath<ToolData>)
                .Where(tool => tool)
                .ToArray();
            Assert.That(tools, Is.Not.Empty);
            var missing = tools.Where(tool => !registered.Contains(tool.Id)).Select(tool => tool.Id).ToArray();
            Assert.That(missing, Is.Empty, "Add an action prefab for each tool to the player character's ToolActionRegistry.");
        }

        private static string[] RegisteredToolIds(GameObject character)
        {
            var registry = character.GetComponentInChildren<ToolActionRegistry>(true);
            var prefabs = new SerializedObject(registry).FindProperty("toolActionPrefabs");
            return Enumerable.Range(0, prefabs.arraySize)
                .Select(i => ((ToolAction)prefabs.GetArrayElementAtIndex(i).objectReferenceValue).ToolData.Id)
                .ToArray();
        }
    }
}
