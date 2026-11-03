using System;
using System.Linq;
using MoonSharp.Interpreter;

namespace Core.Scripting
{
    /// <summary>A gameplay action that takes time, such as walking. Dispose stops it and cleans up its resources.</summary>
    /// <remarks>
    /// LuaExecutionSession owns a returned action. It supplies finite, nonnegative frame deltas,
    /// ticks before checking completion, and disposes the action once on success, cancellation or error.
    /// It never ticks a disposed action. Tick must throw on interruption/failure; IsCompleted means success.
    /// Actions own their operation's resources; CutsceneRunner owns the surrounding character control claims.
    /// </remarks>
    public interface ILuaAction : IDisposable
    {
        bool IsCompleted { get; }
        void Tick(float deltaTime);
    }

    /// <summary>Runs a Lua script over several game frames.</summary>
    /// <remarks>
    /// Call Tick once per frame. When Lua starts an action such as walking, the script
    /// pauses while the action runs. It continues when the action succeeds.
    /// Cancelling the session or an error stops the run and cleans up the action.
    /// </remarks>
    public sealed class LuaExecutionSession : IDisposable
    {
        private const int InstructionsPerFrame = 1000;
        private const int MaxInstructionSlices = 128;
        private readonly Track _root;
        private readonly Script _script;
        private Track _executing;
        public bool IsRunning => _root.IsRunning;
        public string Source { get; }
        public int ActionsStarted { get; private set; }
        public string CurrentStepId => _root.CurrentStepId;

