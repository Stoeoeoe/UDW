using System;
using System.IO;
using System.Linq;
using NUnit.Framework;

namespace Core.Scripting.Editor
{
    public sealed class LuaExecutionSessionTests
    {
        [Test]
        public void AwaitsHostCompletionAndResumesInOrder()
        {
            var api = new TestApi();
            using var run = Start(api, "Test.Wait(); Test.Finish()");
            run.Tick(0.02f);
            Assert.That(api.Finished, Is.False);
            run.Tick(0.02f);
            Assert.That(api.Finished, Is.False);
            api.Action.IsCompleted = true;
            run.Tick(0.02f);
            Assert.That(api.Finished, Is.True);
            Assert.That(run.IsRunning, Is.False);
            Assert.That(api.Action.Disposals, Is.EqualTo(1));
        }

        [Test]
        public void CancellationIsIdempotentAndRejectsLateCompletion()
        {
            var api = new TestApi();
            var run = Start(api, "Test.Wait(); Test.Finish()");
            run.Tick(0.02f);
            run.Cancel(); run.Dispose();
            api.Action.IsCompleted = true;
            run.Tick(0.02f);
            Assert.That(api.Finished, Is.False);
            Assert.That(api.Action.Disposals, Is.EqualTo(1));
            Assert.That(run.IsRunning, Is.False);
        }

        [Test]
        public void EndlessLuaFailsItsInstructionBudget()
        {
            using var loop = Start(new TestApi(), "while true do end");
            Assert.That(() => { for (var i = 0; i < 130; i++) loop.Tick(0.01f); },
                Throws.InvalidOperationException.With.Message.Contains("instruction budget"));
        }

        [Test]
        public void ActionFailureDisposesOnceAndNeverTicksTheActionAgain()
        {
            var api = new TestApi();
            api.Action.FailOnTick = true;
            using var run = Start(api, "Test.Wait(); Test.Finish()");
            run.Tick(0);
            Assert.That(() => run.Tick(0.02f), Throws.InvalidOperationException.With.Message.Contains("Action failed"));
            run.Cancel();
            run.Tick(0.02f);
            Assert.That(api.Action.Ticks, Is.EqualTo(1));
            Assert.That(api.Action.Disposals, Is.EqualTo(1));
            Assert.That(api.Finished, Is.False);
        }

        [Test]
        public void SessionsExcludeOrdinaryWritesAndSandboxLibraries()
        {
            var api = new TestApi();
            using var run = Start(api, "assert(os == nil and io == nil and dofile == nil and Test.OrdinaryWrite == nil); Test.Finish()");
            run.Tick(0.01f);
            Assert.That(run.IsRunning, Is.False);
            Assert.That(api.Finished, Is.True);
        }

        [Test]
        public void ErrorsCarrySourceAndContextRestrictionsAreEnforced()
        {
            using var run = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(new TestApi()), "Test.Finish()", "fixture:step-1", "npcRoutine");
            Assert.That(() => run.Tick(0.01f),
                Throws.InvalidOperationException.With.Message.Contains("fixture:step-1"));
        }

        [Test]
        public void ManifestRequiresExplicitActionOptInAndIsDeterministic()
        {
            var registry = new LuaBindingRegistry(new TestApi());
            var first = registry.Describe();
            Assert.That(first.schemaVersion, Is.EqualTo(2));
            var methods = first.modules[0].methods;
            Assert.That(methods[0].action.id, Is.EqualTo("test.finish"));
            Assert.That(methods[0].action.execution, Is.EqualTo("immediate"));
            Assert.That(methods[1].action, Is.Null, "Ordinary LuaCall must not become a visual action.");
            Assert.That(methods[2].action.execution, Is.EqualTo("awaitable"));
            Assert.That(methods[2].returnType, Is.EqualTo("nil"));
            Assert.That(UnityEngine.JsonUtility.ToJson(first), Is.EqualTo(UnityEngine.JsonUtility.ToJson(registry.Describe())));
        }

        [Test]
        public void UnsupportedContextIsRejectedBeforeRunning()
        {
            Assert.That(() => VulcanusLuaEngine.StartSession(new LuaBindingRegistry(new TestApi()),
                "Test.Finish()", "fixture", "unknown"), Throws.ArgumentException);
        }

