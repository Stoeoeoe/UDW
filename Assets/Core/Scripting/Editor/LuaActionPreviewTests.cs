using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine.Scripting;

namespace Core.Scripting.Editor
{
    public sealed class LuaActionPreviewTests
    {
        private static string Json(object value) => JsonConvert.SerializeObject(value,
            new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore });

        [Test]
        public void CurrentActionsMatchTheVersionedHandoffFixtureWithoutLiveApis()
        {
            var manifest = LuaBindingRegistry.DescribeTypes(typeof(MapActorLuaApi), typeof(DialogueLuaApi), typeof(CutsceneLuaApi));
            var path = Path.Combine(Path.GetDirectoryName(UnityEngine.Application.dataPath), "Docs/Examples/LuaActionPreview.v1.json");
            var expected = JObject.Parse(File.ReadAllText(path))["actions"];
            Assert.That(manifest.schemaVersion, Is.EqualTo(2));
            foreach (var action in manifest.modules.SelectMany(module => module.methods).Select(method => method.action))
            {
                Assert.That(expected[action.id], Is.Not.Null, action.id);
                Assert.That(JToken.DeepEquals(JToken.Parse(Json(action.preview)), expected[action.id]), Is.True, action.id);
            }
        }

        [Test]
        public void ExplicitNoOpIsDistinctFromAbsentPreviewMetadata()
        {
            var methods = LuaBindingRegistry.DescribeTypes(typeof(NoOpApi)).modules.Single().methods;
            var known = methods.Single(method => method.name == nameof(NoOpApi.Known));
            Assert.That(known.action.preview.spatialState, Is.EqualTo("described"));
            Assert.That(known.action.preview.effects, Is.Empty);
            var absent = methods.Single(method => method.name == nameof(NoOpApi.Unmodelled));
            Assert.That(absent.action.preview, Is.Null);
            Assert.That(JObject.Parse(Json(absent.action)).Property("preview"), Is.Null);
        }

        [Test]
        public void UnrelatedNamesExportMultipleEffectsInExplicitOrderWithoutChangingExecution()
        {
            var api = new CompositeApi();
            var registry = new LuaBindingRegistry(api);
            var method = registry.Describe().modules.Single().methods.Single();
            var preview = method.action.preview;
            Assert.That(method.action.id, Is.EqualTo("custom:escort"));
            Assert.That(method.action.execution, Is.EqualTo("immediate"));
            Assert.That(method.action.contexts, Is.EqualTo(new[] { "cutscene" }));
            Assert.That(preview.spatialState, Is.EqualTo("unknown"));
            Assert.That(preview.effects.Select(effect => effect.kind), Is.EqualTo(new[]
                { "moveActorToAnchor", "faceActorTowardActor", "showDialogue" }));
            Assert.That(preview.effects[0].actorParameter, Is.EqualTo("traveller"));
            Assert.That(preview.effects[0].anchorParameter, Is.EqualTo("meeting"));
            Assert.That(preview.effects[0].facing, Is.EqualTo("unknown"));
            Assert.That(preview.effects[1].targetActorParameter, Is.EqualTo("host"));
            Assert.That(preview.effects[2].dialogueParameter, Is.EqualTo("conversation"));
            Assert.That(Json(LuaBindingRegistry.DescribeTypes(typeof(CompositeApi))), Is.EqualTo(Json(registry.Describe())));
            Assert.That(api.Calls, Is.Zero, "Inspecting declarations must not run actions or reference validators.");
            using var session = VulcanusLuaEngine.StartSession(registry,
                "Unrelated.Visit('one', 'two', 'three', 'four')", "preview-fixture");
            session.Tick(0);
            Assert.That(api.Calls, Is.EqualTo(1));
            Assert.That(session.IsRunning, Is.False);
        }

        [Test]
        public void TypeExportDoesNotConstructApisOrRunTheirMethods()
        {
            Assert.That(() => LuaBindingRegistry.DescribeTypes(typeof(SceneDependentApi)), Throws.Nothing);
        }