        internal LuaExecutionSession(LuaBindingRegistry bindings, string chunk, string source, string context, string phase, CutsceneVariables variables = null)
        {
            if (string.IsNullOrWhiteSpace(chunk)) throw new ArgumentException("Lua source is required.", nameof(chunk));
            if (string.IsNullOrWhiteSpace(source)) throw new ArgumentException("Source identity is required.", nameof(source));
            Source = source;
            variables ??= new CutsceneVariables(Array.Empty<CutsceneVariableDefinition>());
            var script = new Script(CoreModules.Preset_HardSandbox);
            _script = script;
            // Conditions run in the same read-only, instruction-budgeted API used by dialogue.
            // A separate environment prevents expressions from calling actions or writable bindings.
            VulcanusLuaEngine conditions = null;
            VulcanusLuaEngine CreateEngine() => (bindings.Runtime
                ?? throw new InvalidOperationException("Lua expressions require the session's bound LuaRuntime.")).CreateEngine(variables);
            script.Globals.Set("__cutsceneCondition", DynValue.NewCallback((_, args) =>
                DynValue.NewBoolean((conditions ??= CreateEngine()).EvaluateCondition(args[0].String))));
            script.Globals.Set("__cutsceneValue", DynValue.NewCallback((_, args) =>
            {
                var value = (conditions ??= CreateEngine()).EvaluateValue(args[0].String);
                LuaValues.RequireType(value, args[1].String, args[2].CastToBool());
                return LuaValues.Copy(value, script);
            }));
            script.Globals.Set("__cutsceneLua", DynValue.NewCallback((_, args) =>
            {
                var value = CreateEngine().ExecuteValues(args[0].String);
                var count = value.Type == DataType.Void ? 0 : value.Type == DataType.Tuple ? value.Tuple.Length : 1;
                if (count != (int)args[1].Number) throw new InvalidOperationException("Lua node returned a different number of values than its declared outputs.");
                return value.Type == DataType.Tuple
                    ? DynValue.NewTuple(value.Tuple.Select(v => LuaValues.Copy(v, script)).ToArray())
                    : LuaValues.Copy(value, script);
            }));
            script.Globals.Set("__cutscenePure", DynValue.NewCallback((_, args) =>
            {
                var arguments = Enumerable.Range(1, (int)args[2].Number).Select(i => args[1].Table.Get(i)).ToArray();
                var value = (conditions ??= CreateEngine()).CallReadOnly(args[0].String, arguments);
                return value.Type == DataType.Tuple ? DynValue.NewTuple(value.Tuple.Select(v => LuaValues.Copy(v, script)).ToArray()) : LuaValues.Copy(value, script);
            }));
            script.Globals.Set("__cutsceneCheck", DynValue.NewCallback((_, args) =>
            {
                LuaValues.RequireType(args[0], args[1].String, args[2].CastToBool());
                return args[0];
            }));
            script.Globals.Set("__cutsceneStep", DynValue.NewCallback((_, args) =>
            {
                _executing.CurrentStepId = args[0].String;
                return DynValue.Nil;
            }));
            // Give this script only the actions allowed in its context, e.g. "cutscene".
            bindings.BindActions(script, context, phase, Await, () => ActionsStarted++, (method, values) =>
            {
                if (method.Api is CutsceneLuaApi cutscene) cutscene.Variables = variables;
                _executing.Group?.Claim(_executing, method, values);
                if (!_executing.DynamicNext && !bindings.ValidateAllActions) return;
                _executing.DynamicNext = false;
                if (method.Validator != null) LuaBindingRegistry.InvokeReflected(method.Validator, method.Api, values);
                bindings.DynamicActionBound?.Invoke(method, values);
            });
            variables.Bind(script, true);
            script.Globals.Set("__cutsceneDynamic", DynValue.NewCallback((_, _) => { _executing.DynamicNext = true; return DynValue.Nil; }));
            script.Globals.Set("__cutsceneAssign", DynValue.NewCallback((_, args) =>
            {
                var names = Enumerable.Range(1, args[0].Table.Length).Select(index =>
                {
                    var destination = args[0].Table.Get(index);
                    if (destination.Type == DataType.String) return destination.String;
                    if (destination.Type == DataType.Boolean && !destination.Boolean) return null;
                    throw new InvalidOperationException("A result destination must be a variable name or false to discard it.");
                }).ToArray();
                variables.Assign(names, Enumerable.Range(1, args.Count - 1).Select(index => args[index]).ToArray());
                return DynValue.Nil;
            }));
            if (context == "cutscene" && phase == "sequence")
                script.Globals.Set("__cutsceneParallel", DynValue.NewCallback((_, args) =>
                {
                    var functions = args[0].Table.Values.ToArray();
                    if (functions.Length < 2 || functions.Any(function => function.Type != DataType.Function))
                        throw new InvalidOperationException("Parallel playback requires at least two track functions.");
                    // Indexed access preserves authored order; table iteration order is not a scheduling contract.
                    var tracks = Enumerable.Range(1, args[0].Table.Length)
                        .Select(index => new Track(this, script.CreateCoroutine(args[0].Table.Get(index)).Coroutine,
                            $"parallel '{_executing.CurrentStepId}', track {index}")).ToArray();
                    return Await(new ParallelAction(tracks));
                }));
            _root = new Track(this, script.CreateCoroutine(script.LoadString(chunk, null, source)).Coroutine, source);
        }

        private DynValue Await(ILuaAction action)
        {
            if (action == null) throw new InvalidOperationException("An awaitable binding returned no action.");
            // Remember the action and pause Lua until it finishes.
            _executing.Pending = action;
            return DynValue.NewYieldReq(Array.Empty<DynValue>());
        }

        /// <summary>Runs one frame. deltaTime is the number of seconds since the previous frame.</summary>
        public void Tick(float deltaTime)
        {
            if (float.IsNaN(deltaTime) || float.IsInfinity(deltaTime) || deltaTime < 0)
                throw new ArgumentOutOfRangeException(nameof(deltaTime));
            if (!IsRunning) return;
            try
            {
                _root.Tick(deltaTime);
            }
            catch (Exception exception)
            {
                Dispose();
                var message = exception is InterpreterException lua ? lua.DecoratedMessage : exception.Message;
                throw new InvalidOperationException($"{Source}: {message}", exception);
            }
        }

        public void Cancel() => Dispose();

        public void Dispose() => _root.Dispose();

        // Every track retains sequential await semantics and its own instruction budget.
        private sealed class Track : ILuaAction
        {
            private readonly LuaExecutionSession _owner;
            private readonly Coroutine _routine;
            private readonly string _description;
            private int _slices;
            public ILuaAction Pending;
            public string CurrentStepId;
            public bool DynamicNext;
            public ParallelAction Group;
            public bool IsRunning { get; private set; } = true;
            public bool IsCompleted => !IsRunning;

