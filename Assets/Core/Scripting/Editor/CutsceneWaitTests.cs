using System;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Core.Scripting.Editor
{
    public sealed class CutsceneWaitTests
    {
        [Test]
        public void WaitResumesAfterAccumulatedGameplaySeconds()
        {
            var observer = new Observer();
            using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(new CutsceneLuaApi(), observer),
                "Cutscene.Wait(0.5); Observer.Finish()", "wait-fixture");
            session.Tick(10); // Starts the action; elapsed time before it started does not count.
            session.Tick(0.25f);
            session.Tick(0); // Paused gameplay does not advance the timer.
            Assert.That(observer.Finished, Is.False);
            session.Tick(0.25f);
            Assert.That(observer.Finished, Is.True);
            Assert.That(session.IsRunning, Is.False);
        }

        [Test]
        public void ZeroWaitYieldsAndCancellationStopsTheRemainingSequence()
        {
            var observer = new Observer();
            using (var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(new CutsceneLuaApi(), observer),
                       "Cutscene.Wait(0); Observer.Finish()", "zero-wait"))
            {
                session.Tick(0);
                Assert.That(observer.Finished, Is.False);
                session.Tick(0);
                Assert.That(observer.Finished, Is.True);
            }
            observer.Finished = false;
            using var cancelled = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(new CutsceneLuaApi(), observer),
                "Cutscene.Wait(1); Observer.Finish()", "cancelled-wait");
            cancelled.Tick(0);
            cancelled.Cancel();
            cancelled.Tick(2);
            Assert.That(observer.Finished, Is.False);
            Assert.That(cancelled.IsRunning, Is.False);
        }

        [TestCase(-1)]
        [TestCase(double.NaN)]
        [TestCase(double.PositiveInfinity)]
        [TestCase(double.NegativeInfinity)]
        public void RejectsInvalidDurationBeforeCreatingAnAction(double seconds)
        {
            Assert.That(() => new CutsceneLuaApi().Wait(seconds), Throws.TypeOf<ArgumentOutOfRangeException>());
        }

        [Test]
        public void CompilesAndBindsNumericArgumentsWithInvariantCulture()
        {
            var previousCulture = CultureInfo.CurrentCulture;
            try
            {
                CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("de-CH");
                var lua = CutsceneSequenceCompiler.Compile(Sequence(new JValue(0.5)), "wait.json", out var steps);
                Assert.That(lua, Is.EqualTo("Cutscene.Wait(0.5);\n"));
                Assert.That(steps.Single().Arguments.Single().Value, Is.EqualTo("0.5"));
                var bindings = CutsceneBindings.BindSequence(steps, "cutscene",
                    (typeof(CutsceneLuaApi), () => new CutsceneLuaApi()));
                using var session = VulcanusLuaEngine.StartSession(bindings, lua, "imported-wait");
                session.Tick(0);
                session.Tick(0.25f);
                Assert.That(session.IsRunning, Is.True);
                session.Tick(0.25f);
                Assert.That(session.IsRunning, Is.False);
            }
            finally { CultureInfo.CurrentCulture = previousCulture; }
        }

        [TestCase("'0.5'")]
        [TestCase("true")]
        [TestCase("null")]
        [TestCase("-0.5")]
        [TestCase("NaN")]
        [TestCase("Infinity")]
        public void ImportRejectsInvalidDurationWithSourceAndStep(string json)
        {
            Assert.That(() => CutsceneSequenceCompiler.Compile(Sequence(JToken.Parse(json)), "wait.json"),
                Throws.TypeOf<FormatException>().With.Message.Contains("wait.json: sequence[0] (pause)"));
        }

        [Test]
        public void BindingRejectsInvalidDurationBeforePlayback()
        {
            var steps = new[] { new CutsceneStep("pause", "cutscene.wait", new[] { new CutsceneArgument("seconds", "-1") }) };
            Assert.That(() => CutsceneBindings.BindSequence(steps, "cutscene", (typeof(CutsceneLuaApi), () => new CutsceneLuaApi())),
                Throws.InvalidOperationException.With.Message.Contains("step 'pause'").And.Message.Contains("nonnegative"));
        }

        [Test]
        public void ExportsAwaitableNumericActionWithKnownUnchangedSpatialState()
        {
            var method = VulcanusLuaEngine.DescribeBindings().modules.Single(module => module.path == "Cutscene").methods.Single();
            Assert.That(method.action.id, Is.EqualTo("cutscene.wait"));
            Assert.That(method.action.execution, Is.EqualTo("awaitable"));
            Assert.That(method.action.contexts, Is.EqualTo(new[] { "cutscene" }));
            Assert.That(method.parameters.Single().name, Is.EqualTo("seconds"));
            Assert.That(method.parameters.Single().type, Is.EqualTo("number"));
            Assert.That(method.action.preview.spatialState, Is.EqualTo("described"));
            Assert.That(method.action.preview.effects, Is.Empty);
        }

        private static JArray Sequence(JToken seconds) => new(new JObject
        {
            ["id"] = "pause", ["action"] = "cutscene.wait", ["arguments"] = new JObject { ["seconds"] = seconds }
        });

        [LuaModule("Observer")]
        private sealed class Observer
        {
            public bool Finished;
            [LuaAction("test.finish", "Finish", "Test", "Observe sequence completion.", "cutscene", Phases = new[] { "sequence" })]
            public void Finish() => Finished = true;
        }
    }
}
