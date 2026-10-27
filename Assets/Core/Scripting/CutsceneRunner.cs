using System;
using System.Collections.Generic;
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
using DG.Tweening;

namespace Core.Scripting
{
    /// <summary>Owns one live-world cutscene, including staging, terminal commit and cleanup.</summary>
    [DefaultExecutionOrder(300)]
    public sealed class CutsceneRunner : Singleton<CutsceneRunner>, IEventListener<DayTransitionStarted>
    {
        private CutsceneCatalog _catalog;
        [ShowInInspector, ReadOnly] private CutscenePresentationSettings _presentation;
        private readonly VulcanusLuaEngine _completionActions = new();
        private LevelManager _level;
        private UrGUIManager _gui;
        private MainCharacter _player;
        private enum TransitionPhase { None, EntranceCover, EntranceReveal, ExitCover, ExitReveal }
        private TransitionPhase _transitionPhase;
        private Tween _transition;
        private bool _finishRequested, _completionCommitted, _settlingOutcome;
        [field: NonSerialized]
        [ShowInInspector, ReadOnly] public CutsceneRun ActiveRun { get; private set; }
        [ShowInInspector, ReadOnly] public string CurrentStepId => ActiveRun?.CurrentStepId;
        public bool IsRunning => ActiveRun != null;
        public event Action<CutsceneRun> Started;
        public event Action<CutsceneRun> Finished;

        protected override void OnAwake()
        {
            _catalog = CatalogResources.Load<CutsceneCatalog>(CutsceneCatalog.ResourceName);
            _presentation = Resources.Load<CutscenePresentationSettings>(CutscenePresentationSettings.ResourceName);
            if (!_presentation) throw new InvalidOperationException("Cutscenes require Resources/CutscenePresentation settings.");
            _presentation.RequireValidConfiguration();
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
            if (GameState.Story.CompletedCutscenes.Contains(definition.CutsceneId)) return false;
            var player = MainCharacter.CurrentMainCharacter;
            if (!player || !player.IsRuntimeInitialized) throw new InvalidOperationException("Cutscenes require the initialized player.");
            if (player.IsControlBlocked || player.Controller.IsMovementOwned) return false;

            // Resolve everything before acquiring control. A bad reference cannot leave half a scene staged.
            var bindings = CutsceneBindings.BindCurrentMap(definition, VulcanusDialogueRunner.Instance,
                out var characters);
            var placements = CutscenePlacement.Prepare(definition, bindings, characters);
            if (placements.Any(placement => placement.Character.IsControlBlocked || placement.Character.Controller.IsMovementOwned)) return false;
            var session = VulcanusLuaEngine.StartSession(bindings, definition.Lua, definition.CutsceneId);
            run = new CutsceneRun(this, definition, session, placements, bindings, characters);
            ActiveRun = run;
            // Character-only modules are absent for cutscenes containing just waits/dialogue.
            characters?.BeginRun(run);
            _player = player;
            _player.OnConditionStateChanged += OnPlayerConditionChanged;
            _player.SetControlBlocked(run, true);
            foreach (var placement in placements) placement.Character.SetControlBlocked(run, true);
            _gui.SetCutsceneActive(true);
            try
            {
                if (definition.Transition.Enabled)
                {
                    _transitionPhase = TransitionPhase.EntranceCover;
                    _transition = _gui.CoverCutscene(_presentation.FadeSeconds, _presentation.HoldSeconds);
                }
                else StartSequence(run);
            }
            catch
            {
                Finish(run, completed: false, notify: false);
                throw;
            }
            return true;
        }

        private void StartSequence(CutsceneRun run)
        {
            ExecuteImmediate(run, run.Definition.OnStartLua, run.Definition.OnStart, "setup");
            Started?.Invoke(run);
        }

        private void Update()
        {
            var run = ActiveRun;
            if (run == null) return;
            try
            {
                AdvanceTransition(run);
                if (!ReferenceEquals(ActiveRun, run)) return;
                if (Input.InputManager.Instance.SkipCutscenePressed && Skip(run)) return;
                if (_transitionPhase == TransitionPhase.EntranceCover) return;
                if (_finishRequested)
                {
                    if (_transitionPhase == TransitionPhase.None) BeginExit(run);
                    return;
                }
                foreach (var placement in run.Placements) placement.RequireLive();
                run.Session.Tick(Time.deltaTime);
                if (!run.Session.IsRunning) RequestCompletion(run);
            }
            catch (Exception error)
            {
                Cancel(run);
                throw new InvalidOperationException(DescribeError(run, error.Message), error);
            }
        }

