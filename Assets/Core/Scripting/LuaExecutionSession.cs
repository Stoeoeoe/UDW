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
        private Track _executing;
        public bool IsRunning => _root.IsRunning;
        public string Source { get; }
        public int ActionsStarted { get; private set; }
        public string CurrentStepId => _root.CurrentStepId;

        internal LuaExecutionSession(LuaBindingRegistry bindings, string chunk, string source, string context, string phase)
        {
            if (string.IsNullOrWhiteSpace(chunk)) throw new ArgumentException("Lua source is required.", nameof(chunk));
            if (string.IsNullOrWhiteSpace(source)) throw new ArgumentException("Source identity is required.", nameof(source));
            Source = source;
            var script = new Script(CoreModules.Preset_HardSandbox);
            // Conditions run in the same read-only, instruction-budgeted API used by dialogue.
            // A separate environment prevents expressions from calling actions or writable bindings.
            VulcanusLuaEngine conditions = null;
            script.Globals.Set("__cutsceneCondition", DynValue.NewCallback((_, args) =>
                DynValue.NewBoolean((conditions ??= new VulcanusLuaEngine()).EvaluateCondition(args[0].String))));
            script.Globals.Set("__cutsceneStep", DynValue.NewCallback((_, args) =>
            {
                _executing.CurrentStepId = args[0].String;
                return DynValue.Nil;
            }));
            // Give this script only the actions allowed in its context, e.g. "cutscene".
            bindings.BindActions(script, context, phase, Await, () => ActionsStarted++);
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
                        Pending = null;
                        completed.Dispose();
                        _slices = 0;
                    }
                    var previous = _owner._executing;
                    _owner._executing = this;
                    try { _routine.Resume(); }
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
                catch (Exception error)
                {
                    throw new InvalidOperationException($"{_description}, step '{CurrentStepId}': {error.Message}", error);
                }
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
            public ParallelAction(Track[] tracks) => _tracks = tracks;
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
