using System;
using MoonSharp.Interpreter;

namespace Core.Scripting
{
    public enum LuaExecutionStatus { Running, Succeeded, Cancelled, Failed, TimedOut }

    /// <summary>A gameplay action that takes time, such as walking. Dispose stops it and cleans up its resources.</summary>
    public interface ILuaAction : IDisposable
    {
        LuaExecutionStatus Status { get; }
        string Error { get; }
        void Tick(float deltaTime);
    }

    /// <summary>Runs a Lua script over several game frames.</summary>
    /// <remarks>
    /// Call Tick once per frame. When Lua starts an action such as walking, the script
    /// pauses while the action runs. It continues when the action succeeds.
    /// Cancelling the session, an error, or a timeout stops the run and cleans up the action.
    /// </remarks>
    public sealed class LuaExecutionSession : IDisposable
    {
        private const int InstructionsPerFrame = 1000;
        private const int MaxInstructionSlices = 128;
        private readonly Coroutine _routine;
        private readonly float _timeout;
        private ILuaAction _pending;
        private int _slices;
        private float _elapsed;
        public LuaExecutionStatus Status { get; private set; } = LuaExecutionStatus.Running;
        public string Error { get; private set; }
        public string Source { get; }
        public int ActionsStarted { get; private set; }

        internal LuaExecutionSession(LuaBindingRegistry bindings, string chunk, string source, string context,
            float timeout)
        {
            if (string.IsNullOrWhiteSpace(chunk)) throw new ArgumentException("Lua source is required.", nameof(chunk));
            if (string.IsNullOrWhiteSpace(source)) throw new ArgumentException("Source identity is required.", nameof(source));
            if (float.IsNaN(timeout) || float.IsInfinity(timeout) || timeout <= 0)
                throw new ArgumentOutOfRangeException(nameof(timeout));
            Source = source;
            _timeout = timeout;
            var script = new Script(CoreModules.Preset_HardSandbox);
            // Give this script only the actions allowed in its context, e.g. "cutscene".
            bindings.BindActions(script, context, Await, () => ActionsStarted++);
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
            if (Status != LuaExecutionStatus.Running) return;
            try
            {
                _elapsed += deltaTime;
                if (_elapsed >= _timeout) { Finish(LuaExecutionStatus.TimedOut, "Execution deadline exceeded."); return; }
                // Keep Lua paused while the current action is still running.
                if (_pending != null)
                {
                    _pending.Tick(deltaTime);
                    if (_pending.Status == LuaExecutionStatus.Running) return;
                    var status = _pending.Status;
                    var error = _pending.Error;
                    var completed = _pending;
                    _pending = null;
                    completed.Dispose();
                    if (status != LuaExecutionStatus.Succeeded) { Finish(status, error); return; }
                    _slices = 0;
                }
                // Run a little Lua this frame so a long script cannot freeze the game.
                _routine.Resume();
                if (_routine.State == CoroutineState.Dead) { Finish(LuaExecutionStatus.Succeeded, null); return; }
                // Lua may pause for an action or because it used up this frame's CPU budget.
                if (_pending == null && _routine.State != CoroutineState.ForceSuspended)
                    throw new InvalidOperationException("Unexpected Lua suspension.");
                // Stop scripts that keep using their full CPU budget, such as an endless loop.
                if (_pending == null && ++_slices >= MaxInstructionSlices)
                    Finish(LuaExecutionStatus.Failed, "Lua script exceeded its instruction budget.");
            }
            catch (Exception exception)
            {
                Finish(LuaExecutionStatus.Failed, exception is InterpreterException lua ? lua.DecoratedMessage : exception.Message);
            }
        }

        public void Cancel() { if (Status == LuaExecutionStatus.Running) Finish(LuaExecutionStatus.Cancelled, null); }
        public void Dispose() => Cancel();

        private void Finish(LuaExecutionStatus status, string error)
        {
            // Mark the run as finished before cleanup, so later ticks do nothing.
            Status = status;
            Error = error == null ? null : $"{Source}: {error}";
            var pending = _pending;
            _pending = null;
            pending?.Dispose(); // There may be no action to clean up.
        }
    }
}
