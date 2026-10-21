using System;
using System.Collections;
using System.IO;
using Character;
using Core.Catalogs;
using Core.Catalogs.Editor;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor.Vulcanus
{
    public sealed class CharacterImporterTests
    {
        private const string SchemaFolder = "Assets/Vulcan/0204project/schemas/";
        private static CharacterDefinition Parse(string json, bool npc) =>
            CharacterImporter.Parse(json, SchemaFolder + (npc ? "npc" : "actor") + ".schema.json", "character-test.json");

        [TestCase(true)]
        [TestCase(false)]
        public void SourcesPreserveTheirAuthoredIdentityNameAndEmoji(bool npc)
        {
            var definition = Parse("{\"id\":\"base:gagaa\",\"name\":\"Gagaa\",\"icon\":\"🐗\"}", npc);
            try
            {
                Assert.That(definition.CharacterId, Is.EqualTo("base:gagaa"));
                Assert.That(definition.DisplayName, Is.EqualTo("Gagaa"));
                Assert.That(definition.Icon, Is.EqualTo("🐗"));
                Assert.That(definition.ValidateConfiguration(), Is.Empty);
            }
            finally { Object.DestroyImmediate(definition); }
        }

        [TestCase("{\"name\":\"Gagaa\",\"icon\":\"🐗\"}")]
        [TestCase("{\"id\":123,\"name\":\"Gagaa\",\"icon\":\"🐗\"}")]
        [TestCase("{\"id\":\"base:gagaa\",\"name\":\"\",\"icon\":\"🐗\"}")]
        [TestCase("{\"id\":\"base:gagaa\",\"name\":\"Gagaa\"}")]
        [TestCase("{\"id\":\"base:gagaa\",\"name\":\"Gagaa\",\"icon\":\"🐗\",\"unknown\":true}")]
        public void MalformedRequiredNpcDataIsRejected(string json) =>
            Assert.Throws<FormatException>(() => Parse(json, true));

        [TestCase("Gagaa")]
        [TestCase("gagaa")]
        [TestCase("gagaa\n")]
        public void IdsMustMatchTheVulcanusSchema(string id)
        {
            var json = new Newtonsoft.Json.Linq.JObject { ["id"] = id, ["name"] = "Gagaa", ["icon"] = "🐗" };
            Assert.Throws<FormatException>(() => Parse(json.ToString(), true));
        }

        [Test]
        public void ActorsPreserveNamespacedIdsAndIconIdentifiers()
        {
            var definition = Parse("{\"id\":\"base:gagaa\",\"name\":\"Gagaa\",\"icon\":\"GiAbstract041\"}", false);
            try
            {
                Assert.That(definition.CharacterId, Is.EqualTo("base:gagaa"));
                Assert.That(definition.Icon, Is.EqualTo("GiAbstract041"));
                Assert.That(definition.ValidateConfiguration(), Is.Empty);
            }
            finally { Object.DestroyImmediate(definition); }
        }

        [TestCase(true, "name")]
        [TestCase(true, "icon")]
        [TestCase(false, "name")]
        [TestCase(false, "icon")]
        public void SchemaRejectsWhitespaceAndReportsSourceAndProperty(bool npc, string property)
        {
            var json = new Newtonsoft.Json.Linq.JObject {
                ["id"] = "base:test", ["name"] = "Test", ["icon"] = "GiAbstract041", [property] = " \t\n"
            };
            var error = Assert.Throws<FormatException>(() => Parse(json.ToString(), npc));
            Assert.That(error.Message, Does.Contain("character-test.json").And.Contain(property));
        }

        [TestCase("{\"id\":\"base:test\",\"name\":\"Test\",\"icon\":\"Icon\",\"emotions\":[3]}")]
        [TestCase("{\"id\":\"base:test\",\"name\":\"Test\",\"icon\":\"Icon\",\"folderPath\":3}")]
        public void ActorSchemaRejectsInvalidOptionalFields(string json) =>
            Assert.Throws<FormatException>(() => Parse(json, false));

        [Test]
        public void EditingSchemaChangesValidationWithoutChangingImporter()
        {
            string path = Path.Combine("Temp", "character-schema-" + Guid.NewGuid().ToString("N") + ".json");
            const string json = "{\"id\":\"base:test\",\"name\":\"Test\",\"icon\":\"Icon\"}";
            var schema = Newtonsoft.Json.Linq.JObject.Parse(File.ReadAllText(SchemaFolder + "actor.schema.json"));
            try
            {
                File.WriteAllText(path, schema.ToString());
                Object.DestroyImmediate(CharacterImporter.Parse(json, path, "test.actor.json"));
                schema["properties"]["name"]["pattern"] = "^[A-Z]+$";
                File.WriteAllText(path, schema.ToString());
                var error = Assert.Throws<FormatException>(() => CharacterImporter.Parse(json, path, "test.actor.json"));
                Assert.That(error.Message, Does.Contain("name"));
            }
            finally { File.Delete(path); }
        }

        [Test]
        public void ExistingActorAndPlayerReferencesComeFromVulcanusSources()
        {
            var actor = AssetDatabase.LoadAssetAtPath<CharacterDefinition>("Assets/Vulcan/0204project/actors/gagaa.actor.json");
            var player = AssetDatabase.LoadAssetAtPath<CharacterDefinition>("Assets/Vulcan/0204project/actors/player.actor.json");
            Assert.That(CharacterCatalog.Require("base:gagaa"), Is.SameAs(actor));
            Assert.That(actor.Icon, Is.EqualTo("GiAbstract041"));
            Assert.That(CharacterCatalog.Require("base:player"), Is.SameAs(player));
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Character/Player/TestCharacter.prefab");
            Assert.That(prefab.GetComponent<GameCharacter>().Definition, Is.SameAs(player));
            Assert.That(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Content/Spawnables/Chest.prefab")
                .GetComponent<Core.Inventory.PersistentContainer>().Owner, Is.SameAs(player));
        }

        [UnityTest]
        public IEnumerator ImportAndSourceEditsRefreshTheRegistryAutomatically()
        {
            string folder = "Assets/__CharacterImportTests_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", folder.Substring("Assets/".Length));
            string path = folder + "/visitor.actor.json";
            var catalog = CatalogResources.Load<CharacterCatalog>(CharacterCatalog.ResourceName);
            try
            {
                File.WriteAllText(path, "{\"$schema\":\"../Vulcan/0204project/schemas/actor.schema.json\",\"id\":\"test:visitor\",\"name\":\"Visitor\",\"icon\":\"🧑\",\"emotions\":[]}");
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
                for (int i=0; i<20 && !catalog.Get("test:visitor"); i++) yield return null;
                Assert.That(catalog.Get("test:visitor").DisplayName, Is.EqualTo("Visitor"));
                File.WriteAllText(path, "{\"$schema\":\"../Vulcan/0204project/schemas/actor.schema.json\",\"id\":\"test:visitor\",\"name\":\"Updated Visitor\",\"icon\":\"🧑\"}");
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
                yield return null;
                yield return null;
                Assert.That(catalog.Get("test:visitor").DisplayName, Is.EqualTo("Updated Visitor"));
            }
            finally
            {
                AssetDatabase.DeleteAsset(folder);
                CatalogDiscovery.RefreshAll();
            }
        }
    }
}
