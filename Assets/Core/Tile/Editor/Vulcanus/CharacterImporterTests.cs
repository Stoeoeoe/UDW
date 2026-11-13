using System;
using System.Collections;
using System.IO;
using Character;
using Core.Catalogs.Editor;
using Core.Common.Editor;
using Core.Inventory;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor.Vulcanus
{
    public sealed class CharacterImporterTests : GameTest
    {

        private const string SchemaFolder = "Assets/Vulcan/0204project/schemas/";
        private static CharacterDefinition Parse(string json, bool npc) =>
            CharacterImporter.Parse(json, SchemaFolder + (npc ? "npc" : "character") + ".schema.json", "character-test.json");

        [TestCase(true)]
        [TestCase(false)]
        public void SourcesPreserveTheirAuthoredIdentityAndName(bool npc)
        {
            var definition = Parse("{\"id\":\"base:gagaa\",\"name\":\"Gagaa\"}", npc);
            try
            {
                Assert.That(definition.CharacterId, Is.EqualTo("base:gagaa"));
                Assert.That(definition.DisplayName, Is.EqualTo("Gagaa"));
                Assert.That(definition.ValidateConfiguration(), Is.Empty);
            }
            finally { Object.DestroyImmediate(definition); }
        }

        [Test]
        public void WalkSpeedComesFromTheSourceAndDefaultsToFourTilesPerSecond()
        {
            var authored = Parse("{\"id\":\"base:fabia\",\"name\":\"Fabia\",\"walkSpeed\":2.5}", false);
            var omitted = Parse("{\"id\":\"base:fabia\",\"name\":\"Fabia\"}", false);
            try
            {
                Assert.That(authored.WalkSpeed, Is.EqualTo(2.5f));
                Assert.That(omitted.WalkSpeed, Is.EqualTo(CharacterDefinition.DefaultWalkSpeed));
                Assert.Throws<FormatException>(() => Parse("{\"id\":\"base:fabia\",\"name\":\"Fabia\",\"walkSpeed\":0}", false));
            }
            finally
            {
                Object.DestroyImmediate(authored);
                Object.DestroyImmediate(omitted);
            }
        }

        [TestCase("{\"name\":\"Gagaa\"}")]
        [TestCase("{\"id\":123,\"name\":\"Gagaa\"}")]
        [TestCase("{\"id\":\"base:gagaa\",\"name\":\"\"}")]
        [TestCase("{\"id\":\"base:gagaa\",\"name\":\"Gagaa\",\"icon\":\"GiPerson\"}")]
        [TestCase("{\"id\":\"base:gagaa\",\"name\":\"Gagaa\",\"unknown\":true}")]
        public void MalformedRequiredNpcDataIsRejected(string json) =>
            Assert.Throws<FormatException>(() => Parse(json, true));

        [TestCase("Gagaa")]
        [TestCase("gagaa")]
        [TestCase("gagaa\n")]
        public void IdsMustMatchTheVulcanusSchema(string id)
        {
            var json = new JObject { ["id"] = id, ["name"] = "Gagaa" };
            Assert.Throws<FormatException>(() => Parse(json.ToString(), true));
        }

        [Test]
        public void CharactersPreserveNamespacedIds()
        {
            var definition = Parse("{\"id\":\"base:gagaa\",\"name\":\"Gagaa\"}", false);
            try
            {
                Assert.That(definition.CharacterId, Is.EqualTo("base:gagaa"));
                Assert.That(definition.ValidateConfiguration(), Is.Empty);
            }
            finally { Object.DestroyImmediate(definition); }
        }

        [TestCase(true, "name")]
        [TestCase(false, "name")]
        public void SchemaRejectsWhitespaceAndReportsSourceAndProperty(bool npc, string property)
        {
            var json = new JObject {
                ["id"] = "base:test", ["name"] = "Test", [property] = " \t\n"
            };
            var error = Assert.Throws<FormatException>(() => Parse(json.ToString(), npc));
            Assert.That(error.Message, Does.Contain("character-test.json").And.Contain(property));
        }

        [TestCase("{\"id\":\"base:test\",\"name\":\"Test\",\"portraits\":{\"base:happy\":3}}")]
        [TestCase("{\"id\":\"base:test\",\"name\":\"Test\",\"folderPath\":3}")]
        public void CharacterSchemaRejectsInvalidOptionalFields(string json) =>
            Assert.Throws<FormatException>(() => Parse(json, false));

        [Test]
        public void ImportsTheDefaultAndPerEmotionTypewriterSounds()
        {
            var definition = Parse("{\"id\":\"base:fabia\",\"name\":\"Fabia\",\"typewriterSound\":\"base:calm\"," +
                "\"emotionTypewriterSounds\":{\"base:angry\":\"base:harsh\"}}", false);
            try
            {
                Assert.That(definition.TypewriterSoundIdFor("base:angry"), Is.EqualTo("base:harsh"));
                Assert.That(definition.TypewriterSoundIdFor("base:happy"), Is.EqualTo("base:calm"));
                Assert.That(definition.TypewriterSoundIdFor(null), Is.EqualTo("base:calm"));
            }
            finally { Object.DestroyImmediate(definition); }
        }

        [Test]
        public void CharacterWithoutTypewriterSoundsReportsNone()
        {
            var definition = Parse("{\"id\":\"base:fabia\",\"name\":\"Fabia\"}", false);
            try { Assert.That(definition.TypewriterSoundIdFor("base:angry"), Is.Null); }
            finally { Object.DestroyImmediate(definition); }
        }

        [TestCase("{\"id\":\"base:test\",\"name\":\"Test\",\"typewriterSound\":\"Calm\"}")]
        [TestCase("{\"id\":\"base:test\",\"name\":\"Test\",\"emotionTypewriterSounds\":{\"angry\":\"base:harsh\"}}")]
        public void MalformedTypewriterSoundIdsAreRejected(string json) =>
            Assert.That(() => Parse(json, false), Throws.InstanceOf<Exception>());

        [Test]
        public void EditingSchemaChangesValidationWithoutChangingImporter()
        {
            string path = Path.Combine("Temp", "character-schema-" + Guid.NewGuid().ToString("N") + ".json");
            const string json = "{\"id\":\"base:test\",\"name\":\"Test\"}";
            var schema = JObject.Parse(File.ReadAllText(SchemaFolder + "character.schema.json"));
            try
            {
                File.WriteAllText(path, schema.ToString());
                Object.DestroyImmediate(CharacterImporter.Parse(json, path, "test.character.json"));
                schema["properties"]["name"]["pattern"] = "^[A-Z]+$";
                File.WriteAllText(path, schema.ToString());
                var error = Assert.Throws<FormatException>(() => CharacterImporter.Parse(json, path, "test.character.json"));
                Assert.That(error.Message, Does.Contain("name"));
            }
            finally { File.Delete(path); }
        }

        [Test]
        public void ExistingCharacterAndPlayerReferencesComeFromVulcanusSources()
        {
            var character = AssetDatabase.LoadAssetAtPath<CharacterDefinition>("Assets/Vulcan/0204project/characters/my_test_char.character.json");
            var player = AssetDatabase.LoadAssetAtPath<CharacterDefinition>("Assets/Vulcan/0204project/characters/player.character.json");
            Assert.That(Game.Get<CharacterCatalog>().Require(character.CharacterId), Is.SameAs(character));
            Assert.That(Game.Get<CharacterCatalog>().Require("base:player"), Is.SameAs(player));
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Character/Player/TestCharacter.prefab");
            Assert.That(prefab.GetComponent<GameCharacter>().Definition, Is.SameAs(player));
            Assert.That(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Content/Spawnables/Chest.prefab")
                .GetComponent<PersistentContainer>().Owner, Is.SameAs(player));
        }

        [Test]
        public void FabiaSpeaksWithHerOwnTypewriterSoundPerEmotion()
        {
            var resolver = Game.Get<Interaction.Dialog.TypewriterSoundResolver>();
            string Resolved(string emotion) => resolver.ResolveTypewriterSound("base:fabia", emotion, null).Id;
            Assert.That(Resolved("base:angry"), Is.EqualTo("base:fabia_angry"));
            Assert.That(Resolved("base:happy"), Is.EqualTo("base:fabia_happy"));
            Assert.That(Resolved("base:neutral"), Is.EqualTo("base:fabia_neutral"));
            Assert.That(Resolved(null), Is.EqualTo("base:fabia_neutral"));
            Assert.That(resolver.ResolveTypewriterSound("base:player", "base:angry", null).Id, Is.EqualTo("base:standard"));
        }

        [Test]
        public void CharactersShowTheirPortraitPerEmotionAndFallBackToTheDefault()
        {
            var fabia = Game.Get<CharacterCatalog>().Require("base:fabia");
            Assert.That(fabia.PortraitFor("base:angry").name, Is.EqualTo("Fabia_Angry"));
            Assert.That(fabia.PortraitFor("base:very_happy").name, Is.EqualTo("Fabia_Very_Happy"));
            Assert.That(fabia.PortraitFor("base:not-an-emotion").name, Is.EqualTo("Fabia_Neutral"));
            Assert.That(fabia.PortraitFor(null).name, Is.EqualTo("Fabia_Neutral"));
            Assert.That(Game.Get<CharacterCatalog>().Require("base:player").PortraitFor("base:angry").name, Is.EqualTo("Hero_Angry"));
            Assert.That(Game.Get<CharacterCatalog>().Require("base:my_test_char").PortraitFor("base:angry"), Is.Null);
        }

        [Test]
        public void PortraitsAreLoadedThroughTheImporterCallback()
        {
            var texture = new Texture2D(1, 1);
            var requested = new System.Collections.Generic.List<string>();
            var definition = CharacterImporter.Parse(
                "{\"id\":\"base:test\",\"name\":\"Test\",\"defaultPortrait\":\"assets/a.png\",\"portraits\":{\"base:sad\":\"assets/b.png\"}}",
                SchemaFolder + "character.schema.json", "character-test.json", path => { requested.Add(path); return texture; });
            try
            {
                Assert.That(requested, Is.EquivalentTo(new[] { "assets/a.png", "assets/b.png" }));
                Assert.That(definition.PortraitFor("base:sad"), Is.SameAs(texture));
                Assert.That(definition.ValidateConfiguration(), Is.Empty);
            }
            finally { Object.DestroyImmediate(definition); Object.DestroyImmediate(texture); }
        }

        [Test]
        public void UnmappedCharacterImportsIntoTheCatalogWithoutAPrefab()
        {
            var folder = "Assets/__UnmappedCharacter_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", Path.GetFileName(folder));
            var path = folder + "/visitor.character.json";
            var catalog = Resources.Load<CharacterCatalog>(CharacterCatalog.ResourceName);
            try
            {
                File.WriteAllText(path, "{\"$schema\":\"../Vulcan/0204project/schemas/character.schema.json\",\"id\":\"test:unmapped-visitor\",\"name\":\"Unmapped Visitor\"}");
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
                var definition = AssetDatabase.LoadAssetAtPath<CharacterDefinition>(path);
                Assert.That(definition, Is.Not.Null);
                CatalogDiscovery.Refresh(catalog);
                Assert.That(catalog.Get("test:unmapped-visitor"), Is.SameAs(definition));
                Assert.That(definition.DisplayName, Is.EqualTo("Unmapped Visitor"));
            }
            finally
            {
                AssetDatabase.DeleteAsset(folder);
                CatalogDiscovery.Refresh(catalog);
            }
        }

        [UnityTest]
        public IEnumerator ImportAndSourceEditsRefreshTheRegistryAutomatically()
        {
            string folder = "Assets/__CharacterImportTests_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", folder.Substring("Assets/".Length));
            string path = folder + "/visitor.character.json";
            var catalog = Resources.Load<CharacterCatalog>(CharacterCatalog.ResourceName);
            try
            {
                File.WriteAllText(path, "{\"$schema\":\"../Vulcan/0204project/schemas/character.schema.json\",\"id\":\"test:visitor\",\"name\":\"Visitor\"}");
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
                for (int i=0; i<20 && !catalog.Get("test:visitor"); i++) yield return null;
                Assert.That(catalog.Get("test:visitor").DisplayName, Is.EqualTo("Visitor"));
                File.WriteAllText(path, "{\"$schema\":\"../Vulcan/0204project/schemas/character.schema.json\",\"id\":\"test:visitor\",\"name\":\"Updated Visitor\"}");
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
