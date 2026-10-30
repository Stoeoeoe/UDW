using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using MoonSharp.Interpreter;
using Core.Common.Editor;
using Core.Game;

namespace Core.Scripting.Editor
{
    public sealed class CutsceneGraphCompilerTests
    {
        private static JObject Node(string id, string kind) => new() { ["id"] = id, ["kind"] = kind, ["position"] = new JObject { ["x"] = 0, ["y"] = 0 } };
        private static JObject Edge(string from, string to, string sourcePin = "next", string targetPin = "in", string kind = "execution") => new()
        { ["id"] = from + sourcePin + to + targetPin, ["source"] = from, ["sourcePin"] = sourcePin, ["target"] = to, ["targetPin"] = targetPin, ["kind"] = kind };
        private static JObject Wait(string id, double seconds)
        {
            var n = Node(id, "action"); n["step"] = new JObject { ["id"] = id, ["action"] = "cutscene.wait", ["arguments"] = new JObject { ["seconds"] = seconds } }; return n;
        }
        private static JObject Lua(string code)
        {
            var n = Node("lua", "lua"); n["expression"] = code;
            n["outputs"] = new JArray(new JObject { ["name"] = "flag", ["type"] = "boolean" }, new JObject { ["name"] = "duration", ["type"] = "number" }); return n;
        }
        private static JObject Graph(params JObject[] nodes) => new() { ["nodes"] = new JArray(new[] { Node("entry", "entry") }.Concat(nodes).Append(Node("exit", "exit"))), ["edges"] = new JArray() };
        private static string Compile(JObject graph, out CutsceneStep[] steps) => CutsceneGraphCompiler.Compile(graph, "graph-test", "sequence", new HashSet<string>(), Array.Empty<CutsceneVariableDefinition>(), out steps);

        [Test]
        public void LuaResultsFeedAwaitedInputWithoutCreatingMutableLocals()
        {
            var graph = Graph(Lua("return true, 0.5"), Wait("wait", 99));
            graph["edges"] = new JArray(Edge("entry", "lua"), Edge("lua", "wait"), Edge("wait", "exit"), Edge("lua", "wait", "duration", "seconds", "data"));
            var code = Compile(graph, out var steps);
            Assert.That(code, Does.Not.Contain("Cutscene.Variables[\"__graph_input_"));
            var api = new CutsceneLuaApi();
            var bindings = CutsceneBindings.BindSequence(steps, "cutscene", (typeof(CutsceneLuaApi), () => api));
            using var run = VulcanusLuaEngine.StartSession(bindings, code, "graph-test");
            run.Tick(0); Assert.That(run.IsRunning, Is.True);
            run.Tick(0.5f); Assert.That(run.IsRunning, Is.False);
        }

        [Test]
        public void CommentsAreRetainedAsAuthoringDataButNeverExecutedOrConnected()
        {
            var wait = Wait("wait", 0.5);
            wait["comment"] = "Let the opening shot settle.";
            var note = Node("note", "comment");
            note["comment"] = "Both actors should be visible here.\nKeep this hold.";
            var graph = Graph(wait, note);
            graph["edges"] = new JArray(Edge("entry", "wait"), Edge("wait", "exit"));
            var code = Compile(graph, out var steps);
            Assert.That(steps.Select(s => s.Id), Is.EqualTo(new[] { "wait" }));
            Assert.That(code, Does.Not.Contain("Both actors"));
            foreach (var kind in new[] { "execution", "data" })
            {
                var invalid = (JObject)graph.DeepClone();
                ((JArray)invalid["edges"]).Add(Edge("note", "wait", kind: kind));
                Assert.That(() => Compile(invalid, out _), Throws.TypeOf<FormatException>().With.Message.Contains("Comment nodes cannot have connections"));
            }
            note["comment"] = 12;
            Assert.That(() => Compile(graph, out _), Throws.TypeOf<FormatException>().With.Message.Contains("comment must be text"));
        }

