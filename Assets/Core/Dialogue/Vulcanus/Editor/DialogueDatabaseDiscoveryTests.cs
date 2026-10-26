using System;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Core.Dialogue.Vulcanus.Editor
{
    public sealed class DialogueDatabaseDiscoveryTests
    {
        private string _folder;
        private VulcanusProject _project;
        private VulcanusDialogueDatabase _database;

        [SetUp]
        public void SetUp()
        {
            _folder = "Assets/DialogueDatabaseDiscovery-" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", _folder.Substring("Assets/".Length));
            _project = ScriptableObject.CreateInstance<VulcanusProject>();
            AssetDatabase.CreateAsset(_project, _folder + "/project.asset");
            _database = ScriptableObject.CreateInstance<VulcanusDialogueDatabase>();
            _database.Configure(_project, Array.Empty<VulcanusDialogueAsset>());
            AssetDatabase.CreateAsset(_database, _folder + "/database.asset");
        }

        [TearDown]
        public void TearDown() => AssetDatabase.DeleteAsset(_folder);

        [Test]
        public void AddsImportedDialoguesAndRemovesDeletedReferences()
        {
            var dialogue = CreateDialogue("talk", "base:talk", _project);
            // A dialogue without this database's project must not be included.
            CreateDialogue("other", "base:other", null);
            DialogueDatabaseDiscovery.Refresh(_database);
            Assert.That(_database.Dialogues, Is.EqualTo(new[] { dialogue }));
            Assert.That(_database.TryGetDialogue("base:talk", out var found), Is.True);
            Assert.That(found, Is.SameAs(dialogue));
            AssetDatabase.DeleteAsset(AssetDatabase.GetAssetPath(dialogue));
            DialogueDatabaseDiscovery.Refresh(_database);
            Assert.That(_database.Dialogues, Is.Empty);
            Assert.That(_database.TryGetDialogue("base:talk", out _), Is.False);
        }

        [Test]
        public void RefreshesLookupAfterAnImportedDialogueChangesId()
        {
            var dialogue = CreateDialogue("talk", "talk", _project);
            DialogueDatabaseDiscovery.Refresh(_database);
            Configure(dialogue, "base:talk", _project);
            DialogueDatabaseDiscovery.Refresh(_database);
            Assert.That(_database.TryGetDialogue("talk", out _), Is.False);
            Assert.That(_database.TryGetDialogue("base:talk", out _), Is.True);
        }

        [Test]
        public void RejectsDuplicateIdsBeforeReplacingDatabaseContents()
        {
            var dialogue = CreateDialogue("first", "base:talk", _project);
            DialogueDatabaseDiscovery.Refresh(_database);
            CreateDialogue("second", "BASE:TALK", _project);
            Assert.That(() => DialogueDatabaseDiscovery.Refresh(_database),
                Throws.TypeOf<InvalidOperationException>().With.Message.Contains("duplicate dialogue ID"));
            Assert.That(_database.Dialogues, Is.EqualTo(new[] { dialogue }));
        }

        private VulcanusDialogueAsset CreateDialogue(string fileName, string id, VulcanusProject project)
        {
            var dialogue = ScriptableObject.CreateInstance<VulcanusDialogueAsset>();
            Configure(dialogue, id, project);
            AssetDatabase.CreateAsset(dialogue, _folder + "/" + fileName + ".asset");
            return dialogue;
        }

        private static void Configure(VulcanusDialogueAsset dialogue, string id, VulcanusProject project) =>
            dialogue.Configure(project, 1, id, id, "", false, "", "entry", Array.Empty<string>(), "", "",
                new VulcanusDialogueNode[] { new VulcanusDialogueEndNode("entry") },
                Array.Empty<VulcanusDialogueAsset.ImportedMessage>(), Array.Empty<string>());
    }
}
