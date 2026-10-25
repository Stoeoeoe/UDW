using System;
using MoonSharp.Interpreter;

namespace Core.Scripting
{
    /// <summary>A gameplay action that takes time, such as walking. Dispose stops it and cleans up its resources.</summary>
    /// <remarks>
    /// LuaExecutionSession owns a returned action. It supplies finite, nonnegative frame deltas,
    /// ticks before checking completion, and disposes the action once on success, cancellation or error.
    /// It never ticks a disposed action. Tick must throw on interruption/failure; IsCompleted means success.
    /// Actions own their operation's resources; CutsceneRunner owns the surrounding actor control claims.
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
        private readonly Coroutine _routine;
        private ILuaAction _pending;
        private int _slices;
        public bool IsRunning { get; private set; } = true;
        public string Source { get; }
        public int ActionsStarted { get; private set; }

        internal LuaExecutionSession(LuaBindingRegistry bindings, string chunk, string source, string context, string phase)
        {
            if (string.IsNullOrWhiteSpace(chunk)) throw new ArgumentException("Lua source is required.", nameof(chunk));
            if (string.IsNullOrWhiteSpace(source)) throw new ArgumentException("Source identity is required.", nameof(source));
            Source = source;
            var script = new Script(CoreModules.Preset_HardSandbox);
            // Give this script only the actions allowed in its context, e.g. "cutscene".
            bindings.BindActions(script, context, phase, Await, () => ActionsStarted++);
            _routine = script.CreateCoroutine(script.LoadString(chunk, null, source)).Coroutine;
            _routine.AutoYieldCounter = InstructionsPerFrame;
        }

        private DynValue Await(ILuaAction action)
        {
            if (action == null) throw new InvalidOperationException("An awaitable binding returned no action.");
            // Remember the action and pause Lua until it finishes.
            _pending = action;
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
                // Keep Lua paused while the current action is still running.
                if (_pending != null)
                {
                    _pending.Tick(deltaTime);
                    if (!_pending.IsCompleted) return;
                    var completed = _pending;
                    _pending = null;
                    completed.Dispose();
                    _slices = 0;
                }
                // Run a little Lua this frame so a long script cannot freeze the game.
                _routine.Resume();
                if (_routine.State == CoroutineState.Dead) { Dispose(); return; }
                // Lua may pause for an action or because it used up this frame's CPU budget.
                if (_pending == null && _routine.State != CoroutineState.ForceSuspended)
                    throw new InvalidOperationException("Unexpected Lua suspension.");
                // Stop scripts that keep using their full CPU budget, such as an endless loop.
                if (_pending == null && ++_slices >= MaxInstructionSlices)
                    throw new InvalidOperationException("Lua script exceeded its instruction budget.");
            }
            catch (Exception exception)
            {
                Dispose();
                var message = exception is InterpreterException lua ? lua.DecoratedMessage : exception.Message;
                throw new InvalidOperationException($"{Source}: {message}", exception);
            }
        }

        public void Cancel() => Dispose();

        public void Dispose()
        {
            IsRunning = false;
            var pending = _pending;
            _pending = null;
            pending?.Dispose(); // There may be no action to clean up.
        }
    }
}