        [Test]
        public void PureExpressionUsesTheReadOnlyBudgetedEnvironment()
        {
            var pure = Node("pure", "expression"); pure["expression"] = "1 / 4"; pure["outputs"] = new JArray(new JObject { ["name"] = "value", ["type"] = "number" });
            var graph = Graph(pure, Wait("wait", 99));
            graph["edges"] = new JArray(Edge("entry", "wait"), Edge("wait", "exit"), Edge("pure", "wait", "value", "seconds", "data"));
            var code = Compile(graph, out var steps);
            using var run = VulcanusLuaEngine.StartSession(CutsceneBindings.BindSequence(steps, "cutscene", (typeof(CutsceneLuaApi), () => new CutsceneLuaApi())), code, "pure-test");
            run.Tick(0); run.Tick(0.25f); Assert.That(run.IsRunning, Is.False);
            pure["expression"] = "(function() Cutscene.Variables.delay = 4; return 0 end)()";
            var definitions = new[] { new CutsceneVariableDefinition("delay", "number", "0") };
            var variables = new CutsceneVariables(definitions);
            var invalid = CutsceneGraphCompiler.Compile(graph, "read-only-test", "sequence", new HashSet<string>(), definitions, out steps);
            using var failure = VulcanusLuaEngine.StartSession(CutsceneBindings.BindSequence(steps, "cutscene", (typeof(CutsceneLuaApi), () => new CutsceneLuaApi())), invalid, "read-only-test", variables: variables);
            Assert.That(() => failure.Tick(0), Throws.InvalidOperationException.With.Message.Contains("cannot write cutscene variables"));
            Assert.That(variables.Get("delay", new Script()).Number, Is.Zero);
        }

        [Test]
        public void MissingProducerOrderAndIncompatibleTypesFailAtImport()
        {
            var graph = Graph(Lua("return true, 1"), Wait("wait", 0));
            graph["edges"] = new JArray(Edge("entry", "wait"), Edge("wait", "lua"), Edge("lua", "exit"), Edge("lua", "wait", "duration", "seconds", "data"));
            Assert.That(() => Compile(graph, out _), Throws.TypeOf<FormatException>().With.Message.Contains("before its consumer"));
            ((JObject)((JArray)graph["edges"])[3])["sourcePin"] = "flag";
            Assert.That(() => Compile(graph, out _), Throws.TypeOf<FormatException>().With.Message.Contains("incompatible"));
        }

        [Test]
        public void ReturnedCountAndTypesAreCheckedBeforeConsumersRun()
        {
            foreach (var code in new[] { "return true", "return true, 'wrong'", "return true, 1, 2" })
            {
                var graph = Graph(Lua(code), Wait("wait", 0)); graph["edges"] = new JArray(Edge("entry", "lua"), Edge("lua", "wait"), Edge("wait", "exit"));
                var compiled = Compile(graph, out var steps);
                using var run = VulcanusLuaEngine.StartSession(CutsceneBindings.BindSequence(steps, "cutscene", (typeof(CutsceneLuaApi), () => new CutsceneLuaApi())), compiled, "outputs-test");
                Assert.That(() => run.Tick(0), Throws.InvalidOperationException);
            }
        }

        [Test]
        public void ExecutionCyclesAndOrphanActionsFailCompilation()
        {
            var graph = Graph(Wait("wait", 0)); graph["edges"] = new JArray(Edge("entry", "wait"), Edge("wait", "entry"));
            Assert.That(() => Compile(graph, out _), Throws.TypeOf<FormatException>());
            graph["edges"] = new JArray(Edge("entry", "exit"));
            Assert.That(() => Compile(graph, out _), Throws.TypeOf<FormatException>().With.Message.Contains("disconnected"));
        }

        [Test]
        public void ExistingReadOnlyFunctionPinsSupplyABranchCondition()
        {
            using var fixture = new GameTestFixture("Graph read-only calls");
            fixture.AddSingleton<GameStateManager>();
            new StoryLuaApi().Set("invited", StoryValueJson.Parse("true"));
            var read = Node("read", "function"); read["method"] = "GameState.Story.Has"; read["arguments"] = new JObject { ["key"] = "invited" };
            var branch = Node("branch", "branch"); branch["pair"] = "join"; branch["arguments"] = new JObject { ["condition"] = false };
            var join = Node("join", "join"); join["pair"] = "branch";
            var graph = Graph(read, branch, join, Wait("yes", 0.25), Wait("no", 99));
            graph["edges"] = new JArray(Edge("entry", "branch"), Edge("read", "branch", "result", "condition", "data"), Edge("branch", "yes", "then"), Edge("branch", "no", "else"), Edge("yes", "join", "next", "track-0"), Edge("no", "join", "next", "track-1"), Edge("join", "exit"));
            var code = Compile(graph, out var steps);
            using var run = VulcanusLuaEngine.StartSession(CutsceneBindings.BindSequence(steps, "cutscene", (typeof(CutsceneLuaApi), () => new CutsceneLuaApi())), code, "function-graph");
            run.Tick(0); run.Tick(0.25f); Assert.That(run.IsRunning, Is.False);
        }

