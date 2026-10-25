using System;
using System.IO;
using System.Linq;
using Character.Animations;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Scripting;

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
            var catalog = ScriptableObject.CreateInstance<CharacterAnimationCatalog>();
            try
            {
                Assert.That(() => LuaBindingManifestExporter.PopulateResources(manifest, catalog, Array.Empty<MemaoAnimationLibrary>()),
                    Throws.InvalidOperationException.With.Message.Contains("No resources exported for type 'custom'"));
            }
            finally { UnityEngine.Object.DestroyImmediate(catalog); }
        }

        [Test]
        public void ExportWritesResourceChoicesAndParameterLinksInTheSameFile()
        {
            var manifest = VulcanusLuaEngine.DescribeBindings();
            var catalog = Resources.Load<CharacterAnimationCatalog>(CharacterAnimationCatalog.ResourceName);
            var libraries = Core.Catalogs.Editor.CatalogAssetDiscovery.Find("Assets", typeof(MemaoAnimationLibrary)).Cast<MemaoAnimationLibrary>().ToArray();
            LuaBindingManifestExporter.PopulateResources(manifest, catalog, libraries);
            var path = Path.Combine(Path.GetTempPath(), "bindings-" + Guid.NewGuid().ToString("N") + ".json");
            try
            {
                Assert.That(LuaBindingManifestExporter.WriteIfChanged(path, manifest), Is.True);
                Assert.That(LuaBindingManifestExporter.WriteIfChanged(path, manifest), Is.False);
                var json = JObject.Parse(File.ReadAllText(path));
                var animation = json["resources"]["animation"].Single(resource => (string)resource["id"] == "base:pass-out");
                Assert.That((string)animation["description"], Is.EqualTo("PassOut"));
                var action = json["modules"].SelectMany(module => module["methods"])
                    .Single(method => (string)method["action"]?["id"] == "actors.playAnimation");
                Assert.That((string)action["parameters"].Single(parameter => (string)parameter["name"] == "animation")["resourceType"], Is.EqualTo("animation"));
            }
            finally { File.Delete(path); }
        }

        [LuaModule("ResourceTest")]
        private sealed class ResourceApi
        {
            [LuaAction("test.resource", "Resource", "Test", "Check declarative resource metadata.", "cutscene", Validator = nameof(Check))]
            public void Use([LuaResource("custom")] string value) { }
            [Preserve] public void Check(string value) { }
        }
    }
}
