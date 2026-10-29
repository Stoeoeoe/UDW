using System;
using System.Linq;
using MoonSharp.Interpreter;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Core.Scripting.Editor
{
    public sealed class CutsceneVariableTests
    {
        private static CutsceneVariableDefinition[] Definitions() => new[] {
            new CutsceneVariableDefinition("delay", "number", "0"),
            new CutsceneVariableDefinition("success", "boolean", "false"),
            new CutsceneVariableDefinition("amount", "number", "1") };

        [Test]
        public void SetVariableLuaNodesAndLinkedArgumentsUseTheSamePerRunState()
        {
            var source = JArray.Parse("[{id:'set',action:'cutscene.setVariable',arguments:{name:'delay',value:0.25}}," +
                "{id:'lua',action:'cutscene.runLua',arguments:{code:'Cutscene.Variables.delay = Cutscene.Variables.delay + 0.25'}}," +
                "{id:'wait',action:'cutscene.wait',arguments:{},argumentVariables:{seconds:'delay'}}]");
            var compiled = CutsceneSequenceCompiler.Compile(source, "variables", out var steps, variables: Definitions());
            var bindings = CutsceneBindings.BindSequence(steps, "cutscene", (typeof(CutsceneLuaApi), () => new CutsceneLuaApi()));
            var variables = new CutsceneVariables(Definitions());
            using var run = VulcanusLuaEngine.StartSession(bindings, compiled, "variables", variables: variables);
            run.Tick(0);
            Assert.That(variables.Get("delay", new Script()).Number, Is.EqualTo(0.5));
            run.Tick(0.25f);
            Assert.That(run.IsRunning, Is.True);
            run.Tick(0.25f);
            Assert.That(run.IsRunning, Is.False);
            Assert.That(new CutsceneVariables(Definitions()).Get("delay", new Script()).Number, Is.Zero);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void MultipleImmediateAndAwaitedResultsAssignTogether(bool awaited)
        {
            var api = new ResultApi();
            var variables = new CutsceneVariables(Definitions());
            var lua = "local success, amount = Results." + (awaited ? "Later" : "Now") + "(); " +
                "__cutsceneAssign({'success','amount'}, success, amount)";
            using var run = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api), lua, "outputs", variables: variables);
            run.Tick(0);
            if (awaited)
            {
                Assert.That(variables.Get("success", new Script()).Boolean, Is.False);
                run.Tick(0.25f);
                Assert.That(api.Action.Disposals, Is.EqualTo(1));
            }
            Assert.That(run.IsRunning, Is.False);
            Assert.That(variables.Get("success", new Script()).Boolean, Is.True);
            Assert.That(variables.Get("amount", new Script()).Number, Is.EqualTo(7));
            var outputs = new LuaBindingRegistry(api).Describe().modules.Single().methods.Single(method => method.name == "Later").outputs;
            Assert.That(outputs.Select(output => output.type), Is.EqualTo(new[] { "boolean", "number" }));
        }

        [Test]
        public void InvalidAssignmentsDoNotPartiallyWriteAndConditionsCannotMutate()
        {
            var variables = new CutsceneVariables(Definitions());
            Assert.That(() => variables.Assign(new[] { "amount", "success" }, new[] { DynValue.NewNumber(8), DynValue.NewString("wrong") }), Throws.InvalidOperationException);
            Assert.That(variables.Get("amount", new Script()).Number, Is.EqualTo(1));
            using var replacement = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(), "Cutscene.Variables = {}", "bad-namespace", variables: variables);
            Assert.That(() => replacement.Tick(0), Throws.InvalidOperationException.With.Message.Contains("namespace"));
            var text = new CutsceneVariables(new[] { new CutsceneVariableDefinition("timestamp", "string", "\"2026-10-28T20:00:00Z\"") });
            Assert.That(text.Get("timestamp", new Script()).String, Is.EqualTo("2026-10-28T20:00:00Z"));
            Assert.That(() => variables.Set("missing", DynValue.NewNumber(1)), Throws.InvalidOperationException);
            var conditions = new VulcanusLuaEngine(variables);
            Assert.That(conditions.EvaluateCondition("Cutscene.Variables.amount == 1"), Is.True);
            Assert.That(() => conditions.EvaluateCondition("(function() Cutscene.Variables.amount = 9; return true end)()"), Throws.Exception);
            Assert.That(variables.Get("amount", new Script()).Number, Is.EqualTo(1));
        }

        [Test]
        public void CancellingAnAwaitedResultLeavesVariablesAtTheirPreviousValues()
        {
            var api = new ResultApi();
            var variables = new CutsceneVariables(Definitions());
            using var run = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api),
                "local success, amount = Results.Later(); __cutsceneAssign({'success','amount'}, success, amount)", "cancelled-results", variables: variables);
            run.Tick(0);
            run.Cancel();
            run.Tick(1);
            Assert.That(api.Action.Disposals, Is.EqualTo(1));
            Assert.That(variables.Get("success", new Script()).Boolean, Is.False);
            Assert.That(variables.Get("amount", new Script()).Number, Is.EqualTo(1));
        }

        [Test]
        public void LinkedInputValidatorsRunBeforeTheActionStarts()
        {
            var variables = new CutsceneVariables(new[] { new CutsceneVariableDefinition("delay", "number", "-1") });
            var source = JArray.Parse("[{id:'wait',action:'cutscene.wait',arguments:{},argumentVariables:{seconds:'delay'}}]");
            var lua = CutsceneSequenceCompiler.Compile(source, "dynamic-validation", out _, variables: new[] { new CutsceneVariableDefinition("delay", "number", "-1") });
            using var run = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(new CutsceneLuaApi()), lua, "dynamic-validation", variables: variables);
            Assert.That(() => run.Tick(0), Throws.InvalidOperationException.With.Message.Contains("nonnegative"));
            Assert.That(run.IsRunning, Is.False);
        }

        [Test]
        public void CompilerValidatesVariableTypesResultsAndParallelDependencies()
        {
            var source = JArray.Parse("[{id:'wait',action:'cutscene.wait',arguments:{},argumentVariables:{seconds:'success'}}]");
            Assert.That(() => CutsceneSequenceCompiler.Compile(source, "bad-type", out _, variables: Definitions()), Throws.Exception.With.Message.Contains("does not match"));
            source = JArray.Parse("[{id:'remove',action:'story.remove',arguments:{key:'test'},resultVariables:['success']}]");
            Assert.That(CutsceneSequenceCompiler.Compile(source, "result", out _, variables: Definitions()), Does.Contain("__cutsceneAssign"));
            source[0]["resultVariables"][0] = "amount";
            Assert.That(() => CutsceneSequenceCompiler.Compile(source, "bad-result", out _, variables: Definitions()), Throws.Exception.With.Message.Contains("incompatible"));
            source = JArray.Parse("[{id:'parallel',action:'control.parallel',arguments:{},tracks:[" +
                "[{id:'set',action:'cutscene.setVariable',arguments:{name:'delay',value:1}}]," +
                "[{id:'wait',action:'cutscene.wait',arguments:{},argumentVariables:{seconds:'delay'}}]]}]");
            Assert.That(() => CutsceneSequenceCompiler.Compile(source, "race", out _, variables: Definitions()), Throws.Exception.With.Message.Contains("share a written variable"));
        }

        [LuaModule("Results")]
        private sealed class ResultApi
        {
            public ResultAction Action;
            [LuaAction("test.now", "Now", "Test", "Return two values.", "cutscene", Phases = new[] { "sequence" })]
            [LuaOutput("success", "boolean"), LuaOutput("amount", "number")]
            public LuaValues Now() => new(DynValue.True, DynValue.NewNumber(7));
            [LuaAction("test.later", "Later", "Test", "Return two values after completion.", "cutscene", Phases = new[] { "sequence" })]
            [LuaOutput("success", "boolean"), LuaOutput("amount", "number")]
            public ILuaResultAction Later() => Action = new ResultAction();
        }
        private sealed class ResultAction : ILuaResultAction
        {
            public int Disposals;
            private float _remaining = 0.25f;
            public bool IsCompleted => _remaining <= 0;
            public LuaValues Results => new(DynValue.True, DynValue.NewNumber(7));
            public void Tick(float deltaTime) => _remaining -= deltaTime;
            public void Dispose() => Disposals++;
        }
    }
}