        [Test]
        public void ParallelJoinsBeforeStartingTheFollowingAction()
        {
            var fork = Node("fork", "parallel"); fork["pair"] = "join"; fork["tracks"] = 2;
            var join = Node("join", "join"); join["pair"] = "fork";
            var graph = Graph(fork, join, Wait("left", 0.25), Wait("right", 0.5), Wait("after", 0.25));
            graph["edges"] = new JArray(Edge("entry", "fork"), Edge("fork", "left", "track-0"), Edge("fork", "right", "track-1"), Edge("left", "join", "next", "track-0"), Edge("right", "join", "next", "track-1"), Edge("join", "after"), Edge("after", "exit"));
            var code = Compile(graph, out var steps);
            using var run = VulcanusLuaEngine.StartSession(CutsceneBindings.BindSequence(steps, "cutscene", (typeof(CutsceneLuaApi), () => new CutsceneLuaApi())), code, "parallel-graph");
            run.Tick(0); run.Tick(0.25f); Assert.That(run.CurrentStepId, Is.EqualTo("fork"));
            run.Tick(0.25f); Assert.That(run.CurrentStepId, Is.EqualTo("after"));
            run.Tick(0.25f); Assert.That(run.IsRunning, Is.False);
        }

        [Test]
        public void LuaResultsCanAlsoBeAssignedToExplicitCutsceneVariables()
        {
            var lua = Lua("return true, 0.5"); lua["resultVariables"] = new JArray(null, "duration");
            var graph = Graph(lua, Wait("wait", 0)); graph["edges"] = new JArray(Edge("entry", "lua"), Edge("lua", "wait"), Edge("wait", "exit"));
            var definitions = new[] { new CutsceneVariableDefinition("duration", "number", "0") };
            var variables = new CutsceneVariables(definitions);
            var code = CutsceneGraphCompiler.Compile(graph, "stored-graph-results", "sequence", new HashSet<string>(), definitions, out var steps);
            using var run = VulcanusLuaEngine.StartSession(CutsceneBindings.BindSequence(steps, "cutscene", (typeof(CutsceneLuaApi), () => new CutsceneLuaApi())), code, "stored-graph-results", variables: variables);
            run.Tick(0); Assert.That(variables.Get("duration", new MoonSharp.Interpreter.Script()).Number, Is.EqualTo(0.5));
        }

        [Test]
        public void LiteralMakePositionRemainsAvailableToPrePlaybackMapValidation()
        {
            var place = Node("place", "action"); place["step"] = new JObject { ["id"] = "place", ["action"] = "characters.place", ["arguments"] = new JObject { ["character"] = "player", ["position"] = new JObject { ["x"] = 0, ["y"] = 0 } } };
            var point = Node("point", "position"); point["arguments"] = new JObject { ["x"] = 16, ["y"] = 32 };
            var graph = Graph(place, point); graph["edges"] = new JArray(Edge("entry", "place"), Edge("place", "exit"), Edge("point", "place", "position", "position", "data"));
            CutsceneGraphCompiler.Compile(graph, "literal-position-graph", "setup", new HashSet<string>(), Array.Empty<CutsceneVariableDefinition>(), out var steps);
            Assert.That(steps.Single().Arguments.Single(a => a.Name == "position").IsVariable, Is.False);
            point["arguments"]["x"] = -1;
            Assert.That(() => CutsceneGraphCompiler.Compile(graph, "literal-position-graph", "setup", new HashSet<string>(), Array.Empty<CutsceneVariableDefinition>(), out _), Throws.TypeOf<FormatException>());
        }

        [Test]
        public void ParallelVariableWritesCannotRaceAnotherTracksGetter()
        {
            var fork = Node("fork", "parallel"); fork["pair"] = "join"; fork["tracks"] = 2;
            var join = Node("join", "join"); join["pair"] = "fork";
            var set = Node("set", "action"); set["step"] = new JObject { ["id"] = "set", ["action"] = "cutscene.setVariable", ["arguments"] = new JObject { ["name"] = "delay", ["value"] = 2 } };
            var read = Node("read", "variable"); read["variable"] = "delay";
            var graph = Graph(fork, join, set, read, Wait("wait", 0));
            graph["edges"] = new JArray(Edge("entry", "fork"), Edge("fork", "set", "track-0"), Edge("fork", "wait", "track-1"), Edge("set", "join", "next", "track-0"), Edge("wait", "join", "next", "track-1"), Edge("join", "exit"), Edge("read", "wait", "value", "seconds", "data"));
            Assert.That(() => CutsceneGraphCompiler.Compile(graph, "parallel-variables", "sequence", new HashSet<string>(), new[] { new CutsceneVariableDefinition("delay", "number", "1") }, out _), Throws.TypeOf<FormatException>().With.Message.Contains("conflict on cutscene variables"));
        }
    }
}
