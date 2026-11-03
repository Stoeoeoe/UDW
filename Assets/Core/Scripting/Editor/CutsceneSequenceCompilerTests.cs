using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;

namespace Core.Scripting.Editor
{
    public sealed class CutsceneSequenceCompilerTests : Core.Common.Editor.GameTest
    {

        [Test]
        public void ParallelTracksStartTogetherRunSequentiallyAndJoinTheSlowestTrack()
        {
            var source = new JArray(Parallel(
                new JArray(ProbeStep("left-one", 0.25), ProbeStep("left-two", 0.75)), new JArray(ProbeStep("right", 2))), ProbeStep("after", 3));
            var lua = CutsceneSequenceCompiler.Compile(source, "parallel-fixture", out var steps);
            var api = new ParallelProbeApi();
            var bindings = Game.BindSequence(steps, "cutscene", (typeof(ParallelProbeApi), () => api));
            using var run = VulcanusLuaEngine.StartSession(bindings, lua, "parallel-fixture");
            run.Tick(99); // Time from before actions started must not advance them.
            Assert.That(api.Started, Is.EqualTo(new[] { "left-one", "right" }));
            Assert.That(run.CurrentStepId, Is.EqualTo("parallel"));
            run.Tick(0.25f);
            Assert.That(api.Started, Is.EqualTo(new[] { "left-one", "right", "left-two" }));
            Assert.That(api.Actions[0].Disposals, Is.EqualTo(1));
            run.Tick(0.75f);
            Assert.That(api.Started, Does.Not.Contain("after"));
            run.Tick(1);
            Assert.That(api.Started.Last(), Is.EqualTo("after"));
            Assert.That(api.Actions.Take(3).All(action => action.Disposals == 1), Is.True);
            run.Tick(3);
            Assert.That(run.IsRunning, Is.False);
            Assert.That(api.Actions.All(action => action.Disposals == 1), Is.True);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void ParallelCancellationAndFailureDisposeEveryActiveSiblingOnce(bool fail)
        {
            var lua = CutsceneSequenceCompiler.Compile(new JArray(Parallel(
                new JArray(ProbeStep("right", 2)), new JArray(ProbeStep(fail ? "fail" : "left-two", fail ? 0.5 : 0.75))), ProbeStep("after", 3)), "parallel-cleanup");
            var api = new ParallelProbeApi();
            using var run = VulcanusLuaEngine.StartSession(Game.Bind(api), lua, "parallel-cleanup");
            run.Tick(0);
            if (fail)
                Assert.That(() => run.Tick(0.1f), Throws.InvalidOperationException.With.Message
                    .Contains("parallel 'parallel', track 2").And.Message.Contains("step 'fail'"));
            else run.Cancel();
            run.Dispose();
            run.Tick(10);
            Assert.That(api.Actions.Count, Is.EqualTo(2));
            Assert.That(api.Actions.All(action => action.Disposals == 1), Is.True);
            Assert.That(run.IsRunning, Is.False);
        }

        [Test]
        public void ParallelCompilerRejectsMalformedTracksPhasesDuplicatesAndConflictingOwners()
        {
            var valid = Parallel(new JArray(Talk("one")), new JArray(Step("wait", "cutscene.wait", new JObject { ["seconds"] = 1 })));
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(valid), "fixture"), Throws.Nothing);
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(valid), "fixture", out _, "setup"), Throws.TypeOf<FormatException>());
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(Parallel(new JArray(), new JArray(Talk("two")))), "fixture"), Throws.TypeOf<FormatException>());
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(Parallel(new JArray(Talk("same")), new JArray(Talk("same")))), "fixture"), Throws.TypeOf<FormatException>().With.Message.Contains("Duplicate step ID"));
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(Parallel(new JArray(Talk("one")), new JArray(Talk("two")))), "fixture"), Throws.TypeOf<FormatException>().With.Message.Contains("dialogue"));
            var move = Step("move", "characters.moveTo", new JObject { ["character"] = "player", ["destination"] = "gate" });
            var face = Step("face", "characters.face", new JObject { ["character"] = "player", ["target"] = "host" });
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(Parallel(new JArray(move), new JArray(face))), "fixture"), Throws.TypeOf<FormatException>().With.Message.Contains("character:player"));
            var nested = (JObject)valid.DeepClone();
            nested["id"] = "nested";
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(Parallel(new JArray(nested), new JArray(Talk("other")))), "fixture"), Throws.TypeOf<FormatException>().With.Message.Contains("top level"));
        }

        [Test]
        public void ParallelStartFailureDisposesAnAlreadyStartedSibling()
        {
            var lua = CutsceneSequenceCompiler.Compile(new JArray(Parallel(
                new JArray(ProbeStep("started", 2)), new JArray(ProbeStep("start-failure", 4)))), "parallel-start-failure");
            var api = new ParallelProbeApi();
            using var run = VulcanusLuaEngine.StartSession(Game.Bind(api), lua, "parallel-start-failure");
            Assert.That(() => run.Tick(0), Throws.InvalidOperationException.With.Message.Contains("track 2").And.Message.Contains("start-failure"));
            Assert.That(api.Actions.Single().Disposals, Is.EqualTo(1));
            Assert.That(run.IsRunning, Is.False);
        }

        private static JObject Talk(string id) => Step(id, "dialogue.play", new JObject { ["dialogue"] = id });
        private static JObject ProbeStep(string id, double seconds) => Step(id, "cutscene.wait", new JObject { ["seconds"] = seconds });
        private static JObject Parallel(params JArray[] tracks) => new()
        {
            ["id"] = "parallel", ["action"] = "control.parallel", ["arguments"] = new JObject(),
            ["tracks"] = new JArray(tracks.Select(track => (JToken)track))
        };

        [LuaModule("Cutscene")]
        private sealed class ParallelProbeApi
        {
            public readonly List<string> Started = new();
            public readonly List<ProbeAction> Actions = new();
            [LuaAction("cutscene.wait", "Probe", "Test", "Observe parallel actions.", "cutscene", Phases = new[] { "sequence" })]
            public ILuaAction Wait(double seconds)
            {
                if (seconds == 4) throw new InvalidOperationException("Action failed to start");
                Started.Add(seconds == 2 ? "right" : seconds == 0.25 ? "left-one" : seconds == 0.75 ? "left-two" : seconds == 3 ? "after" : "fail");
                var action = new ProbeAction((float)seconds, seconds == 0.5);
                Actions.Add(action);
                return action;
            }
        }

        private sealed class ProbeAction : ILuaAction
        {
            private float _remaining;
            private readonly bool _fail;
            public int Disposals;
            public bool IsCompleted => _remaining <= 0;
            public ProbeAction(float remaining, bool fail) { _remaining = remaining; _fail = fail; }
            public void Tick(float deltaTime)
            {
                Assert.That(Disposals, Is.Zero);
                if (_fail) throw new InvalidOperationException("Probe failure");
                _remaining -= deltaTime;
            }
            public void Dispose() => Disposals++;
        }

        [TestCase("characters.moveTo", "{'character':'player','destination':'meeting'}")]
        [TestCase("characters.walkPath", "{'character':'player','path':[{'x':168,'y':104}]}")]
        public void WalkingDefaultsToImmediateAccelerationAndPreservesExplicitOptOut(string action, string json)
        {
            var arguments = JObject.Parse(json);
            var sequence = new JArray(Step("walk", action, arguments));
            Assert.That(CutsceneSequenceCompiler.Compile(sequence, "walking"), Does.EndWith(", true, false);\n"));
            arguments["immediateAcceleration"] = false;
            Assert.That(CutsceneSequenceCompiler.Compile(sequence, "walking"), Does.EndWith(", false, false);\n"));
            arguments["immediateAcceleration"] = "false";
            Assert.That(() => CutsceneSequenceCompiler.Compile(sequence, "walking"), Throws.TypeOf<FormatException>());
        }

        [TestCase("true", "if")]
        [TestCase("false", "else")]
        public void ConditionalPathsExecuteOnlyTheSelectedActionsAndRejoin(string condition, string expected)
        {
            var branch = Branch(condition,
                new JArray(Step("if-step", "dialogue.play", new JObject { ["dialogue"] = "if" })),
                new JArray(Step("else-step", "dialogue.play", new JObject { ["dialogue"] = "else" })));
            var compiled = CutsceneSequenceCompiler.Compile(new JArray(branch,
                Step("continue", "dialogue.play", new JObject { ["dialogue"] = "continue" })), "fixture:branch", out var steps);
            var capture = new CaptureDialogue();
            var bindings = Game.BindSequence(steps, "cutscene", (typeof(CaptureDialogue), () => capture));
            using var run = VulcanusLuaEngine.StartSession(bindings, compiled, "fixture:branch");
            run.Tick(0);
            Assert.That(capture.References, Is.EqualTo(new[] { expected, "continue" }));
            Assert.That(run.CurrentStepId, Is.EqualTo("continue"));
            Assert.That(run.ActionsStarted, Is.EqualTo(2));
            Assert.That(run.IsRunning, Is.False);
        }

        [Test]
        public void EmptyConditionalPathsAndAwaitingInsideAPathAreSupported()
        {
            var capture = new CaptureDialogue();
            var compiled = CutsceneSequenceCompiler.Compile(new JArray(Branch("true",
                new JArray(Step("wait", "cutscene.wait", new JObject { ["seconds"] = 0.5 })), new JArray()),
                Step("continue", "dialogue.play", new JObject { ["dialogue"] = "continue" })), "fixture:await");
            using var run = VulcanusLuaEngine.StartSession(Game.Bind(new CutsceneLuaApi(), capture), compiled, "fixture:await");
            run.Tick(0);
            Assert.That(run.CurrentStepId, Is.EqualTo("wait"));
            Assert.That(capture.References, Is.Empty);
            run.Tick(1);
            Assert.That(capture.References, Is.EqualTo(new[] { "continue" }));
            var empty = CutsceneSequenceCompiler.Compile(new JArray(Branch("false", new JArray(), new JArray())), "fixture:empty");
            using var emptyRun = VulcanusLuaEngine.StartSession(Game.Bind(capture), empty, "fixture:empty");
            emptyRun.Tick(0);
            Assert.That(emptyRun.IsRunning, Is.False);
        }

        [Test]
        public void ConditionsCannotCallWritableBindingsAndFailuresKeepTheBranchIdentity()
        {
            var compiled = CutsceneSequenceCompiler.Compile(new JArray(Branch("GameState.Story.Set('bad', true)", new JArray(), new JArray())), "fixture:readonly");
            using var run = VulcanusLuaEngine.StartSession(Game.Bind(new CaptureDialogue()), compiled, "fixture:readonly");
            Assert.That(() => run.Tick(0), Throws.Exception);
            Assert.That(run.CurrentStepId, Is.EqualTo("branch"));
        }

        [Test]
        public void BranchCompilerRejectsBadSyntaxDuplicateIdsNestedBranchesAndOtherPhases()
        {
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(Branch("if", new JArray(), new JArray())), "fixture"), Throws.TypeOf<FormatException>());
            var duplicate = Step("same", "cutscene.wait", new JObject { ["seconds"] = 0 });
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(Branch("true", new JArray(duplicate), new JArray(duplicate.DeepClone()))), "fixture"), Throws.TypeOf<FormatException>().With.Message.Contains("Duplicate step ID"));
            var nested = Branch("true", new JArray(Branch("true", new JArray(), new JArray())), new JArray());
            nested["then"][0]["id"] = "nested";
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(nested), "fixture"), Throws.TypeOf<FormatException>().With.Message.Contains("top level"));
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(Branch("true", new JArray(), new JArray())), "fixture", out _, "completion"), Throws.TypeOf<FormatException>().With.Message.Contains("top level"));
        }

        private static JObject Branch(string condition, JArray ifPath, JArray elsePath) => new()
        {
            ["id"] = "branch", ["action"] = "control.if", ["arguments"] = new JObject { ["condition"] = condition },
            ["then"] = ifPath, ["else"] = elsePath
        };
        [TestCase("characters.place", "setup", "{'character':'player','position':{'x':152,'y':88}}")]
        [TestCase("characters.walkPath", "sequence", "{'character':'player','path':[{'x':168,'y':104},{'x':216,'y':168}]}")]
        [TestCase("cutscene.wait", "sequence", "{'seconds':0.2}")]
        [TestCase("characters.playAnimation", "sequence", "{'character':'player','animation':'base:pass-out'}")]
        public void CompiledArgumentKindsSurviveUnitySerialization(string action, string phase, string argumentsJson)
        {
            var authored = JObject.Parse(argumentsJson);
            CutsceneSequenceCompiler.Compile(new JArray(Step("beat", action, authored)), "fixture:serialization",
                out var steps, phase);
            var restored = JsonUtility.FromJson<CutsceneStep>(JsonUtility.ToJson(steps[0]));
            foreach (var argument in restored.Arguments)
            {
                var expected = authored[argument.Name];
                if (expected is JArray points)
                {
                    Assert.That(argument.Path.Points.Count, Is.EqualTo(points.Count));
                    for (var index = 0; index < points.Count; index++)
                    {
                        Assert.That(argument.Path.Points[index].X, Is.EqualTo(points[index]["x"].Value<double>()));
                        Assert.That(argument.Path.Points[index].Y, Is.EqualTo(points[index]["y"].Value<double>()));
                    }
                    Assert.That(() => argument.Value, Throws.TypeOf<InvalidOperationException>());
                    Assert.That(() => argument.Position, Throws.TypeOf<InvalidOperationException>());
                }
                else if (expected is JObject position)
                {
                    Assert.That(argument.Position.X, Is.EqualTo(position["x"].Value<double>()));
                    Assert.That(argument.Position.Y, Is.EqualTo(position["y"].Value<double>()));
                    Assert.That(() => argument.Value, Throws.TypeOf<InvalidOperationException>());
                    Assert.That(() => argument.Path, Throws.TypeOf<InvalidOperationException>());
                }
                else
                {
                    Assert.That(argument.Value, Is.EqualTo(steps[0].Arguments.Single(value => value.Name == argument.Name).Value));
                    Assert.That(() => argument.Position, Throws.TypeOf<InvalidOperationException>());
                    Assert.That(() => argument.Path, Throws.TypeOf<InvalidOperationException>());
                }
            }
        }

        [Test]
        public void CompilesOneLuaLinePerStepInOrder()
        {
            var sequence = new JArray(
                Step("approach", "characters.moveTo", new JObject { ["destination"] = "meeting", ["character"] = "npc-placement" }),
                Step("greet", "characters.face", new JObject { ["target"] = "player", ["character"] = "npc-placement" }),
                Step("talk", "dialogue.play", new JObject { ["dialogue"] = "base:greeting" }));
            var compiled = CutsceneSequenceCompiler.Compile(sequence, "fixture:intro", out var steps);
            Assert.That(compiled, Is.EqualTo("Characters.MoveTo(\"npc-placement\", \"meeting\", true, false);\nCharacters.Face(\"npc-placement\", \"player\");\nDialogue.Play(\"base:greeting\");\n"));
            Assert.That(CutsceneSequenceCompiler.Compile(sequence, "fixture:intro"), Is.EqualTo(compiled));
            Assert.That(steps.Select(step => step.Id), Is.EqualTo(new[] { "approach", "greet", "talk" }));
            Assert.That(steps[0].Arguments.Select(argument => argument.Name), Is.EqualTo(new[] { "character", "destination", "immediateAcceleration", "ignoreCollisions" }));
            Assert.That(steps[0].Arguments.Select(argument => argument.Value), Is.EqualTo(new[] { "npc-placement", "meeting", "true", "false" }));
        }

        [Test]
        public void EncodesReferencesAsLuaStringsWithoutChangingTheirContents()
        {
            var reference = "quote\" slash\\ newline\n\r\t\0" + "123\u001f\u007f ü😀 ]]; error('injected') --";
            var compiled = CutsceneSequenceCompiler.Compile(new JArray(
                Step("talk", "dialogue.play", new JObject { ["dialogue"] = reference })), "fixture:encoding");
            Assert.That(compiled.Count(character => character == '\n'), Is.EqualTo(1));
            var capture = new CaptureDialogue();
            using var run = VulcanusLuaEngine.StartSession(Game.Bind(capture), compiled, "fixture:encoding");
            run.Tick(0);
            Assert.That(run.IsRunning, Is.False);
            Assert.That(capture.Reference, Is.EqualTo(reference));
        }

        [TestCase("{ 'id':'talk', 'action':'unknown', 'arguments':{} }", "Unsupported cutscene action")]
        [TestCase("{ 'id':'talk', 'action':'GameState.Story.Set', 'arguments':{} }", "Unsupported cutscene action")]
        [TestCase("{ 'id':'talk', 'action':'dialogue.play', 'arguments':{} }", "'dialogue' requires")]
        [TestCase("{ 'id':'talk', 'action':'dialogue.play', 'arguments':{'dialogue':42} }", "'dialogue' requires")]
        [TestCase("{ 'id':'talk', 'action':'dialogue.play', 'arguments':{'dialogue':''} }", "'dialogue' requires")]
        [TestCase("{ 'id':'talk', 'action':'dialogue.play', 'arguments':{'dialogue':'hello','typo':'value'} }", "Unknown field 'typo'")]
        [TestCase("{ 'id':'talk', 'action':'dialogue.play', 'arguments':{'dialogue':'hello'}, 'lua':'error()' }", "Unknown field 'lua'")]
        public void RejectsInvalidStepsWithSourceAndStepIdentity(string step, string message)
        {
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(JObject.Parse(step)), "intro.json"),
                Throws.TypeOf<FormatException>().With.Message.Contains("intro.json: sequence[0] (talk)").And.Message.Contains(message));
        }

        [Test]
        public void RequiresAuthoredStepIdsAndANonEmptySequence()
        {
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(), "fixture"), Throws.TypeOf<FormatException>());
            var step = Step("talk", "dialogue.play", new JObject { ["dialogue"] = "hello" });
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(step, step.DeepClone()), "fixture"),
                Throws.TypeOf<FormatException>().With.Message.Contains("Duplicate step ID"));
            step["id"] = " ";
            Assert.That(() => CutsceneSequenceCompiler.Compile(new JArray(step), "fixture"),
                Throws.TypeOf<FormatException>().With.Message.Contains("'id' requires"));
        }

        private static JObject Step(string id, string action, JObject arguments) =>
            new() { ["id"] = id, ["action"] = action, ["arguments"] = arguments };

        [LuaModule("Dialogue")]
        private sealed class CaptureDialogue
        {
            public string Reference;
            public readonly List<string> References = new();
            [LuaAction("dialogue.play", "Capture", "Test", "Observe the encoded reference", "cutscene", Phases = new[] { "sequence" })]
            public void Play(string dialogue) { Reference = dialogue; References.Add(dialogue); }
        }
    }
}
