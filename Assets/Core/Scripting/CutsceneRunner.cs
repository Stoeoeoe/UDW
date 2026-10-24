using System;
using System.Linq;
using Character;
using Core.Catalogs;
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
        private CutsceneCatalog _catalog;
        private LevelManager _level;
        private UrGUIManager _gui;
        private MainCharacter _player;
        [field: NonSerialized]
        [ShowInInspector, ReadOnly] public CutsceneRun ActiveRun { get; private set; }
        [ShowInInspector, ReadOnly] public string CurrentStepId => ActiveRun?.CurrentStepId;
        public bool IsRunning => ActiveRun != null;
        public event Action<CutsceneRun> Started;
        public event Action<CutsceneRun> Finished;

        protected override void OnAwake()
        {
            _catalog = CatalogResources.Load<CutsceneCatalog>(CutsceneCatalog.ResourceName);
        }

        private void OnEnable()
        {
            _level = LevelManager.Instance;
            _gui = UrGUIManager.Instance;
            _level.LocationLeaving += Cancel;
            _gui.TransitionInterrupted += Cancel;
            this.Subscribe<DayTransitionStarted>();
        }

        private void OnDisable()
        {
            Cancel();
            _level.LocationLeaving -= Cancel;
            _gui.TransitionInterrupted -= Cancel;
            this.Unsubscribe<DayTransitionStarted>();
        }

        public CutsceneDefinition Resolve(string id) => _catalog.Get(id)
            ?? throw new InvalidOperationException($"Unknown or disabled cutscene '{id}'.");

        public bool TryStart(string id, out CutsceneRun run) => TryStart(Resolve(id), out run);

        public bool TryStart(CutsceneDefinition definition, out CutsceneRun run)
        {
            if (!definition) throw new ArgumentNullException(nameof(definition));
            run = null;
            if (!isActiveAndEnabled || IsRunning || !_level.SceneReady || UrGUIManager.HasOpenScreens) return false;
            definition.RequireValidConfiguration();
            if (GameState.Story.CompletedCutscenes.ContainsKey(definition.CutsceneId)) return false;
            var player = MainCharacter.CurrentMainCharacter;
            if (!player || !player.IsRuntimeInitialized) throw new InvalidOperationException("Cutscenes require the initialized player.");
            if (player.IsControlBlocked || player.Controller.IsMovementOwned) return false;

            // Resolve everything before acquiring control. A bad reference cannot leave half a scene staged.
            var bindings = CutsceneBindings.BindCurrentMap(definition, VulcanusDialogueRunner.Instance,
                out var actors, out var cutscene);
            var placements = CutscenePlacement.Prepare(definition, bindings, actors);
            if (placements.Any(placement => placement.Actor.IsControlBlocked || placement.Actor.Controller.IsMovementOwned)) return false;
            var session = VulcanusLuaEngine.StartSession(bindings, definition.Lua, definition.CutsceneId);
            run = new CutsceneRun(this, definition, session, placements, cutscene);
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

        private static string DescribeError(CutsceneRun run, string message) => run.CurrentStepId is string step
            ? $"{run.Definition.CutsceneId}, step '{step}': {message}"
            : $"{run.Definition.CutsceneId}: {message}";

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
                    GameState.Story.CompletedCutscenes[run.Definition.CutsceneId] = run.Outcome;
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
            // Outcome, placements and ownership are settled before listeners can start another scene or save.
            if (status == CutsceneRunStatus.Failed) Debug.LogError(error, this);
            Finished?.Invoke(run);
        }
    }
}