        [Test]
        public void TypeDescriptionsMatchRuntimeDescriptionsWithoutCreatingApiObjects()
        {
            var fromTypes = LuaBindingRegistry.DescribeTypes(typeof(TestApi));
            var fromObject = new LuaBindingRegistry(new TestApi()).Describe();
            Assert.That(UnityEngine.JsonUtility.ToJson(fromTypes), Is.EqualTo(UnityEngine.JsonUtility.ToJson(fromObject)));
            Assert.That(() => LuaBindingRegistry.DescribeTypes(typeof(ConstructorRequiresGameApi)), Throws.Nothing);
        }

        [Test]
        public void TypeExportUsesTheSameSignatureAndIdentityValidationAsRuntimeBinding()
        {
            Assert.That(() => LuaBindingRegistry.DescribeTypes(typeof(InvalidExportApi)), Throws.InvalidOperationException);
            Assert.That(() => new LuaBindingRegistry(new InvalidExportApi()), Throws.InvalidOperationException);
            Assert.That(() => LuaBindingRegistry.DescribeTypes(typeof(TestApi), typeof(TestApi)), Throws.ArgumentException);
            Assert.That(() => LuaBindingRegistry.DescribeTypes(new Type[] { null }), Throws.ArgumentException);
        }

        [Test]
        public void GlobalManifestIncludesMapActionsWithoutLoadingAMap()
        {
            var manifest = VulcanusLuaEngine.DescribeBindings();
            var methods = manifest.modules.Single(module => module.path == "Actors").methods;
            var move = methods.Single(method => method.name == "MoveTo");
            Assert.That(move.name, Is.EqualTo("MoveTo"));
            Assert.That(move.action.id, Is.EqualTo("actors.moveTo"));
            Assert.That(move.action.execution, Is.EqualTo("awaitable"));
            Assert.That(move.action.contexts, Is.EqualTo(new[] { "cutscene", "npcRoutine" }));
            Assert.That(move.parameters[0].semanticType, Is.EqualTo("actorRef"));
            Assert.That(move.parameters[0].picker, Is.EqualTo("mapActor"));
            Assert.That(move.parameters[1].semanticType, Is.EqualTo("anchorRef"));
            Assert.That(move.parameters[1].picker, Is.EqualTo("mapAnchor"));
            var face = methods.Single(method => method.name == "Face");
            Assert.That(face.action.id, Is.EqualTo("actors.face"));
            Assert.That(face.action.execution, Is.EqualTo("immediate"));
            Assert.That(face.returnType, Is.EqualTo("nil"));
            Assert.That(face.parameters.Select(parameter => parameter.semanticType), Is.EqualTo(new[] { "actorRef", "actorRef" }));
            var play = manifest.modules.Single(module => module.path == "Dialogue").methods.Single();
            Assert.That(play.action.id, Is.EqualTo("dialogue.play"));
            Assert.That(play.action.execution, Is.EqualTo("awaitable"));
            Assert.That(play.action.contexts, Is.EqualTo(new[] { "cutscene" }));
            Assert.That(play.parameters.Single().semanticType, Is.EqualTo("dialogueRef"));
        }

        [Test]
        public void IdenticalExportsLeaveTheManifestFileUntouched()
        {
            var path = Path.Combine(Path.GetDirectoryName(UnityEngine.Application.dataPath), "Generated/Scripting/bindings.json");
            LuaBindingManifestExporter.Export();
            var content = File.ReadAllText(path);
            var writtenAt = File.GetLastWriteTimeUtc(path);
            LuaBindingManifestExporter.Export();
            Assert.That(File.ReadAllText(path), Is.EqualTo(content));
            Assert.That(File.GetLastWriteTimeUtc(path), Is.EqualTo(writtenAt));
        }

