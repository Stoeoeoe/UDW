using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;

namespace Core.Scripting.Editor
{
    public sealed class CutsceneSequenceCompilerTests
    {
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
            Assert.That(compiled, Is.EqualTo("Characters.MoveTo(\"npc-placement\", \"meeting\");\nCharacters.Face(\"npc-placement\", \"player\");\nDialogue.Play(\"base:greeting\");\n"));
            Assert.That(CutsceneSequenceCompiler.Compile(sequence, "fixture:intro"), Is.EqualTo(compiled));
            Assert.That(steps.Select(step => step.Id), Is.EqualTo(new[] { "approach", "greet", "talk" }));
            Assert.That(steps[0].Arguments.Select(argument => argument.Name), Is.EqualTo(new[] { "character", "destination" }));
            Assert.That(steps[0].Arguments.Select(argument => argument.Value), Is.EqualTo(new[] { "npc-placement", "meeting" }));
        }

        [Test]
        public void EncodesReferencesAsLuaStringsWithoutChangingTheirContents()
        {
            var reference = "quote\" slash\\ newline\n\r\t\0" + "123\u001f\u007f ü😀 ]]; error('injected') --";
            var compiled = CutsceneSequenceCompiler.Compile(new JArray(
                Step("talk", "dialogue.play", new JObject { ["dialogue"] = reference })), "fixture:encoding");
            Assert.That(compiled.Count(character => character == '\n'), Is.EqualTo(1));
            var capture = new CaptureDialogue();
            using var run = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(capture), compiled, "fixture:encoding");
            run.Tick(0);
            Assert.That(run.IsRunning, Is.False);
            Assert.That(capture.Reference, Is.EqualTo(reference));
        }

        [TestCase("{ 'id':'talk', 'action':'unknown', 'arguments':{} }", "Unsupported cutscene action")]
        [TestCase("{ 'id':'talk', 'action':'GameState.Story.SetFlag', 'arguments':{} }", "Unsupported cutscene action")]
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
            [LuaAction("dialogue.play", "Capture", "Test", "Observe the encoded reference", "cutscene", Phases = new[] { "sequence" })]
            public void Play(string dialogue) => Reference = dialogue;
        }
    }
}
