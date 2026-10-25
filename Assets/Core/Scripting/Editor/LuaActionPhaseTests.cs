using System;
using System.Linq;
using NUnit.Framework;

namespace Core.Scripting.Editor
{
    public sealed class LuaActionPhaseTests
    {
        [Test]
        public void CurrentActionsDeclarePhasesIndependentlyOfExecutionContexts()
        {
            var actions = VulcanusLuaEngine.DescribeBindings().modules.SelectMany(module => module.methods)
                .Where(method => method.action != null).ToDictionary(method => method.action.id);
            Assert.That(actions["actors.face"].action.phases, Is.EqualTo(new[] { "completion", "sequence", "setup" }));
            Assert.That(actions["actors.face"].action.contexts, Is.EqualTo(new[] { "cutscene", "npcRoutine" }));
            foreach (var id in new[] { "actors.moveTo", "cutscene.wait", "dialogue.play", "actors.playAnimation" })
            {
                Assert.That(actions[id].action.execution, Is.EqualTo("awaitable"), id);
                Assert.That(actions[id].action.phases, Is.EqualTo(new[] { "sequence" }), id);
            }
        }

        [TestCase(typeof(MissingPhases), "explicit action phases")]
        [TestCase(typeof(UnknownPhase), "unsupported or duplicate action phases")]
        [TestCase(typeof(DuplicatePhase), "unsupported or duplicate action phases")]
        [TestCase(typeof(AwaitableSetup), "awaitable actions cannot allow setup or completion")]
        [TestCase(typeof(AwaitableCompletion), "awaitable actions cannot allow setup or completion")]
        public void InvalidPhasesFailBothTypeExportAndRuntimeRegistration(Type type, string reason)
        {
            Assert.That(() => LuaBindingRegistry.DescribeTypes(type), Throws.InvalidOperationException.With.Message.Contains(reason));
            Assert.That(() => new LuaBindingRegistry(Activator.CreateInstance(type)), Throws.InvalidOperationException.With.Message.Contains(reason));
        }

        [LuaModule("Missing")]
        public sealed class MissingPhases
        {
            [LuaAction("test.missing", "Missing", "Test", "No phases declared.", "cutscene")]
            public void Run() { }
        }

        [LuaModule("Unknown")]
        public sealed class UnknownPhase
        {
            [LuaAction("test.unknown", "Unknown", "Test", "Unknown phase.", "cutscene", Phases = new[] { "before" })]
            public void Run() { }
        }

        [LuaModule("Duplicate")]
        public sealed class DuplicatePhase
        {
            [LuaAction("test.duplicate", "Duplicate", "Test", "Duplicate phase.", "cutscene", Phases = new[] { "sequence", "sequence" })]
            public void Run() { }
        }

        [LuaModule("Setup")]
        public sealed class AwaitableSetup
        {
            [LuaAction("test.setup", "Setup", "Test", "Awaitable setup is forbidden.", "cutscene", Phases = new[] { "setup", "sequence" })]
            public ILuaAction Run() => throw new InvalidOperationException("Metadata inspection must not execute the action.");
        }

        [LuaModule("Completion")]
        public sealed class AwaitableCompletion
        {
            [LuaAction("test.completion", "Completion", "Test", "Awaitable completion is forbidden.", "cutscene", Phases = new[] { "completion" })]
            public ILuaAction Run() => throw new InvalidOperationException("Metadata inspection must not execute the action.");
        }
    }
}