        [Test]
        public void MetadataChangesUpdateTheFileButRepeatedExportLeavesItUntouched()
        {
            var path = Path.Combine(Path.GetTempPath(), "lua-preview-" + Guid.NewGuid().ToString("N") + ".json");
            try
            {
                var manifest = LuaBindingRegistry.DescribeTypes(typeof(NoOpApi));
                Assert.That(LuaBindingManifestExporter.WriteIfChanged(path, manifest), Is.True);
                var content = File.ReadAllText(path);
                var marker = new DateTime(2001, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                File.SetLastWriteTimeUtc(path, marker);
                Assert.That(LuaBindingManifestExporter.WriteIfChanged(path,
                    LuaBindingRegistry.DescribeTypes(typeof(NoOpApi))), Is.False);
                Assert.That(File.GetLastWriteTimeUtc(path), Is.EqualTo(marker));
                manifest.modules.Single().methods.Single(method => method.name == nameof(NoOpApi.Known))
                    .action.preview.spatialState = "unknown";
                Assert.That(LuaBindingManifestExporter.WriteIfChanged(path, manifest), Is.True);
                Assert.That(File.ReadAllText(path), Is.Not.EqualTo(content));
                Assert.That(LuaBindingManifestExporter.WriteIfChanged(path, manifest), Is.False);
            }
            finally { File.Delete(path); }
        }

        [TestCase(typeof(MissingParameterApi), "preview parameter 'missing'")]
        [TestCase(typeof(MissingMappingApi), "preview parameter ''")]
        [TestCase(typeof(WrongSemanticApi), "actorRef/mapActor")]
        [TestCase(typeof(WrongPickerApi), "semantic reference")]
        [TestCase(typeof(WrongTypeApi), "semantic reference")]
        [TestCase(typeof(UnmarkedParameterApi), "actorRef/mapActor")]
        [TestCase(typeof(UnknownKindApi), "unsupported preview effect kind")]
        [TestCase(typeof(UnknownVersionApi), "unsupported preview version")]
        [TestCase(typeof(UnknownSpatialApi), "unsupported preview spatial state")]
        [TestCase(typeof(MissingEnvelopeApi), "require [LuaPreview]")]
        [TestCase(typeof(NonActionApi), "requires [LuaAction]")]
        [TestCase(typeof(UnexposedApi), "requires [LuaAction]")]
        [TestCase(typeof(DuplicateOrderApi), "order must be nonnegative and unique")]
        [TestCase(typeof(NegativeOrderApi), "order must be nonnegative and unique")]
        [TestCase(typeof(MissingMoveFacingApi), "requires facing 'unknown'")]
        [TestCase(typeof(UnsupportedMoveFacingApi), "requires facing 'unknown'")]
        [TestCase(typeof(ForbiddenMoveFieldApi), "forbids targetActorParameter")]
        [TestCase(typeof(ForbiddenFaceFieldApi), "forbids anchorParameter")]
        [TestCase(typeof(ForbiddenDialogueFieldApi), "forbids actorParameter")]
        public void InvalidDeclarationsFailDuringTypeExportAndRuntimeRegistration(Type type, string reason)
        {
            Assert.That(() => LuaBindingRegistry.DescribeTypes(type),
                Throws.InvalidOperationException.With.Message.Contains(type.Name + ".Run").And.Message.Contains(reason));
            Assert.That(() => new LuaBindingRegistry(Activator.CreateInstance(type, nonPublic: true)),
                Throws.InvalidOperationException.With.Message.Contains(type.Name + ".Run").And.Message.Contains(reason));
        }

        [LuaModule("NoOp")]
        private sealed class NoOpApi
        {
[LuaAction("test.known", "Known", "Test", "Known spatial no-op", "cutscene", Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            public void Known() { }
[LuaAction("test.unmodelled", "Unmodelled", "Test", "No preview contract", "cutscene", Phases = new[] { "sequence" })]
            public void Unmodelled() { }
        }

        [LuaModule("Unrelated")]
        private sealed class CompositeApi
        {
            public int Calls;
[LuaAction("custom:escort", "Visit", "Test", "Composite metadata fixture", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Unknown)]
            [LuaPreviewEffect(20, LuaPreviewEffectKind.ShowDialogue, DialogueParameter = "conversation")]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.MoveActorToAnchor, ActorParameter = "traveller", AnchorParameter = "meeting", Facing = "unknown")]
            [LuaPreviewEffect(10, LuaPreviewEffectKind.FaceActorTowardActor, ActorParameter = "traveller", TargetActorParameter = "host")]
            public void Visit([LuaReference("actorRef", "mapActor")] string traveller,
                [LuaReference("anchorRef", "mapAnchor")] string meeting,
                [LuaReference("actorRef", "mapActor")] string host,
                [LuaReference("dialogueRef", "dialogue")] string conversation) => Calls++;
            [Preserve] private void Check(string traveller, string meeting, string host, string conversation) =>
                throw new InvalidOperationException("Preview export must not run validators.");
        }

        [LuaModule("SceneDependent")]
        private sealed class SceneDependentApi
        {
            public SceneDependentApi() => throw new InvalidOperationException("No running scene.");
[LuaAction("test.scene", "Scene", "Test", "Needs a scene only at runtime", "cutscene", Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            public void Run() => throw new InvalidOperationException("Do not execute during export.");
        }

        [LuaModule("InvalidPreview")]
        private abstract class InvalidApi { }

        private sealed class MissingParameterApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Missing declared argument", "cutscene", Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Unknown)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.ShowDialogue, DialogueParameter = "missing")]
            public void Run() { }
        }
        private sealed class MissingMappingApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Missing mapping", "cutscene", Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Unknown)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.ShowDialogue)]
            public void Run() { }
        }
        private sealed class WrongSemanticApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Wrong semantic role", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.FaceActorTowardActor, ActorParameter = "who", TargetActorParameter = "who")]
            public void Run([LuaReference("dialogueRef", "dialogue")] string who) { }
            [Preserve] private void Check(string who) { }
        }
        private sealed class WrongPickerApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Wrong picker", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.FaceActorTowardActor, ActorParameter = "who", TargetActorParameter = "who")]
            public void Run([LuaReference("actorRef", "dialogue")] string who) { }
            [Preserve] private void Check(string who) { }
        }
        private sealed class WrongTypeApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Wrong argument type", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.FaceActorTowardActor, ActorParameter = "who", TargetActorParameter = "who")]
            public void Run([LuaReference("actorRef", "mapActor")] int who) { }
            [Preserve] private void Check(int who) { }
        }
        private sealed class UnmarkedParameterApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Missing semantic annotation", "cutscene", Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.FaceActorTowardActor, ActorParameter = "who", TargetActorParameter = "who")]
            public void Run(string who) { }
        }
        private sealed class UnknownKindApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Unsupported kind", "cutscene", Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Unknown)]
            [LuaPreviewEffect(0, (LuaPreviewEffectKind)99)]
            public void Run() { }
        }
        private sealed class UnknownVersionApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Unsupported version", "cutscene", Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Unknown, Version = 99)]
            public void Run() { }
        }
        private sealed class UnknownSpatialApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Unsupported certainty", "cutscene", Phases = new[] { "sequence" })]
            [LuaPreview((LuaPreviewSpatialState)99)]
            public void Run() { }
        }
        private sealed class MissingEnvelopeApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Missing preview header", "cutscene", Phases = new[] { "sequence" })]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.ShowDialogue)]
            public void Run() { }
        }
        private sealed class NonActionApi : InvalidApi
        {
            [LuaCall, LuaPreview(LuaPreviewSpatialState.Described)]
            public void Run() { }
        }
        private sealed class UnexposedApi : InvalidApi
        {
            [LuaPreview(LuaPreviewSpatialState.Described)]
            public void Run() { }
        }
        private sealed class DuplicateOrderApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Duplicate effect order", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Unknown)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.ShowDialogue, DialogueParameter = "talk")]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.ShowDialogue, DialogueParameter = "talk")]
            public void Run([LuaReference("dialogueRef", "dialogue")] string talk) { }
            [Preserve] private void Check(string talk) { }
        }
        private sealed class NegativeOrderApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Negative effect order", "cutscene", Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Unknown)]
            [LuaPreviewEffect(-1, LuaPreviewEffectKind.ShowDialogue)]
            public void Run() { }
        }
        private sealed class MissingMoveFacingApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Missing facing certainty", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.MoveActorToAnchor, ActorParameter = "who", AnchorParameter = "where")]
            public void Run([LuaReference("actorRef", "mapActor")] string who, [LuaReference("anchorRef", "mapAnchor")] string where) { }
            [Preserve] private void Check(string who, string where) { }
        }
        private sealed class UnsupportedMoveFacingApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Invented facing rule", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.MoveActorToAnchor, ActorParameter = "who", AnchorParameter = "where", Facing = "anchor")]
            public void Run([LuaReference("actorRef", "mapActor")] string who, [LuaReference("anchorRef", "mapAnchor")] string where) { }
            [Preserve] private void Check(string who, string where) { }
        }
        private sealed class ForbiddenMoveFieldApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Forbidden move field", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.MoveActorToAnchor, ActorParameter = "who", AnchorParameter = "where", Facing = "unknown", TargetActorParameter = "who")]
            public void Run([LuaReference("actorRef", "mapActor")] string who, [LuaReference("anchorRef", "mapAnchor")] string where) { }
            [Preserve] private void Check(string who, string where) { }
        }
        private sealed class ForbiddenFaceFieldApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Forbidden facing field", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Described)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.FaceActorTowardActor, ActorParameter = "who", TargetActorParameter = "who", Facing = "unknown")]
            public void Run([LuaReference("actorRef", "mapActor")] string who) { }
            [Preserve] private void Check(string who) { }
        }
        private sealed class ForbiddenDialogueFieldApi : InvalidApi
        {
[LuaAction("test.invalid", "Invalid", "Test", "Forbidden dialogue field", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            [LuaPreview(LuaPreviewSpatialState.Unknown)]
            [LuaPreviewEffect(0, LuaPreviewEffectKind.ShowDialogue, DialogueParameter = "talk", ActorParameter = "talk")]
            public void Run([LuaReference("dialogueRef", "dialogue")] string talk) { }
            [Preserve] private void Check(string talk) { }
        }
    }
}
