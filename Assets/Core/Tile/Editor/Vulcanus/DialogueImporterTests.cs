using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Core.Catalogs.Editor;
using Core.Dialogue.Vulcanus;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;

namespace Core.Tile.Editor.Vulcanus
{
    public sealed class DialogueImporterTests
    {
        private const string FabiaSource = "Assets/Vulcan/0204project/dialogues/fabia_greeting.runtime.dialogue.json";
        private string _folder;

        [TearDown]
        public void TearDown()
        {
            if (_folder == null) return;
            AssetDatabase.DeleteAsset(_folder);
            _folder = null;
            CatalogDiscovery.Refresh(Resources.Load<DialogueCatalog>(DialogueCatalog.ResourceName));
        }

        [Test]
        public void FabiasTopicLoopsAndShopActionAreValidAtImport()
        {
            var source = VulcanusSchema.Read<DialogueDto>(FabiaSource);
            var nodes = DialogueImporter.CreateNodes(source, FabiaSource);
            Assert.That(nodes.OfType<VulcanusDialogueChoiceNode>().Single().Options.Length, Is.EqualTo(6));
            Assert.That(nodes.OfType<VulcanusDialogueActionNode>().Single().Lua, Is.EqualTo("Shop.Open('base:market_seeds')"));
        }

        [TestCase("start")]
        [TestCase("next")]
        [TestCase("option")]
        [TestCase("empty-choice")]
        [TestCase("duplicate")]
        [TestCase("jump")]
        public void BrokenGraphReferencesAreRejectedBeforeAnAssetIsPublished(string defect)
        {
            var source = VulcanusSchema.Read<DialogueDto>(FabiaSource);
            switch (defect)
            {
                case "start": source.StartNodeId = "missing"; break;
                case "next": source.Nodes[0].Next = "missing"; break;
                case "option": source.Nodes.Single(node => node.Type == "choice").Options[0].TargetNodeId = "missing"; break;
                case "empty-choice": source.Nodes.Single(node => node.Type == "choice").Options.Clear(); break;
                case "duplicate": source.Nodes.Add(source.Nodes[0]); break;
                case "jump": source.Nodes[0].Type = "jump"; source.Nodes[0].TargetNodeId = ""; break;
            }
            Assert.That(() => DialogueImporter.CreateNodes(source, FabiaSource),
                Throws.TypeOf<FormatException>().With.Message.Contains(FabiaSource));
        }

        [Test]
        public void BrokenCurrentSourceBlocksPlayEvenAfterASuccessfulImport()
        {
            _folder = "Assets/__DialogueImporterTests_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", _folder.Substring("Assets/".Length));
            var path = _folder + "/fabia.runtime.dialogue.json";
            var source = JObject.Parse(File.ReadAllText(FabiaSource));
            source["id"] = "test:fabia-import";
            source["$schema"] = "../Vulcan/0204project/schemas/dialogue.schema.json";
            File.WriteAllText(path, source.ToString());
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            Assert.That(AssetDatabase.LoadAssetAtPath<VulcanusDialogueAsset>(path), Is.Not.Null);

            source["nodes"][0]["next"] = "missing";
            File.WriteAllText(path, source.ToString());
            LogAssert.Expect(LogType.Error, new Regex("Failed importing.*invalid dialogue.*", RegexOptions.Singleline));
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            var error = Assert.Throws<FormatException>(() => DialogueImporter.ValidateSources());
            Assert.That(error.Message, Does.Contain(path).And.Contain("missing"));
        }

        [Test]
        public void CrossDialogueJumpsValidateCurrentSourcesAndEnabledTargetsBeforePlay()
        {
            _folder = "Assets/__DialogueImporterTests_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", _folder.Substring("Assets/".Length));
            var source = JObject.Parse(File.ReadAllText(FabiaSource));
            source["$schema"] = "../Vulcan/0204project/schemas/dialogue.schema.json";
            source["id"] = "test:jump-target";
            var targetPath = _folder + "/target.runtime.dialogue.json";
            File.WriteAllText(targetPath, source.ToString());
            AssetDatabase.ImportAsset(targetPath, ImportAssetOptions.ForceSynchronousImport);

            source["id"] = "test:jump-source";
            source["nodes"][0] = new JObject {
                ["id"] = "line-1", ["type"] = "jump",
                ["targetDialogueId"] = "test:jump-target", ["targetNodeId"] = "line-1"
            };
            var path = _folder + "/source.runtime.dialogue.json";
            File.WriteAllText(path, source.ToString());
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            var catalog = Resources.Load<DialogueCatalog>(DialogueCatalog.ResourceName);
            CatalogDiscovery.Refresh(catalog);
            Assert.That(() => DialogueImporter.ValidateSources(), Throws.Nothing);

            // Do not reimport: the previous artifact must not hide a broken current jump target.
            source["nodes"][0]["targetNodeId"] = "missing";
            File.WriteAllText(path, source.ToString());
            var error = Assert.Throws<InvalidOperationException>(() => DialogueImporter.ValidateSources());
            Assert.That(error.Message, Does.Contain("missing").And.Contain("test:jump-target"));

            source["nodes"][0]["targetNodeId"] = "line-1";
            File.WriteAllText(path, source.ToString());
            catalog.SetEnabled(catalog.Get("test:jump-target"), false);
            error = Assert.Throws<InvalidOperationException>(() => DialogueImporter.ValidateSources());
            Assert.That(error.Message, Does.Contain("requires enabled dialogue 'test:jump-target'"));
        }
    }
}
