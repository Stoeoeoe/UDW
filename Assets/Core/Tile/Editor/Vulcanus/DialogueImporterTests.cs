using Core.Shops;
using Core.Catalogs;
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
        private const string FabiaSource = "Assets/Tests/Vulcanus/dialogues/fabia_greeting.runtime.dialogue.json";
        private string _folder;

        [TearDown]
        public void TearDown()
        {
            if (_folder == null) return;
            AssetDatabase.DeleteAsset(_folder);
            _folder = null;
            CatalogDiscovery.Refresh(Resources.Load<DefinitionCatalog>(DefinitionCatalog.ResourceName));
        }

        [Test]
        public void ImportReadsTheNodeGraphAndItsTexts()
        {
            var dialogue = AssetDatabase.LoadAssetAtPath<VulcanusDialogueAsset>(FabiaSource);
            Assert.That(dialogue.Nodes.OfType<VulcanusDialogueChoiceNode>().Single().Options.Count, Is.EqualTo(6));
            Assert.That(dialogue.Nodes.OfType<VulcanusDialogueActionNode>().Single().Lua, Is.EqualTo("Shop.Open('test:market_seeds')"));
            Assert.That(dialogue.ResolveLocalizedText("dlg.test:fabia_greeting.01", "fallback"),
                Is.EqualTo("Salve! Fresh seeds and fair prices. What can I do for you?"));
        }

        [Test]
        public void AFailedImportBlocksPlay()
        {
            var path = CreateFolder() + "/fabia.runtime.dialogue.json";
            var source = JObject.Parse(File.ReadAllText(FabiaSource));
            source["id"] = "test:fabia-import";
            source["nodes"][0]["next"] = "missing";
            File.WriteAllText(path, source.ToString());
            LogAssert.Expect(LogType.Error, new Regex("Failed importing.*missing", RegexOptions.Singleline));
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);

            var error = Assert.Throws<InvalidOperationException>(DialogueImporter.ValidateSources);
            Assert.That(error.Message, Does.Contain(path));
        }

        [Test]
        public void CrossDialogueJumpsNeedAnEnabledTargetWithTheNode()
        {
            var folder = CreateFolder();
            var source = JObject.Parse(File.ReadAllText(FabiaSource));
            source["id"] = "test:jump-target";
            File.WriteAllText(folder + "/target.runtime.dialogue.json", source.ToString());
            source["id"] = "test:jump-source";
            source["nodes"][0] = new JObject
            {
                ["id"] = "line-1", ["type"] = "jump", ["targetDialogueId"] = "test:jump-target", ["targetNodeId"] = "line-1"
            };
            var path = folder + "/source.runtime.dialogue.json";
            File.WriteAllText(path, source.ToString());
            AssetDatabase.ImportAsset(folder + "/target.runtime.dialogue.json", ImportAssetOptions.ForceSynchronousImport);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            var catalog = Resources.Load<DefinitionCatalog>(DefinitionCatalog.ResourceName);
            CatalogDiscovery.Refresh(catalog);
            Assert.That(DialogueImporter.ValidateSources, Throws.Nothing);

            source["nodes"][0]["targetNodeId"] = "missing";
            File.WriteAllText(path, source.ToString());
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            CatalogDiscovery.Refresh(catalog);
            var error = Assert.Throws<InvalidOperationException>(DialogueImporter.ValidateSources);
            Assert.That(error.Message, Does.Contain("missing").And.Contain("test:jump-target"));

            catalog.SetEnabled(catalog.Get<VulcanusDialogueAsset>("test:jump-target"), false);
            error = Assert.Throws<InvalidOperationException>(DialogueImporter.ValidateSources);
            Assert.That(error.Message, Does.Contain("requires enabled dialogue 'test:jump-target'"));
        }

        private string CreateFolder()
        {
            _folder = "Assets/__DialogueImporterTests_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", _folder.Substring("Assets/".Length));
            return _folder;
        }
    }
}
