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
            api.Action.Status = LuaExecutionStatus.Succeeded;
            run.Tick(0.02f);
            Assert.That(api.Finished, Is.True, run.Error);
            Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Succeeded), run.Error);
            Assert.That(api.Action.Disposals, Is.EqualTo(1));
        }

        [TestCase(LuaExecutionStatus.Cancelled)]
        [TestCase(LuaExecutionStatus.Failed)]
        [TestCase(LuaExecutionStatus.TimedOut)]
        public void NonSuccessNeverRunsNextAction(LuaExecutionStatus status)
        {
            var api = new TestApi();
            using var run = Start(api, "Test.Wait(); Test.Finish()");
            run.Tick(0.02f);
            api.Action.Status = status;
            run.Tick(0.02f);
            Assert.That(run.Status, Is.EqualTo(status));
            Assert.That(api.Finished, Is.False);
        }

        [Test]
        public void CancellationIsIdempotentAndRejectsLateCompletion()
        {
            var api = new TestApi();
            var run = Start(api, "Test.Wait(); Test.Finish()");
            run.Tick(0.02f);
            run.Cancel(); run.Dispose();
            api.Action.Status = LuaExecutionStatus.Succeeded;
            run.Tick(0.02f);
            Assert.That(api.Finished, Is.False);
            Assert.That(api.Action.Disposals, Is.EqualTo(1));
            Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Cancelled));
        }

        [Test]
        public void DeadlineAndInstructionBudgetAreDistinctFromAwaiting()
        {
            var api = new TestApi();
            using var timeout = Start(api, "Test.Wait()");
            timeout.Tick(0.01f); timeout.Tick(121f);
            Assert.That(timeout.Status, Is.EqualTo(LuaExecutionStatus.TimedOut));
            using var loop = Start(new TestApi(), "while true do end");
            for (var i = 0; i < 130; i++) loop.Tick(0.01f);
            Assert.That(loop.Status, Is.EqualTo(LuaExecutionStatus.Failed));
            Assert.That(loop.Error, Does.Contain("instruction budget"));
        }

        [Test]
        public void SessionsExcludeOrdinaryWritesAndSandboxLibraries()
        {
            var api = new TestApi();
            using var run = Start(api, "assert(os == nil and io == nil and dofile == nil and Test.OrdinaryWrite == nil); Test.Finish()");
            run.Tick(0.01f);
            Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Succeeded), run.Error);
            Assert.That(api.Finished, Is.True);
        }

        [Test]
        public void ErrorsCarrySourceAndContextRestrictionsAreEnforced()
        {
            using var run = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(new TestApi()), "Test.Finish()", "fixture:step-1", "npcRoutine");
            run.Tick(0.01f);
            Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Failed));
            Assert.That(run.Error, Does.Contain("fixture:step-1"));
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
            var move = manifest.modules.Single(module => module.path == "Actors").methods.Single();
            Assert.That(move.name, Is.EqualTo("MoveTo"));
            Assert.That(move.action.id, Is.EqualTo("actors.moveTo"));
            Assert.That(move.action.execution, Is.EqualTo("awaitable"));
            Assert.That(move.action.contexts, Is.EqualTo(new[] { "cutscene", "npcRoutine" }));
            Assert.That(move.parameters[0].semanticType, Is.EqualTo("actorRef"));
            Assert.That(move.parameters[0].picker, Is.EqualTo("mapActor"));
            Assert.That(move.parameters[1].semanticType, Is.EqualTo("anchorRef"));
            Assert.That(move.parameters[1].picker, Is.EqualTo("mapAnchor"));
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
            [LuaCall(true), LuaAction("test.wait", "Wait", "Test", "Test suspension", "cutscene")]
            public ILuaAction Wait() => Action;
            [LuaCall, LuaAction("test.finish", "Finish", "Test", "Test completion", "cutscene")]
            public void Finish() => Finished = true;
            [LuaCall(true)] public void OrdinaryWrite() => throw new Exception("Must not be exposed");
        }

        private sealed class PendingAction : ILuaAction
        {
            public LuaExecutionStatus Status { get; set; } = LuaExecutionStatus.Running;
            public string Error => "Test action ended";
            public int Disposals;
            public void Tick(float deltaTime) { }
            public void Dispose() => Disposals++;
        }
    }
}