            public Track(LuaExecutionSession owner, Coroutine routine, string description)
            {
                _owner = owner;
                _routine = routine;
                _description = description;
                _routine.AutoYieldCounter = InstructionsPerFrame;
            }

            public void Tick(float deltaTime)
            {
                if (!IsRunning) return;
                try
                {
                    if (Pending != null)
                    {
                        Pending.Tick(deltaTime);
                        if (!Pending.IsCompleted) return;
                        var completed = Pending;
                        var outputs = completed is ILuaResultAction result
                            ? result.Results.Values.Select(value => LuaValues.Copy(value, _owner._script)).ToArray() : Array.Empty<DynValue>();
                        Pending = null;
                        completed.Dispose();
                        _slices = 0;
                        Resume(outputs);
                        return;
                    }
                    Resume(Array.Empty<DynValue>());
                }
                catch (Exception error)
                {
                    throw new InvalidOperationException($"{_description}, step '{CurrentStepId}': {error.Message}", error);
                }
            }
            private void Resume(DynValue[] outputs)
            {
                var previous = _owner._executing;
                _owner._executing = this;
                try { _routine.Resume(outputs); }
                finally { _owner._executing = previous; }
                if (_routine.State == CoroutineState.Dead) { Dispose(); return; }
                if (Pending == null && _routine.State != CoroutineState.ForceSuspended)
                    throw new InvalidOperationException("Unexpected Lua suspension.");
                if (Pending == null && ++_slices >= MaxInstructionSlices)
                    throw new InvalidOperationException("Lua script exceeded its instruction budget.");
                // Start all children in this frame, after the parent's Resume has returned.
                // They receive no time from before their actions started.
                if (Pending is ParallelAction parallel) parallel.Tick(0);
            }

            public void Dispose()
            {
                IsRunning = false;
                var pending = Pending;
                Pending = null;
                pending?.Dispose(); // Immediate-only tracks may have no pending action.
            }
        }

        private sealed class ParallelAction : ILuaAction
        {
            private readonly Track[] _tracks;
            private readonly System.Collections.Generic.Dictionary<string, Track> _claims = new(StringComparer.Ordinal);
            public ParallelAction(Track[] tracks) { _tracks = tracks; foreach (var track in tracks) track.Group = this; }
            public void Claim(Track track, LuaBindingRegistry.Method method, object[] values)
            {
                var resources = method.Parameters.Select((parameter, index) => (parameter, value: values[index]))
                    .Where(pair => pair.parameter.Name == "character" && pair.parameter.GetCustomAttributes(typeof(LuaReferenceAttribute), false)
                        .Cast<LuaReferenceAttribute>().Any(attribute => attribute.Type == "characterRef"))
                    .Select(pair => "character:" + pair.value)
                    .Concat(method.Action.Id == "dialogue.play" ? new[] { "dialogue" } : Array.Empty<string>())
                    .Concat(method.Action.Id.StartsWith("story.", StringComparison.Ordinal)
                        ? method.Parameters.Select((parameter, index) => (parameter, index)).Where(pair => pair.parameter.Name == "key")
                            .Select(pair => "story:" + values[pair.index]) : Array.Empty<string>());
                foreach (var resource in resources)
                {
                    if (_claims.TryGetValue(resource, out var owner) && owner != track)
                        throw new InvalidOperationException($"Parallel tracks conflict on '{resource}'.");
                    _claims[resource] = track;
                }
            }
            public bool IsCompleted => _tracks.All(track => track.IsCompleted);
            public void Tick(float deltaTime)
            {
                foreach (var track in _tracks) track.Tick(deltaTime);
            }
            public void Dispose()
            {
                // Cleanup every sibling even if one action's cleanup fails.
                Exception failure = null;
                foreach (var track in _tracks)
                    try { track.Dispose(); }
                    catch (Exception error) { failure ??= error; }
                if (failure != null) throw failure;
            }
        }
    }
}