        private void AdvanceTransition(CutsceneRun run)
        {
            if (_transitionPhase == TransitionPhase.None || (_transition.IsActive() && !_transition.IsComplete())) return;
            switch (_transitionPhase)
            {
                case TransitionPhase.EntranceCover:
                    StartSequence(run);
                    if (!ReferenceEquals(ActiveRun, run)) return;
                    _transitionPhase = TransitionPhase.EntranceReveal;
                    _transition = _gui.RevealCutscene(_presentation.RevealSeconds);
                    break;
                case TransitionPhase.EntranceReveal:
                    _transitionPhase = TransitionPhase.None;
                    _transition = null;
                    break;
                case TransitionPhase.ExitCover:
                    _completionCommitted = ApplyOutcome(run, completed: true);
                    _transitionPhase = TransitionPhase.ExitReveal;
                    _transition = _gui.RevealCutscene(_presentation.RevealSeconds);
                    break;
                case TransitionPhase.ExitReveal:
                    Finish(run, completed: true);
                    break;
            }
        }

        private void RequestCompletion(CutsceneRun run)
        {
            // Skip freezes script progression now; the active action is disposed under the exit cover.
            _finishRequested = true;
            if (_transitionPhase == TransitionPhase.None) BeginExit(run);
        }

        private void BeginExit(CutsceneRun run)
        {
            if (!run.Definition.Transition.Enabled) { Finish(run, completed: true); return; }
            _transitionPhase = TransitionPhase.ExitCover;
            _transition = _gui.CoverCutscene(_presentation.FadeSeconds, _presentation.HoldSeconds);
        }

        private static string DescribeError(CutsceneRun run, string message) => run.CurrentStepId is string step
            ? $"{run.Definition.CutsceneId}, step '{step}': {message}"
            : $"{run.Definition.CutsceneId}: {message}";

        public void Cancel() { if (ActiveRun != null) Cancel(ActiveRun); }
        internal void Cancel(CutsceneRun run) => Finish(run, completed: false);
        public void OnEvent(DayTransitionStarted change) => Cancel();
        private void OnPlayerConditionChanged(ConditionState condition) { if (condition != ConditionState.Normal) Cancel(); }

        internal bool Skip(CutsceneRun run)
        {
            if (!ReferenceEquals(ActiveRun, run) || !run.IsRunning || _finishRequested || !run.Definition.AllowSkip) return false;
            run.Skipped = true;
            RequestCompletion(run);
            return true;
        }

        private static void ExecuteImmediate(CutsceneRun run, string lua, IReadOnlyList<CutsceneStep> steps, string phase)
        {
            if (steps.Count == 0) return; // An explicitly empty setup/completion block is valid.
            using var session = VulcanusLuaEngine.StartSession(run.Bindings, lua, $"{run.Definition.CutsceneId}:{phase}", phase: phase);
            try
            {
                // Phase registration forbids awaitables; only instruction-budget slices can suspend this script.
                while (session.IsRunning) session.Tick(0);
            }
            catch (Exception error)
            {
                var step = session.ActionsStarted > 0 ? $", step '{steps[session.ActionsStarted - 1].Id}'" : "";
                throw new InvalidOperationException($"{run.Definition.CutsceneId}, {phase}{step}: {error.Message}", error);
            }
        }

        private bool ApplyOutcome(CutsceneRun run, bool completed)
        {
            // Completion actions can publish events that re-enter cancellation.
            _settlingOutcome = true;
            try
            {
                run.Session.Dispose();
                if (completed) foreach (var placement in run.Placements) placement.RequireLive();
                foreach (var placement in run.Placements) placement.Apply(completed);
                if (completed)
                {
                    ExecuteImmediate(run, run.Definition.OnComplete.Lua, run.Definition.OnComplete.Steps, "completion");
                    _completionActions.Execute(run.Definition.OnComplete.Actions);
                    GameState.Story.CompletedCutscenes.Add(run.Definition.CutsceneId);
                }
                return completed;
            }
            catch
            {
                foreach (var placement in run.Placements) placement.Apply(false);
                throw;
            }
            finally { _settlingOutcome = false; }
        }

        private void Finish(CutsceneRun run, bool completed, bool notify = true)
        {
            if (!ReferenceEquals(ActiveRun, run) || !run.IsRunning || _settlingOutcome) return;
            // Cleanup can close UI and invoke callbacks. Mark the run terminal before any of them can re-enter.
            run.IsRunning = false;
            var committed = _completionCommitted;
            try
            {
                if (!committed) committed = ApplyOutcome(run, completed);
            }
            finally
            {
                if (_transitionPhase != TransitionPhase.None) _gui.ResetTransition();
                _transition = null;
                _transitionPhase = TransitionPhase.None;
                _finishRequested = _completionCommitted = false;
                foreach (var placement in run.Placements)
                    if (placement.Character) placement.Character.SetControlBlocked(run, false);
                run.Characters?.FinishSpawns(keep: committed);
                if (_player)
                {
                    _player.OnConditionStateChanged -= OnPlayerConditionChanged;
                    _player.SetControlBlocked(run, false);
                }
                _player = null;
                _gui.SetCutsceneActive(false);
                ActiveRun = null;
            }
            // Completion actions, placements and ownership are settled before listeners can start another scene or save.
            if (notify) Finished?.Invoke(run);
        }
    }
}
