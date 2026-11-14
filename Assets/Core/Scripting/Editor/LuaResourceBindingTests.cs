using System;
using System.IO;
using System.Linq;
using Character.Animations;
using Core.Catalogs;
using Core.Catalogs.Editor;
using Core.Divinity;
using Core.TimeAndWeather;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Scripting;
using Object = UnityEngine.Object;

namespace Core.Scripting.Editor
{
    public sealed class LuaResourceBindingTests
    {
        [Test]
        public void ResourceTypesAreDeclarativeAndNeedNoSpecialPicker()
        {
            var parameter = LuaBindingRegistry.DescribeTypes(typeof(ResourceApi)).modules.Single().methods.Single().parameters.Single();
            Assert.That(parameter.type, Is.EqualTo("string"));
            Assert.That(parameter.resourceType, Is.EqualTo("custom"));
            Assert.That(parameter.semanticType, Is.Null);
            Assert.That(parameter.picker, Is.Null);
        }

        [Test]
        public void UnknownResourceTypeFailsExportInsteadOfPublishingAnUnusableSelector()
        {
            var manifest = LuaBindingRegistry.DescribeTypes(typeof(ResourceApi));
            Assert.That(() => LuaBindingManifestExporter.PopulateResources(manifest, Array.Empty<DefinitionCatalog>()),
                Throws.InvalidOperationException.With.Message.Contains("No resources exported for type 'custom'"));
        }

        [Test]
        public void DuplicateResourceCatalogsFailExport()
        {
            var manifest = LuaBindingRegistry.DescribeTypes(typeof(ResourceApi));
            var catalog = ScriptableObject.CreateInstance<SoundCatalog>();
            try
            {
                Assert.That(() => LuaBindingManifestExporter.PopulateResources(manifest, new[] { catalog, catalog }),
                    Throws.InvalidOperationException.With.Message.Contains("Duplicate Lua resource catalog for type 'sound'"));
            }
            finally { Object.DestroyImmediate(catalog); }
        }

        [Test]
        public void ExportDescribesTheGameClockFromSystemRoot()
        {
            var clock = UnityEditor.AssetDatabase.LoadAssetAtPath<SystemRoot>(SystemRoot.PrefabPath).Clock;
            var described = LuaBindingManifestExporter.DescribeClock(clock);
            Assert.That(described.secondsPerInGameMinute, Is.EqualTo(clock.SecondsPerMinute),
                "One minute, not one step of the clock.");
            Assert.That(described.startOfDay, Is.EqualTo(clock.startOfDay));
            Assert.That(described.endOfDay, Is.EqualTo(clock.endOfDay));
        }

        [Test]
        public void ExportWritesResourceChoicesAndParameterLinksInTheSameFile()
        {
            var manifest = VulcanusLuaEngine.DescribeBindings();
            DefaultCatalogAssets.CreateMissingCatalogs();
            LuaBindingManifestExporter.PopulateResources(manifest);
            var path = Path.Combine(Path.GetTempPath(), "bindings-" + Guid.NewGuid().ToString("N") + ".json");
            try
            {
                Assert.That(LuaBindingManifestExporter.WriteIfChanged(path, manifest), Is.True);
                Assert.That(LuaBindingManifestExporter.WriteIfChanged(path, manifest), Is.False);
                var json = JObject.Parse(File.ReadAllText(path));
                Assert.That(json["resources"]["emote"].Select(resource => (string)resource["id"]),
                    Is.EquivalentTo(Resources.Load<EmoteCatalog>(EmoteCatalog.ResourceName).EnabledDefinitions.Select(emote => emote.Id)));
                Assert.That(json["resources"]["deity"].Select(resource => (string)resource["id"]),
                    Is.EquivalentTo(Resources.Load<DeityCatalog>(DeityCatalog.ResourceName).EnabledDefinitions.Select(deity => deity.Id)));
                Assert.That(json["resources"]["deity"].Select(resource => (string)resource["description"]),
                    Is.EqualTo(Resources.Load<DeityCatalog>(DeityCatalog.ResourceName).EnabledDefinitions.OrderBy(deity => deity.Id, StringComparer.Ordinal).Select(deity => deity.DisplayName)));
                var favour = json["modules"].SelectMany(module => module["methods"])
                    .Single(method => (string)method["action"]?["id"] == "divinity.addFavour");
                Assert.That((string)favour["parameters"].Single(parameter => (string)parameter["name"] == "deityId")["resourceType"], Is.EqualTo("deity"));
                Assert.That(json["resources"]["weather"].Select(resource => (string)resource["id"]),
                    Is.EquivalentTo(Resources.Load<WeatherCatalog>(WeatherCatalog.ResourceName).EnabledDefinitions.Select(weather => weather.id)));
                Assert.That(json["resources"]["weather"].Select(resource => (string)resource["id"]), Does.Contain("Sunny"));
                Assert.That(json["resources"]["weather"].Select(resource => (string)resource["description"]),
                    Is.EqualTo(Resources.Load<WeatherCatalog>(WeatherCatalog.ResourceName).EnabledDefinitions.OrderBy(weather => weather.id, StringComparer.Ordinal).Select(weather => weather.label)));
                var weatherAction = json["modules"].SelectMany(module => module["methods"])
                    .Single(method => (string)method["action"]?["id"] == "weather.setWeather");
                Assert.That((string)weatherAction["parameters"].Single()["resourceType"], Is.EqualTo("weather"));
                Assert.That(weatherAction["action"]["phases"].Select(value => (string)value),
                    Is.EquivalentTo(new[] { "setup", "sequence", "completion" }));
                var animation = json["resources"]["animation"].Single(resource => (string)resource["id"] == "base:pass-out");
                Assert.That((string)animation["description"], Is.EqualTo("PassOut"));
                var action = json["modules"].SelectMany(module => module["methods"])
                    .Single(method => (string)method["action"]?["id"] == "characters.playAnimation");
                Assert.That((string)action["parameters"].Single(parameter => (string)parameter["name"] == "animation")["resourceType"], Is.EqualTo("animation"));
                Assert.That(json["resources"]["character"], Is.Null, "Vulcanus owns the character list, regardless of Unity prefab mappings.");
                Assert.That(json["resources"]["actor"], Is.Null);
                var spawn = json["modules"].SelectMany(module => module["methods"])
                    .Single(method => (string)method["action"]?["id"] == "characters.spawn");
                Assert.That((string)spawn["parameters"].Single(parameter => (string)parameter["name"] == "definition")["resourceType"], Is.EqualTo("character"));
            }
            finally { File.Delete(path); }
        }

        [LuaModule("ResourceTest")]
        private sealed class ResourceApi
        {
            [LuaAction("test.resource", "Resource", "Test", "Check declarative resource metadata.", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            public void Use([LuaResource("custom")] string value) { }
            [Preserve] public void Check(string value) { }
        }
    }
}
