using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Core.Catalogs;
using Core.Catalogs.Editor;
using Core.Scripting;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor.Vulcanus
{
    public sealed class CutsceneImporterTests
    {
        private const string SchemaPath = "Assets/Vulcan/0204project/schemas/cutscene.schema.json";
        private string _folder;

        [SetUp]
        public void SetUp()
        {
            _folder = "Assets/__CutsceneImportTests_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", _folder.Substring("Assets/".Length));
        }

        [TearDown]
        public void TearDown()
        {
            // This exact test-owned folder is created above; authored content is never removed.
            AssetDatabase.DeleteAsset(_folder);
            CatalogDiscovery.RefreshAll();
        }

        [Test]
        public void SourcePreservesIdentityMapAndCompiledStepMapping()
        {
            var definition = Parse(Source("test:intro"));
            try
            {
                Assert.That(definition.CutsceneId, Is.EqualTo("test:intro"));
                Assert.That(definition.MapId, Is.EqualTo("map-1"));
                Assert.That(definition.Lua, Is.EqualTo("Dialogue.Play(\"base:greeting\");\n"));
                Assert.That(definition.Steps.Count, Is.EqualTo(1));
                Assert.That(definition.Steps[0].Id, Is.EqualTo("speak"));
                Assert.That(definition.Steps[0].ActionId, Is.EqualTo("dialogue.play"));
                Assert.That(definition.Steps[0].Arguments[0].Name, Is.EqualTo("dialogue"));
                Assert.That(definition.Steps[0].Arguments[0].Value, Is.EqualTo("base:greeting"));
                Assert.That(definition.ValidateConfiguration(), Is.Empty);
                Assert.That(definition.OnComplete.Actions, Is.Empty);
            }
            finally { Object.DestroyImmediate(definition); }
        }

        [Test]
        public void ImportsNumericWaitAndRejectsInvalidDurationAtImport()
        {
            var source = Source("test:wait");
            source["sequence"] = new JArray(new JObject
            {
                ["id"] = "pause", ["action"] = "cutscene.wait",
                ["arguments"] = new JObject { ["seconds"] = 0.5 }
            });
            var definition = Parse(source);
            try { Assert.That(definition.Lua, Is.EqualTo("Cutscene.Wait(0.5);\n")); }
            finally { Object.DestroyImmediate(definition); }
            source["sequence"][0]["arguments"]["seconds"] = -1;
            Assert.That(() => Parse(source), Throws.TypeOf<FormatException>()
                .With.Message.Contains("(pause)").And.Message.Contains("nonnegative"));
        }

        [TestCase("formatVersion", "99")]
        [TestCase("id", "'not-namespaced'")]
        [TestCase("mapId", "' '")]
        [TestCase("sequence", "[]")]
        [TestCase("unknown", "true")]
        [TestCase("onComplete", "null")]
        [TestCase("allowSkip", "'yes'")]
        public void SchemaRejectsUnsupportedOrMalformedRequiredData(string field, string value)
        {
            var source = Source("test:intro");
            source[field] = JToken.Parse(value);
            Assert.That(() => Parse(source), Throws.TypeOf<FormatException>().With.Message.Contains("fixture.runtime.cutscene.json"));
        }

        [Test]
        public void ImportsSetupAndCompletionStepsWithTheirCompiledScripts()
        {
            var source = Source("test:phases");
            source["onStart"] = new JArray(Turn("stage", "East"));
            source["onComplete"]["steps"] = new JArray(Turn("finish", "West"));
            var definition = Parse(source);
            try
            {
                Assert.That(definition.OnStartLua, Is.EqualTo("Actors.FaceDirection(\"player\", \"East\");\n"));
                Assert.That(definition.OnStart.Single().Id, Is.EqualTo("stage"));
                Assert.That(definition.OnComplete.Lua, Is.EqualTo("Actors.FaceDirection(\"player\", \"West\");\n"));
                Assert.That(definition.OnComplete.Steps.Single().Id, Is.EqualTo("finish"));
                Assert.That(definition.Lua, Is.EqualTo("Dialogue.Play(\"base:greeting\");\n"));
            }
            finally { Object.DestroyImmediate(definition); }
        }

        [TestCase("setup", "cutscene.wait", "{'seconds':0}")]
        [TestCase("completion", "cutscene.wait", "{'seconds':0}")]
        [TestCase("setup", "actors.moveTo", "{'actor':'player','destination':'meeting'}")]
        [TestCase("completion", "dialogue.play", "{'dialogue':'base:greeting'}")]
        [TestCase("setup", "actors.playAnimation", "{'actor':'player','animation':'base:pass-out'}")]
        public void RejectsAwaitableActionsInImmediateSections(string phase, string action, string arguments)
        {
            var source = Source("test:phases");
            var steps = new JArray(new JObject { ["id"] = "bad-step", ["action"] = action, ["arguments"] = JObject.Parse(arguments) });
            if (phase == "setup") source["onStart"] = steps;
            else source["onComplete"]["steps"] = steps;
            Assert.That(() => Parse(source), Throws.TypeOf<FormatException>().With.Message.Contains("bad-step")
                .And.Message.Contains($"not allowed in phase '{phase}'"));
        }

        [TestCase("setup")]
        [TestCase("completion")]
        public void StepIdsMustBeUniqueAcrossAllPhases(string phase)
        {
            var source = Source("test:phases");
            if (phase == "setup") source["onStart"] = new JArray(Turn("speak", "East"));
            else source["onComplete"]["steps"] = new JArray(Turn("speak", "East"));
            Assert.That(() => Parse(source), Throws.TypeOf<FormatException>().With.Message.Contains("Duplicate step ID"));
        }

        [Test]
        public void EmptyOrOmittedImmediateSectionsAreExplicitNoOpsAndRawSetupLuaIsRejected()
        {
            var source = Source("test:empty-phases");
            foreach (var explicitEmpty in new[] { false, true })
            {
                if (explicitEmpty)
                {
                    source["onStart"] = new JArray();
                    source["onComplete"]["steps"] = new JArray();
                }
                var definition = Parse(source);
                try
                {
                    Assert.That(definition.OnStart, Is.Empty);
                    Assert.That(definition.OnStartLua, Is.Empty);
                    Assert.That(definition.OnComplete.Steps, Is.Empty);
                    Assert.That(definition.OnComplete.Lua, Is.Empty);
                }
                finally { Object.DestroyImmediate(definition); }
            }
            source["onStart"] = "Actors.FaceDirection('player', 'East')";
            Assert.That(() => Parse(source), Throws.TypeOf<FormatException>());
        }

        private static JObject Turn(string id, string direction) => new()
        {
            ["id"] = id, ["action"] = "actors.faceDirection",
            ["arguments"] = new JObject { ["actor"] = "player", ["direction"] = direction }
        };

        [Test]
        public void PositionObjectsImportInSetupSequenceAndCompletion()
        {
            var source = Source("test:place-phases");
            JObject Place(string id, int x) => new()
            {
                ["id"] = id, ["action"] = "actors.place",
                ["arguments"] = new JObject { ["actor"] = "player", ["position"] = new JObject { ["x"] = x, ["y"] = 104 } }
            };
            source["onStart"] = new JArray(Place("stage", 168));
            source["sequence"] = new JArray(Place("place", 171));
            source["onComplete"]["steps"] = new JArray(Place("finish", 174));
            var definition = Parse(source);
            try
            {
                Assert.That(definition.OnStart.Single().Arguments.Single(argument => argument.Name == "position").Position.X, Is.EqualTo(168));
                Assert.That(definition.Lua, Does.Contain("{ x = 171, y = 104 }"));
                Assert.That(definition.OnComplete.Steps.Single().Arguments.Single(argument => argument.Name == "position").Position.X, Is.EqualTo(174));
            }
            finally { Object.DestroyImmediate(definition); }
        }

        [Test]
        public void ImportValidatesActionArgumentsWithSourceAndStepIdentity()
        {
            var source = Source("test:intro");
            ((JObject)source["sequence"][0]["arguments"]).Remove("dialogue");
            Assert.That(() => Parse(source), Throws.TypeOf<FormatException>().With.Message.Contains("(speak)"));
        }

        [Test]
        public void OnCompletePreservesActionsPlacementsAndSkipPermission()
        {
            var source = Source("test:outcomes");
            source["allowSkip"] = true;
            source["onComplete"] = JObject.Parse("{ 'actions':\"GameState.Story.SetFlag('introduced')\", 'actorPlacements':[{'actor':'host-01','anchor':'meeting'}] }");
            var definition = Parse(source);
            try
            {
                Assert.That(definition.AllowSkip, Is.True);
                Assert.That(definition.OnComplete.Actions, Is.EqualTo("GameState.Story.SetFlag('introduced')"));
                Assert.That(definition.OnComplete.ActorPlacements[0].Actor, Is.EqualTo("host-01"));
                Assert.That(definition.OnComplete.ActorPlacements[0].Anchor, Is.EqualTo("meeting"));
            }
            finally { Object.DestroyImmediate(definition); }
        }

        [Test]
        public void DuplicateTerminalActorsFailBeforePlayback()
        {
            var source = Source("test:outcomes");
            source["onComplete"]["actorPlacements"] = JArray.Parse("[{'actor':'host','anchor':'a'},{'actor':'host','anchor':'b'}]");
            Assert.That(() => Parse(source), Throws.Exception.With.Message.Contains("unique actors"));
        }

        [Test]
        public void InvalidCompletionActionsFailImport()
        {
            var source = Source("test:actions");
            source["onComplete"]["actions"] = "if then";
            Assert.That(() => Parse(source), Throws.Exception.With.Message.Contains("onComplete"));
        }

        [UnityTest]
        public IEnumerator ImportEditsAndASecondSourceAreDiscoveredWithoutRegistration()
        {
            var path = _folder + "/intro.runtime.cutscene.json";
            var secondPath = _folder + "/second.runtime.cutscene.json";
            var catalog = CatalogResources.Load<CutsceneCatalog>(CutsceneCatalog.ResourceName);
            Assert.That(catalog, Is.Not.Null);
            var source = Source("test:intro");
            Write(path, source);
            yield return WaitFor(() => catalog.Get("test:intro"));
            var definition = catalog.Get("test:intro");
            var guid = AssetDatabase.AssetPathToGUID(path);
            catalog.SetEnabled(definition, false);

            source["sequence"][0]["arguments"]["dialogue"] = "base:updated";
            Write(path, source);
            Write(secondPath, Source("test:second"));
            yield return WaitFor(() => catalog.Get("test:second"));
            Assert.That(AssetDatabase.AssetPathToGUID(path), Is.EqualTo(guid));
            Assert.That(AssetDatabase.LoadAssetAtPath<CutsceneDefinition>(path).Lua, Does.Contain("base:updated"));
            Assert.That(AssetDatabase.LoadAssetAtPath<CutsceneDefinition>(path).Steps[0].Arguments[0].Value, Is.EqualTo("base:updated"));
            Assert.That(catalog.Get("test:intro"), Is.Null, "Discovery must retain the disabled selection.");
            AssetDatabase.DeleteAsset(secondPath);
            yield return WaitFor(() => !catalog.Get("test:second"));
        }

        [Test]
        public void BrokenCurrentSourceBlocksPlaybackEvenAfterAnEarlierSuccessfulImport()
        {
            var path = _folder + "/intro.runtime.cutscene.json";
            var source = Source("test:intro");
            Write(path, source);
            Assert.That(AssetDatabase.LoadAssetAtPath<CutsceneDefinition>(path), Is.Not.Null);
            source["formatVersion"] = 99;
            var errors = new List<string>();
            Application.LogCallback capture = (message, stack, type) => { if (type == LogType.Error) errors.Add(message); };
            var previous = LogAssert.ignoreFailingMessages;
            Application.logMessageReceived += capture;
            LogAssert.ignoreFailingMessages = true;
            try { Write(path, source); }
            finally { LogAssert.ignoreFailingMessages = previous; Application.logMessageReceived -= capture; }
            Assert.That(errors.Exists(message => message.Contains("schema validation failed")), Is.True, string.Join("\n", errors));
            Assert.That(() => CutsceneImportValidation.ValidateSources(), Throws.TypeOf<FormatException>());
            Assert.That(AssetDatabase.LoadAssetAtPath<TextAsset>(path), Is.Null);
        }

        private static CutsceneDefinition Parse(JObject source) =>
            CutsceneImporter.Parse(source.ToString(), SchemaPath, "fixture.runtime.cutscene.json");

        private static JObject Source(string id) => new()
        {
            ["$schema"] = "../Vulcan/0204project/schemas/cutscene.schema.json",
            ["formatVersion"] = 1,
            ["id"] = id,
            ["mapId"] = "map-1",
            ["allowSkip"] = false,
            ["onComplete"] = new JObject { ["actorPlacements"] = new JArray(), ["actions"] = "" },
            ["sequence"] = new JArray(new JObject
            {
                ["id"] = "speak", ["action"] = "dialogue.play",
                ["arguments"] = new JObject { ["dialogue"] = "base:greeting" }
            })
        };

        private static void Write(string path, JObject source)
        {
            File.WriteAllText(path, source.ToString());
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
        }

        private static IEnumerator WaitFor(Func<bool> ready)
        {
            var deadline = EditorApplication.timeSinceStartup + 10;
            while (!ready() && EditorApplication.timeSinceStartup < deadline) yield return null;
            Assert.That(ready(), Is.True, "Automatic cutscene catalog discovery did not finish.");
        }
    }
}
