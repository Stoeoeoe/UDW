using System;
using System.Linq;
using Character;
using Core.Dialogue.Vulcanus;
using Core.Events;
using Core.Game;
using Core.Location;
using Core.TimeAndWeather;
using UI.Shared;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Owns one live-world cutscene, including staging, terminal commit and cleanup.</summary>
    [DefaultExecutionOrder(300)]
    public sealed class CutsceneRunner : Singleton<CutsceneRunner>, IEventListener<DayTransitionStarted>
    {
        [SerializeField] private CutsceneCatalog catalog;
        [SerializeField] private float movementTimeoutSeconds = 30f;
        [SerializeField] private float runTimeoutSeconds = 120f;
        private LevelManager _level;
        private UrGUIManager _gui;
        private MainCharacter _player;
        [field: NonSerialized]
        [ShowInInspector, ReadOnly] public CutsceneRun ActiveRun { get; private set; }
        [ShowInInspector, ReadOnly] public string CurrentStepId =>
            ActiveRun == null || ActiveRun.Session.ActionsStarted == 0 ? null :
                ActiveRun.Definition.Steps[ActiveRun.Session.ActionsStarted - 1].Id;
        public bool IsRunning => ActiveRun != null;
        public event Action<CutsceneRun> Started;
        public event Action<CutsceneRun> Finished;

        protected override void OnAwake()
        {
            if (!catalog) throw new InvalidOperationException("CutsceneRunner requires its cutscene catalog.");
            if (!float.IsFinite(movementTimeoutSeconds) || movementTimeoutSeconds <= 0 ||
                !float.IsFinite(runTimeoutSeconds) || runTimeoutSeconds <= 0)
                throw new InvalidOperationException("Cutscene timeouts must be finite and positive.");
            _level = LevelManager.Instance ?? throw new InvalidOperationException("CutsceneRunner requires LevelManager.");
            _gui = UrGUIManager.Instance ?? throw new InvalidOperationException("CutsceneRunner requires UrGUIManager.");
            if (!GameStateManager.Instance) throw new InvalidOperationException("CutsceneRunner requires GameStateManager.");
        }

        private void OnEnable()
        {
            _level.LocationLeaving += Cancel;
            _gui.TransitionInterrupted += Cancel;
            this.Subscribe<DayTransitionStarted>();
        }

        private void OnDisable()
        {
            Cancel();
            // Unity can disable services in either order during shutdown.
            if (_level) _level.LocationLeaving -= Cancel;
            if (_gui) _gui.TransitionInterrupted -= Cancel;
            this.Unsubscribe<DayTransitionStarted>();
        }

        public CutsceneDefinition Resolve(string id) => catalog.Get(id)
            ?? throw new InvalidOperationException($"Unknown or disabled cutscene '{id}'.");

        public bool TryStart(string id, out CutsceneRun run) => TryStart(Resolve(id), out run);

        public bool TryStart(CutsceneDefinition definition, out CutsceneRun run)
        {
            if (!definition) throw new ArgumentNullException(nameof(definition));
            run = null;
            if (!isActiveAndEnabled || IsRunning || !_level.SceneReady || UrGUIManager.HasOpenScreens) return false;
            definition.RequireValidConfiguration();
            if (definition.Completion.Flag.Length > 0 && GameState.Story.HasFlag(definition.Completion.Flag)) return false;
            var player = MainCharacter.CurrentMainCharacter;
            if (!player || !player.IsRuntimeInitialized) throw new InvalidOperationException("Cutscenes require the initialized player.");
            if (player.IsControlBlocked || player.Controller.IsMovementOwned) return false;

            // Resolve everything before acquiring control. A bad reference cannot leave half a scene staged.
            var bindings = CutsceneBindings.BindCurrentMap(definition, VulcanusDialogueRunner.Instance,
                movementTimeoutSeconds, out var actors);
            var placements = CutscenePlacement.Prepare(definition, bindings, actors);
            if (placements.Any(placement => placement.Actor.IsControlBlocked || placement.Actor.Controller.IsMovementOwned)) return false;
            var session = VulcanusLuaEngine.StartSession(bindings, definition.Lua, definition.CutsceneId, timeoutSeconds: runTimeoutSeconds);
            run = new CutsceneRun(this, definition, session, placements);
            ActiveRun = run;
            _player = player;
            _player.OnConditionStateChanged += OnPlayerConditionChanged;
            _player.SetControlBlocked(run, true);
            foreach (var placement in placements) placement.Actor.SetControlBlocked(run, true);
            _gui.SetCutsceneActive(true);
            Started?.Invoke(run);
            return true;
        }

        private void Update()
        {
            var run = ActiveRun;
            if (run == null) return;
            if (Input.InputManager.Instance.SkipCutscenePressed && Skip(run)) return;
            try
            {
                foreach (var placement in run.Placements) placement.RequireLive();
                run.Session.Tick(Time.deltaTime);
                if (run.Session.Status == LuaExecutionStatus.Succeeded) Finish(run, CutsceneRunStatus.Completed);
                else if (run.Session.Status != LuaExecutionStatus.Running)
                    Finish(run, CutsceneRunStatus.Failed, DescribeError(run, run.Session.Error));
            }
            catch (Exception error) { Finish(run, CutsceneRunStatus.Failed, DescribeError(run, error.Message)); }
        }

        private static string DescribeError(CutsceneRun run, string message)
        {
            // Imported scripts make one call per authored step. Counting action entry also
            // identifies a host action that fails several frames after Lua has yielded.
            var count = run.Session.ActionsStarted;
            return count == 0 ? $"{run.Definition.CutsceneId}: {message}" :
                $"{run.Definition.CutsceneId}, step '{run.Definition.Steps[count - 1].Id}': {message}";
        }

        public void Cancel() { if (ActiveRun != null) Cancel(ActiveRun); }
        internal void Cancel(CutsceneRun run) => Finish(run, CutsceneRunStatus.Cancelled);
        public void OnEvent(DayTransitionStarted change) => Cancel();
        private void OnPlayerConditionChanged(ConditionState condition) { if (condition != ConditionState.Normal) Cancel(); }

        internal bool Skip(CutsceneRun run)
        {
            if (!ReferenceEquals(ActiveRun, run) || run.Status != CutsceneRunStatus.Running || !run.Definition.AllowSkip) return false;
            Finish(run, CutsceneRunStatus.Skipped);
            return true;
        }

        private void Finish(CutsceneRun run, CutsceneRunStatus status, string error = null)
        {
            if (!ReferenceEquals(ActiveRun, run) || run.Status != CutsceneRunStatus.Running) return;
            // Cleanup can close UI and invoke callbacks. Mark the run terminal before any of them can re-enter.
            run.Status = status;
            try
            {
                run.Session.Dispose();
                var completed = status is CutsceneRunStatus.Completed or CutsceneRunStatus.Skipped;
                if (completed) foreach (var placement in run.Placements) placement.RequireLive();
                foreach (var placement in run.Placements) placement.Apply(completed);
                if (completed)
                {
                    foreach (var flag in run.Definition.Completion.SetFlags) GameState.Story.SetFlag(flag);
                    if (run.Definition.Completion.Flag.Length > 0) GameState.Story.SetFlag(run.Definition.Completion.Flag);
                }
            }
            catch (Exception failure)
            {
                status = CutsceneRunStatus.Failed;
                error = failure.Message;
                foreach (var placement in run.Placements) placement.Apply(false);
            }
            finally
            {
                foreach (var placement in run.Placements)
                    if (placement.Actor) placement.Actor.SetControlBlocked(run, false);
                if (_player)
                {
                    _player.OnConditionStateChanged -= OnPlayerConditionChanged;
                    _player.SetControlBlocked(run, false);
                }
                _player = null;
                _gui.SetCutsceneActive(false);
                run.Status = status;
                run.Error = error;
                ActiveRun = null;
            }
            // Flags, placements and ownership are settled before listeners can start another scene or save.
            if (status == CutsceneRunStatus.Failed) Debug.LogError(error, this);
            Finished?.Invoke(run);
        }
    }
}
