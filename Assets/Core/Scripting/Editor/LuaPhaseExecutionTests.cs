using NUnit.Framework;

namespace Core.Scripting.Editor
{
    public sealed class LuaPhaseExecutionTests
    {
        [TestCase("setup", "Stage")]
        [TestCase("completion", "Finish")]
        public void ImmediatePhasesExecuteOnlyTheirDeclaredActions(string phase, string method)
        {
            var api = new PhaseApi();
            using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api), $"Test.{method}()", "phase-fixture", phase: phase);
            session.Tick(0);
            Assert.That(api.Calls, Is.EqualTo(1));
            Assert.That(session.IsRunning, Is.False);
        }

        [TestCase("setup", "Finish")]
        [TestCase("completion", "Stage")]
        [TestCase("sequence", "Stage")]
        public void ScriptsCannotCallActionsFromAnotherPhase(string phase, string method)
        {
            var api = new PhaseApi();
            using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api), $"Test.{method}()", "phase-fixture", phase: phase);
            Assert.That(() => session.Tick(0), Throws.InvalidOperationException);
            Assert.That(api.Calls, Is.Zero);
        }

        [Test]
        public void UnsupportedPhaseIsRejectedAtSessionCreation()
        {
            Assert.That(() => VulcanusLuaEngine.StartSession(new LuaBindingRegistry(new PhaseApi()), "Test.Stage()", "phase-fixture", phase: "typo"),
                Throws.ArgumentException);
        }

        [LuaModule("Test")]
        private sealed class PhaseApi
        {
            public int Calls;
            [LuaAction("test.stage", "Stage", "Test", "Immediate setup.", "cutscene", Phases = new[] { "setup" })]
            public void Stage() => Calls++;
            [LuaAction("test.finish", "Finish", "Test", "Immediate completion.", "cutscene", Phases = new[] { "completion" })]
            public void Finish() => Calls++;
        }
    }
}