        [Test]
        public void SequenceFindsANewActionAndItsValidatorWithoutAnActionSwitch()
        {
            var api = new ValidationApi();
            var step = new CutsceneStep("new-step", "test.newAction", new[]
            {
                new CutsceneArgument("destination", "square"), new CutsceneArgument("actor", "player")
            });
            var registry = CutsceneBindings.BindSequence(new[] { step }, "cutscene",
                (typeof(ValidationApi), () => api),
                (typeof(ConstructorRequiresGameApi), () => new ConstructorRequiresGameApi()));
            Assert.That(api.Checked, Is.EqualTo("player:square"));
            Assert.That(api.Executed, Is.False);
            Assert.That(registry.Describe().modules.Select(module => module.path), Is.EqualTo(new[] { "Validation" }));
            using var run = VulcanusLuaEngine.StartSession(registry, "Validation.NewAction('player', 'square')", "fixture");
            run.Tick(0.01f);
            Assert.That(api.Executed, Is.True);
        }

        [Test]
        public void SequenceReportsTheStepWhenItsValidatorRejectsAReference()
        {
            var step = new CutsceneStep("bad-step", "test.newAction", new[]
            {
                new CutsceneArgument("actor", "missing"), new CutsceneArgument("destination", "square")
            });
            Assert.That(() => CutsceneBindings.BindSequence(new[] { step }, "cutscene",
                (typeof(ValidationApi), () => new ValidationApi())),
                Throws.InvalidOperationException.With.Message.Contains("step 'bad-step'").And.Message.Contains("Unknown actor"));
        }

        [TestCase(typeof(MissingValidatorApi), "needs a Validator")]
        [TestCase(typeof(WrongValidatorApi), "same parameter types")]
        public void InvalidValidatorsFailDuringMetadataExport(Type type, string reason)
        {
            Assert.That(() => LuaBindingRegistry.DescribeTypes(type),
                Throws.InvalidOperationException.With.Message.Contains(reason));
        }

        [LuaModule("Validation")]
        private sealed class ValidationApi
        {
            public string Checked;
            public bool Executed;
            [LuaAction("test.newAction", "New", "Test", "New action", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            public void NewAction([LuaReference("actorRef", "mapActor")] string actor, string destination) => Executed = true;
            [UnityEngine.Scripting.Preserve]
            private void Check(string actor, string destination)
            {
                if (actor != "player") throw new InvalidOperationException("Unknown actor");
                Checked = actor + ":" + destination;
            }
        }

        [LuaModule("MissingValidator")]
        private sealed class MissingValidatorApi
        {
            [LuaAction("test.missing", "Missing", "Test", "Missing validator", "cutscene", Phases = new[] { "sequence" })]
            public void Run([LuaReference("actorRef", "mapActor")] string actor) { }
        }

        [LuaModule("WrongValidator")]
        private sealed class WrongValidatorApi
        {
            [LuaAction("test.wrong", "Wrong", "Test", "Wrong signature", "cutscene", Validator = nameof(Check), Phases = new[] { "sequence" })]
            public void Run(string actor) { }
            [UnityEngine.Scripting.Preserve]
            private void Check(int actor) { }
        }

        [LuaModule("RequiresGame")]
        private sealed class ConstructorRequiresGameApi
        {
            public ConstructorRequiresGameApi() => throw new InvalidOperationException("A running game is required.");
            [LuaCall] public void Read() { }
        }

        [LuaModule("InvalidExport")]
        private sealed class InvalidExportApi
        {
            [LuaCall] public void Move(UnityEngine.Vector2 destination) { }
        }

        private static LuaExecutionSession Start(TestApi api, string lua) =>
            VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api), lua, "fixture");

        [LuaModule("Test")]
        private sealed class TestApi
        {
            public readonly PendingAction Action = new();
            public bool Finished;
            [LuaAction("test.wait", "Wait", "Test", "Test suspension", "cutscene", Phases = new[] { "sequence" })]
            public ILuaAction Wait() => Action;
            [LuaAction("test.finish", "Finish", "Test", "Test completion", "cutscene", Phases = new[] { "sequence" })]
            public void Finish() => Finished = true;
            [LuaCall(true)] public void OrdinaryWrite() => throw new Exception("Must not be exposed");
        }

        private sealed class PendingAction : ILuaAction
        {
            public bool IsCompleted { get; set; }
            public int Disposals;
            public int Ticks;
            public bool FailOnTick;
            public void Tick(float deltaTime)
            {
                Ticks++;
                if (FailOnTick) throw new InvalidOperationException("Action failed.");
            }
            public void Dispose() => Disposals++;
        }
    }
}
